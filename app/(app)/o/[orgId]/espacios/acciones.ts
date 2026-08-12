"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { obtenerContextoOrg } from "@/lib/org";

type Resultado = { error?: string };

// Los RPC hacen `raise exception '<mensaje>'`; el mensaje puede llegar con un
// código Postgres antepuesto (p. ej. "P0001: <mensaje>") según cómo lo
// propague el driver. Esta ayuda deja solo el texto legible.
function mensajeLegible(error: { message: string }): string {
  return error.message.replace(/^[A-Za-z0-9]{5}:\s*/, "").trim();
}

function revalidarEspacios(orgId: string, edificioId?: string) {
  revalidatePath(`/o/${orgId}/espacios`);
  if (edificioId) revalidatePath(`/o/${orgId}/espacios/${edificioId}`);
}

// Permiso `espacios` sobre este edificio en particular (propietaria o
// gestora): mismo criterio que las políticas RLS, resuelto en el servidor
// por la función SQL security definer.
async function verificarAdministra(edificioId: string): Promise<Resultado | null> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("administra_edificio", { edificio: edificioId });
  if (error || !data) return { error: "No tenés permiso para administrar este espacio." };
  return null;
}

export async function crearEdificio(orgId: string, formData: FormData): Promise<Resultado> {
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto || !contexto.permisos.espacios) {
    return { error: "No tenés permiso para administrar espacios." };
  }

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { error: "El nombre es obligatorio." };
  const direccion = String(formData.get("direccion") ?? "").trim();
  const descripcion = String(formData.get("descripcion") ?? "").trim();

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("edificios").insert({
    org_propietaria_id: orgId,
    nombre,
    direccion,
    descripcion,
  });
  if (error) return { error: error.message };

  revalidarEspacios(orgId);
  return {};
}

export async function editarEdificio(
  orgId: string,
  edificioId: string,
  formData: FormData
): Promise<Resultado> {
  const guard = await verificarAdministra(edificioId);
  if (guard) return guard;

  const direccion = String(formData.get("direccion") ?? "").trim();
  const descripcion = String(formData.get("descripcion") ?? "").trim();
  const destino = String(formData.get("destino_ingresos") ?? "propietaria");
  if (!["propietaria", "gestora", "reparto"].includes(destino)) {
    return { error: "Elegí a dónde van los ingresos." };
  }
  const gestoraRaw = String(formData.get("org_gestora_id") ?? "").trim();
  const org_gestora_id = gestoraRaw ? gestoraRaw : null;
  if (destino !== "propietaria" && !org_gestora_id) {
    return { error: "Para ese destino de ingresos hace falta una organización gestora." };
  }

  let porcentaje_propietaria: number | null = null;
  if (destino === "reparto") {
    porcentaje_propietaria = Number(formData.get("porcentaje_propietaria"));
    if (!Number.isFinite(porcentaje_propietaria) || porcentaje_propietaria < 0 || porcentaje_propietaria > 100) {
      return { error: "El porcentaje de la propietaria va de 0 a 100." };
    }
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("edificios")
    .update({
      direccion,
      descripcion,
      destino_ingresos: destino,
      porcentaje_propietaria,
      org_gestora_id,
    })
    .eq("id", edificioId);
  if (error) return { error: error.message };

  revalidarEspacios(orgId, edificioId);
  return {};
}

export async function crearSala(
  orgId: string,
  edificioId: string,
  formData: FormData
): Promise<Resultado> {
  const guard = await verificarAdministra(edificioId);
  if (guard) return guard;

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { error: "El nombre es obligatorio." };
  const tipo = String(formData.get("tipo") ?? "publica");
  if (!["publica", "privada"].includes(tipo)) return { error: "Elegí el tipo de sala." };
  const descripcion = String(formData.get("descripcion") ?? "").trim();

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("salas")
    .insert({ edificio_id: edificioId, nombre, tipo, descripcion });
  if (error) return { error: error.message };

  revalidarEspacios(orgId, edificioId);
  return {};
}

export async function editarSala(
  orgId: string,
  edificioId: string,
  salaId: string,
  formData: FormData
): Promise<Resultado> {
  const guard = await verificarAdministra(edificioId);
  if (guard) return guard;

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { error: "El nombre es obligatorio." };
  const tipo = String(formData.get("tipo") ?? "publica");
  if (!["publica", "privada"].includes(tipo)) return { error: "Elegí el tipo de sala." };
  const descripcion = String(formData.get("descripcion") ?? "").trim();
  const activa = formData.get("activa") === "on";

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("salas")
    .update({ nombre, tipo, descripcion, activa })
    .eq("id", salaId)
    .eq("edificio_id", edificioId);
  if (error) return { error: error.message };

  revalidarEspacios(orgId, edificioId);
  return {};
}

function leerPlan(formData: FormData): { error?: string; valores?: { nombre: string; gratuito: boolean; precio_hora: number; solo_salas_publicas: boolean; requiere_pago_previo: boolean } } {
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { error: "El nombre es obligatorio." };
  const gratuito = formData.get("gratuito") === "on";
  const solo_salas_publicas = formData.get("solo_salas_publicas") === "on";
  const requiere_pago_previo = formData.get("requiere_pago_previo") === "on";
  let precio_hora = 0;
  if (!gratuito) {
    precio_hora = Number(formData.get("precio_hora"));
    if (!Number.isFinite(precio_hora) || precio_hora <= 0) {
      return { error: "El precio por hora tiene que ser mayor a cero." };
    }
  }
  return { valores: { nombre, gratuito, precio_hora, solo_salas_publicas, requiere_pago_previo } };
}

export async function crearPlan(orgId: string, formData: FormData): Promise<Resultado> {
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto || !contexto.permisos.espacios) {
    return { error: "No tenés permiso para administrar espacios." };
  }

  const { error: errorLectura, valores } = leerPlan(formData);
  if (errorLectura || !valores) return { error: errorLectura };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("planes_reserva").insert({ org_id: orgId, ...valores });
  if (error) return { error: error.message };

  revalidarEspacios(orgId);
  return {};
}

export async function editarPlan(
  orgId: string,
  edificioId: string,
  planId: string,
  formData: FormData
): Promise<Resultado> {
  const { error: errorLectura, valores } = leerPlan(formData);
  if (errorLectura || !valores) return { error: errorLectura };

  // La política planes_write (permiso `espacios` en la org dueña del plan)
  // recorta el update; si no alcanza, 0 filas y avisamos.
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("planes_reserva")
    .update(valores)
    .eq("id", planId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No tenés permiso para editar este plan." };

  revalidarEspacios(orgId, edificioId);
  return {};
}

export async function crearReserva(orgId: string, formData: FormData): Promise<Resultado> {
  const sala = String(formData.get("sala") ?? "");
  const plan = String(formData.get("plan") ?? "");
  const dia = String(formData.get("fecha") ?? "");
  const inicio = Number(formData.get("hora_inicio"));
  const duracion = Number(formData.get("horas"));
  const clienteRaw = String(formData.get("cliente") ?? "").trim();

  if (!sala || !plan || !dia) return { error: "Faltan datos de la reserva." };
  if (!Number.isInteger(inicio) || inicio < 8 || inicio > 21) {
    return { error: "Elegí una hora de inicio entre las 8 y las 21." };
  }
  if (!Number.isInteger(duracion) || duracion < 1 || inicio + duracion > 22) {
    return { error: "La reserva tiene que terminar a las 22 como máximo." };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("crear_reserva", {
    sala,
    plan,
    dia,
    inicio,
    duracion,
    cliente: clienteRaw ? clienteRaw : null,
  });
  if (error) return { error: mensajeLegible(error) };

  revalidarEspacios(orgId);
  return {};
}

export async function cancelarReserva(
  orgId: string,
  reservaId: string,
  motivo: string
): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("cancelar_reserva", { reserva: reservaId, motivo });
  if (error) return { error: mensajeLegible(error) };

  revalidarEspacios(orgId);
  return {};
}

export async function crearClienteRapido(
  orgId: string,
  orgPropietariaId: string,
  nombre: string,
  contacto: string,
  email?: string
): Promise<Resultado & { id?: string }> {
  const limpio = nombre.trim();
  if (!limpio) return { error: "El nombre es obligatorio." };

  // El email no es obligatorio, pero sin él la reserva con pago previo no se
  // puede crear: la RPC no tiene a dónde mandar los datos de la cuenta.
  const mail = (email ?? "").trim();
  if (mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) {
    return { error: "Ese email no parece válido." };
  }

  // La política clientes_insert valida la membresía (directa o por
  // co-gestión) contra la org propietaria del edificio.
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("clientes")
    .insert({ org_id: orgPropietariaId, nombre: limpio, contacto: contacto.trim() || null, email: mail || null })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "No pudimos crear el cliente." };

  revalidarEspacios(orgId);
  return { id: data.id };
}

const EXTENSIONES_FOTO = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]);
const EXTENSIONES_VIDEO = new Set(["mp4", "webm", "mov", "m4v"]);

export async function pedirSubidaMedia(
  edificioId: string,
  tipo: "foto" | "video",
  extension: string
): Promise<Resultado & { path?: string; token?: string }> {
  const guard = await verificarAdministra(edificioId);
  if (guard) return guard;

  const ext = extension.toLowerCase().replace(/[^a-z0-9]/g, "");
  const validas = tipo === "foto" ? EXTENSIONES_FOTO : EXTENSIONES_VIDEO;
  if (!validas.has(ext)) {
    return {
      error:
        tipo === "foto"
          ? "Formato de foto no soportado (jpg, png, webp, gif o avif)."
          : "Formato de video no soportado (mp4, webm, mov o m4v).",
    };
  }

  // El guard de arriba ya validó el permiso: la URL firmada se emite con el
  // cliente admin porque el token de subida no depende de la sesión.
  const admin = crearClienteAdmin();
  const path = `${edificioId}/${randomUUID()}.${ext}`;
  const { data, error } = await admin.storage.from("espacios").createSignedUploadUrl(path);
  if (error || !data) return { error: "No pudimos preparar la subida. Probá de nuevo." };

  return { path: data.path, token: data.token };
}

export async function registrarMedia(
  orgId: string,
  edificioId: string,
  salaId: string | null,
  tipo: "foto" | "video",
  path: string
): Promise<Resultado> {
  const guard = await verificarAdministra(edificioId);
  if (guard) return guard;
  if (!path.startsWith(`${edificioId}/`)) return { error: "La subida no corresponde a este edificio." };

  const supabase = await crearClienteServidor();
  const { data: maxOrden } = await supabase
    .from("espacio_media")
    .select("orden")
    .eq(salaId ? "sala_id" : "edificio_id", salaId ?? edificioId)
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle<{ orden: number }>();

  const { error } = await supabase.from("espacio_media").insert({
    edificio_id: salaId ? null : edificioId,
    sala_id: salaId,
    tipo,
    storage_path: path,
    orden: (maxOrden?.orden ?? -1) + 1,
  });
  if (error) return { error: error.message };

  revalidarEspacios(orgId, edificioId);
  return {};
}

export async function borrarMedia(
  orgId: string,
  edificioId: string,
  mediaId: string
): Promise<Resultado> {
  const guard = await verificarAdministra(edificioId);
  if (guard) return guard;

  const supabase = await crearClienteServidor();
  const { data: media } = await supabase
    .from("espacio_media")
    .select("id, storage_path")
    .eq("id", mediaId)
    .maybeSingle<{ id: string; storage_path: string }>();
  if (!media) return { error: "La foto o el video ya no existe." };
  if (!media.storage_path.startsWith(`${edificioId}/`)) {
    return { error: "La foto o el video no corresponde a este edificio." };
  }

  const { error } = await supabase.from("espacio_media").delete().eq("id", mediaId);
  if (error) return { error: error.message };

  const admin = crearClienteAdmin();
  await admin.storage.from("espacios").remove([media.storage_path]);

  revalidarEspacios(orgId, edificioId);
  return {};
}
