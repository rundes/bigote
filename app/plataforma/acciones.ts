"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";

async function verificarSuperAdmin() {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { data } = await supabase
    .from("super_admins")
    .select("perfil_id")
    .eq("perfil_id", user.id)
    .maybeSingle();
  if (!data) redirect("/");
  return { supabase, user };
}

export async function crearOrgConAdmin(
  formData: FormData
): Promise<{ error: string } | void> {
  const { supabase } = await verificarSuperAdmin();

  const nombre = String(formData.get("nombre") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!nombre || !tipo || !email) {
    return { error: "Completá todos los campos." };
  }

  const { data: orgId, error: errorRpc } = await supabase.rpc("crear_organizacion", {
    nombre,
    tipo,
    email_admin: email,
  });
  if (errorRpc || !orgId) {
    return { error: errorRpc?.message ?? "No pudimos crear la organización." };
  }

  const admin = crearClienteAdmin();

  let perfilId: string | null = null;
  const { data: invitado, error: errorInvite } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/confirm`,
  });
  if (errorInvite) {
    const yaExiste =
      errorInvite.status === 422 || /already.*registered/i.test(errorInvite.message);
    if (!yaExiste) {
      return { error: errorInvite.message };
    }
    const { data: usuarios, error: errorList } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (errorList) {
      return { error: "No pudimos ubicar al usuario existente." };
    }
    const existente = usuarios.users.find((u) => u.email === email);
    if (!existente) {
      return { error: "Ese email ya está registrado pero no lo pudimos encontrar." };
    }
    perfilId = existente.id;
  } else {
    perfilId = invitado.user.id;
  }

  const { data: rolAdmin, error: errorRol } = await admin
    .from("roles")
    .select("id")
    .eq("org_id", orgId)
    .eq("nombre", "Administración")
    .single();
  if (errorRol || !rolAdmin) {
    return { error: "No pudimos encontrar el rol de Administración de la nueva organización." };
  }

  const { error: errorMembresia } = await admin.from("membresias").insert({
    org_id: orgId,
    perfil_id: perfilId,
    rol_id: rolAdmin.id,
    activo: true,
  });
  if (errorMembresia) {
    return { error: "No pudimos crear la membresía del primer admin." };
  }

  revalidatePath("/plataforma");
}

export async function editarOrg(
  orgId: string,
  formData: FormData
): Promise<{ error?: string }> {
  await verificarSuperAdmin();

  const nombre = String(formData.get("nombre") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "").trim();
  if (!nombre) return { error: "Poné un nombre." };
  if (!["empresa", "asociacion_civil", "otro"].includes(tipo)) {
    return { error: "Elegí un tipo válido." };
  }

  // Cliente admin: la policy organizaciones_admin exige `tiene_permiso(id,
  // 'admin')`, y un super admin no es necesariamente miembro de la org.
  const admin = crearClienteAdmin();
  const { error } = await admin
    .from("organizaciones")
    .update({ nombre, tipo })
    .eq("id", orgId);
  if (error) return { error: "No pudimos guardar los cambios." };

  revalidatePath("/plataforma");
  return {};
}

/**
 * Borra una organización y todo lo que cuelga de ella. Es irreversible: el
 * cascade se lleva roles, membresías, proyectos, tareas, clientes, edificios,
 * salas, reservas, planes, movimientos, notificaciones, inventario y cobros.
 *
 * Pide el nombre tipeado porque un click sobre el botón equivocado en una
 * lista no debería poder vaciar una organización entera.
 */
export async function borrarOrg(
  orgId: string,
  nombreConfirmado: string
): Promise<{ error?: string }> {
  await verificarSuperAdmin();

  const admin = crearClienteAdmin();
  const { data: org } = await admin
    .from("organizaciones")
    .select("nombre")
    .eq("id", orgId)
    .maybeSingle<{ nombre: string }>();
  if (!org) return { error: "Esa organización ya no existe." };

  if (nombreConfirmado.trim() !== org.nombre) {
    return { error: "El nombre no coincide. Escribilo exactamente igual." };
  }

  const { error } = await admin.from("organizaciones").delete().eq("id", orgId);
  if (error) {
    // org_gestora_id no cascadea: si esta org gestiona el edificio de otra, la
    // FK lo impide. Es correcto que falle, pero el mensaje tiene que explicarlo.
    if (error.code === "23503") {
      return {
        error:
          "No se puede borrar: esta organización gestiona edificios de otra. Sacale la gestión primero.",
      };
    }
    return { error: "No pudimos borrar la organización." };
  }

  revalidatePath("/plataforma");
  return {};
}
