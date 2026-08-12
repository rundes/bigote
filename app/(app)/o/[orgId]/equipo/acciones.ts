"use server";

import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { obtenerContextoOrg, type Permisos } from "@/lib/org";

type Resultado = { error?: string };

const SIN_ADMIN = "La organización no puede quedar sin administración.";

function revalidarEquipo(orgId: string) {
  revalidatePath(`/o/${orgId}/equipo`);
  revalidatePath(`/o/${orgId}/roles`);
}

async function verificarAdmin(orgId: string): Promise<Resultado | null> {
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto || !contexto.permisos.admin) {
    return { error: "Solo administración puede gestionar el equipo." };
  }
  return null;
}

// Anti-lockout: simula la mutación sobre el estado actual de membresías y
// roles y verifica que siga existiendo al menos un miembro activo cuyo rol
// tenga permiso admin. Cubre cambiar rol, desactivar y editar un rol.
async function quedaAdministracion(
  orgId: string,
  mutacion:
    | { tipo: "cambiar_rol"; perfilId: string; rolId: string }
    | { tipo: "desactivar"; perfilId: string }
    | { tipo: "editar_rol"; rolId: string; admin: boolean }
): Promise<boolean> {
  const supabase = await crearClienteServidor();

  const [{ data: membresias }, { data: roles }] = await Promise.all([
    supabase
      .from("membresias")
      .select("perfil_id, rol_id, activo")
      .eq("org_id", orgId)
      .returns<{ perfil_id: string; rol_id: string; activo: boolean }[]>(),
    supabase
      .from("roles")
      .select("id, permisos")
      .eq("org_id", orgId)
      .returns<{ id: string; permisos: Permisos }[]>(),
  ]);

  const esRolAdmin = new Map((roles ?? []).map((r) => [r.id, r.permisos.admin]));
  if (mutacion.tipo === "editar_rol") esRolAdmin.set(mutacion.rolId, mutacion.admin);

  return (membresias ?? []).some((m) => {
    if (mutacion.tipo === "desactivar" && m.perfil_id === mutacion.perfilId) return false;
    const rolId =
      mutacion.tipo === "cambiar_rol" && m.perfil_id === mutacion.perfilId
        ? mutacion.rolId
        : m.rol_id;
    return m.activo && (esRolAdmin.get(rolId) ?? false);
  });
}

async function rolDeLaOrg(orgId: string, rolId: string): Promise<boolean> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("roles")
    .select("id")
    .eq("id", rolId)
    .eq("org_id", orgId)
    .maybeSingle();
  return Boolean(data);
}

export async function invitarMiembro(orgId: string, formData: FormData): Promise<Resultado> {
  const guard = await verificarAdmin(orgId);
  if (guard) return guard;

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return { error: "Escribí un email válido." };
  const rolId = String(formData.get("rol_id") ?? "");
  if (!(await rolDeLaOrg(orgId, rolId))) return { error: "Elegí un rol de la organización." };

  const admin = crearClienteAdmin();

  // Mismo flujo que /plataforma: invitar; si ya está registrado (422),
  // ubicarlo por email y solo crear la membresía.
  let perfilId: string | null = null;
  const { data: invitado, error: errorInvite } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/confirm`,
  });
  if (errorInvite) {
    const yaExiste =
      errorInvite.status === 422 || /already.*registered/i.test(errorInvite.message);
    if (!yaExiste) return { error: errorInvite.message };
    const { data: usuarios, error: errorList } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (errorList) return { error: "No pudimos ubicar al usuario existente." };
    const existente = usuarios.users.find((u) => u.email === email);
    if (!existente) return { error: "Ese email ya está registrado pero no lo pudimos encontrar." };
    perfilId = existente.id;
  } else {
    perfilId = invitado.user.id;
  }

  const supabase = await crearClienteServidor();
  const { data: membresia } = await supabase
    .from("membresias")
    .select("activo")
    .eq("org_id", orgId)
    .eq("perfil_id", perfilId)
    .maybeSingle<{ activo: boolean }>();

  if (membresia?.activo) return { error: "Ya es parte de la organización." };

  if (membresia) {
    const { error } = await supabase
      .from("membresias")
      .update({ activo: true, rol_id: rolId })
      .eq("org_id", orgId)
      .eq("perfil_id", perfilId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("membresias")
      .insert({ org_id: orgId, perfil_id: perfilId, rol_id: rolId, activo: true });
    if (error) return { error: error.message };
  }

  revalidarEquipo(orgId);
  return {};
}

export async function cambiarRol(orgId: string, perfilId: string, rolId: string): Promise<Resultado> {
  const guard = await verificarAdmin(orgId);
  if (guard) return guard;
  if (!(await rolDeLaOrg(orgId, rolId))) return { error: "Elegí un rol de la organización." };

  if (!(await quedaAdministracion(orgId, { tipo: "cambiar_rol", perfilId, rolId }))) {
    return { error: SIN_ADMIN };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("membresias")
    .update({ rol_id: rolId })
    .eq("org_id", orgId)
    .eq("perfil_id", perfilId);
  if (error) return { error: error.message };

  revalidarEquipo(orgId);
  return {};
}

export async function desactivarMiembro(orgId: string, perfilId: string): Promise<Resultado> {
  const guard = await verificarAdmin(orgId);
  if (guard) return guard;

  if (!(await quedaAdministracion(orgId, { tipo: "desactivar", perfilId }))) {
    return { error: SIN_ADMIN };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("membresias")
    .update({ activo: false })
    .eq("org_id", orgId)
    .eq("perfil_id", perfilId);
  if (error) return { error: error.message };

  revalidarEquipo(orgId);
  return {};
}

export async function reactivarMiembro(orgId: string, perfilId: string): Promise<Resultado> {
  const guard = await verificarAdmin(orgId);
  if (guard) return guard;

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("membresias")
    .update({ activo: true })
    .eq("org_id", orgId)
    .eq("perfil_id", perfilId);
  if (error) return { error: error.message };

  revalidarEquipo(orgId);
  return {};
}

function leerPermisos(formData: FormData): Permisos {
  return {
    proyectos: formData.get("proyectos") === "on",
    equipo: formData.get("equipo") === "on",
    finanzas: formData.get("finanzas") === "on",
    espacios: formData.get("espacios") === "on",
    admin: formData.get("admin") === "on",
    inventario: formData.get("inventario") === "on",
  };
}

export async function crearRol(orgId: string, formData: FormData): Promise<Resultado> {
  const guard = await verificarAdmin(orgId);
  if (guard) return guard;

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { error: "El nombre es obligatorio." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("roles")
    .insert({ org_id: orgId, nombre, permisos: leerPermisos(formData) });
  if (error) return { error: error.message };

  revalidarEquipo(orgId);
  return {};
}

export async function editarRol(orgId: string, rolId: string, formData: FormData): Promise<Resultado> {
  const guard = await verificarAdmin(orgId);
  if (guard) return guard;
  if (!(await rolDeLaOrg(orgId, rolId))) return { error: "El rol no existe." };

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { error: "El nombre es obligatorio." };
  const permisos = leerPermisos(formData);

  if (!(await quedaAdministracion(orgId, { tipo: "editar_rol", rolId, admin: permisos.admin }))) {
    return { error: SIN_ADMIN };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("roles")
    .update({ nombre, permisos })
    .eq("id", rolId)
    .eq("org_id", orgId);
  if (error) return { error: error.message };

  revalidarEquipo(orgId);
  return {};
}

/**
 * Corrige el nombre de un miembro. Va por el cliente admin a propósito: la
 * policy `perfiles_update` es `id = auth.uid()`, así que ni quien administra
 * puede arreglar un nombre mal cargado desde la sesión normal.
 */
export async function editarMiembro(
  orgId: string,
  perfilId: string,
  formData: FormData
): Promise<Resultado> {
  const guard = await verificarAdmin(orgId);
  if (guard) return guard;

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { error: "Poné un nombre." };
  if (nombre.length > 80) return { error: "El nombre es muy largo." };

  // Solo si es miembro de esta organización: sin este chequeo, quien administra
  // una org podría renombrar a cualquier persona de la plataforma.
  const supabase = await crearClienteServidor();
  const { data: membresia } = await supabase
    .from("membresias")
    .select("perfil_id")
    .eq("org_id", orgId)
    .eq("perfil_id", perfilId)
    .maybeSingle();
  if (!membresia) return { error: "Esa persona no es de la organización." };

  const admin = crearClienteAdmin();
  const { error } = await admin.from("perfiles").update({ nombre }).eq("id", perfilId);
  if (error) return { error: "No pudimos guardar el nombre." };

  revalidarEquipo(orgId);
  return {};
}

/**
 * Alta directa: crea la cuenta con una contraseña puesta por quien administra,
 * sin pasar por el mail de invitación. Existe para cuando el mail no llega o la
 * persona no tiene acceso a su casilla en el momento.
 */
export async function altaDirecta(orgId: string, formData: FormData): Promise<Resultado> {
  const guard = await verificarAdmin(orgId);
  if (guard) return guard;

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return { error: "Escribí un email válido." };

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { error: "Poné un nombre." };

  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "La contraseña tiene que tener al menos 8 caracteres." };

  const rolId = String(formData.get("rol_id") ?? "");
  if (!(await rolDeLaOrg(orgId, rolId))) return { error: "Elegí un rol de la organización." };

  const admin = crearClienteAdmin();
  const { data: creado, error: errorCrear } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  let perfilId: string;
  if (errorCrear) {
    const yaExiste =
      errorCrear.status === 422 || /already.*registered/i.test(errorCrear.message);
    if (!yaExiste) return { error: errorCrear.message };
    // Ya tiene cuenta: no se le pisa la contraseña, solo se lo suma a la org.
    const { data: usuarios, error: errorList } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (errorList) return { error: "No pudimos ubicar al usuario existente." };
    const existente = usuarios.users.find((u) => u.email === email);
    if (!existente) return { error: "Ese email ya está registrado pero no lo pudimos encontrar." };
    perfilId = existente.id;
  } else {
    perfilId = creado.user.id;
  }

  await admin.from("perfiles").update({ nombre }).eq("id", perfilId);

  const supabase = await crearClienteServidor();
  const { data: membresia } = await supabase
    .from("membresias")
    .select("activo")
    .eq("org_id", orgId)
    .eq("perfil_id", perfilId)
    .maybeSingle<{ activo: boolean }>();

  if (membresia?.activo) return { error: "Ya es parte de la organización." };

  const { error } = membresia
    ? await supabase
        .from("membresias")
        .update({ activo: true, rol_id: rolId })
        .eq("org_id", orgId)
        .eq("perfil_id", perfilId)
    : await supabase
        .from("membresias")
        .insert({ org_id: orgId, perfil_id: perfilId, rol_id: rolId, activo: true });
  if (error) return { error: error.message };

  revalidarEquipo(orgId);
  return {};
}
