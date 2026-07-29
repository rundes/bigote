"use server";

import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";
import { obtenerContextoOrg } from "@/lib/org";

type Resultado = { error?: string };

// Los RPC de Task 1 hacen `raise exception '<mensaje>'`; el mensaje puede
// llegar con un código Postgres antepuesto (p. ej. "P0001: <mensaje>")
// según cómo lo propague el driver. Esta ayuda deja solo el texto legible.
function mensajeLegible(error: { message: string }): string {
  return error.message.replace(/^[A-Za-z0-9]{5}:\s*/, "").trim();
}

function revalidarProyectos(orgId: string, proyectoId?: string) {
  revalidatePath(`/o/${orgId}`);
  revalidatePath(`/o/${orgId}/tareas`);
  if (proyectoId) revalidatePath(`/o/${orgId}/tareas/${proyectoId}`);
}

async function verificarGestion(orgId: string): Promise<Resultado | null> {
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto || !(contexto.permisos.proyectos || contexto.permisos.admin)) {
    return { error: "No tenés permiso para gestionar proyectos." };
  }
  return null;
}

async function orgDeProyecto(proyectoId: string): Promise<string | null> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("proyectos")
    .select("org_id")
    .eq("id", proyectoId)
    .maybeSingle();
  return data?.org_id ?? null;
}

export async function crearProyecto(orgId: string, formData: FormData): Promise<Resultado> {
  const guard = await verificarGestion(orgId);
  if (guard) return guard;

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { error: "El nombre es obligatorio." };

  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No hay sesión activa." };

  const { data: proyecto, error } = await supabase
    .from("proyectos")
    .insert({ org_id: orgId, nombre, creado_por: user.id })
    .select("id")
    .single();
  if (error || !proyecto) {
    return { error: error?.message ?? "No pudimos crear el proyecto." };
  }

  const { error: errorMiembro } = await supabase
    .from("proyecto_miembros")
    .insert({ proyecto_id: proyecto.id, perfil_id: user.id });
  if (errorMiembro) return { error: errorMiembro.message };

  revalidarProyectos(orgId, proyecto.id);
  return {};
}

export async function renombrarProyecto(proyectoId: string, formData: FormData): Promise<Resultado> {
  const orgId = await orgDeProyecto(proyectoId);
  if (!orgId) return { error: "El proyecto no existe." };
  const guard = await verificarGestion(orgId);
  if (guard) return guard;

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { error: "El nombre es obligatorio." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("proyectos").update({ nombre }).eq("id", proyectoId);
  if (error) return { error: error.message };

  revalidarProyectos(orgId, proyectoId);
  return {};
}

export async function archivarProyecto(proyectoId: string): Promise<Resultado> {
  const orgId = await orgDeProyecto(proyectoId);
  if (!orgId) return { error: "El proyecto no existe." };
  const guard = await verificarGestion(orgId);
  if (guard) return guard;

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("proyectos").update({ estado: "archivado" }).eq("id", proyectoId);
  if (error) return { error: error.message };

  revalidarProyectos(orgId, proyectoId);
  return {};
}

export async function agregarMiembro(proyectoId: string, perfilId: string): Promise<Resultado> {
  const orgId = await orgDeProyecto(proyectoId);
  if (!orgId) return { error: "El proyecto no existe." };
  const guard = await verificarGestion(orgId);
  if (guard) return guard;

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("proyecto_miembros")
    .insert({ proyecto_id: proyectoId, perfil_id: perfilId });
  if (error) return { error: error.message };

  revalidarProyectos(orgId, proyectoId);
  return {};
}

export async function quitarMiembro(proyectoId: string, perfilId: string): Promise<Resultado> {
  const orgId = await orgDeProyecto(proyectoId);
  if (!orgId) return { error: "El proyecto no existe." };
  const guard = await verificarGestion(orgId);
  if (guard) return guard;

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("proyecto_miembros")
    .delete()
    .eq("proyecto_id", proyectoId)
    .eq("perfil_id", perfilId);
  if (error) return { error: error.message };

  revalidarProyectos(orgId, proyectoId);
  return {};
}

export async function crearTarea(proyectoId: string, formData: FormData): Promise<Resultado> {
  const orgId = await orgDeProyecto(proyectoId);
  if (!orgId) return { error: "El proyecto no existe." };
  const guard = await verificarGestion(orgId);
  if (guard) return guard;

  const titulo = String(formData.get("titulo") ?? "").trim();
  if (!titulo) return { error: "El título es obligatorio." };
  const descripcion = String(formData.get("descripcion") ?? "").trim();
  const dificultad = Number(formData.get("dificultad"));
  if (!Number.isInteger(dificultad) || dificultad < 1 || dificultad > 5) {
    return { error: "La dificultad debe ser un número entre 1 y 5." };
  }
  const asignadoRaw = String(formData.get("asignado_a") ?? "").trim();
  const asignado_a = asignadoRaw ? asignadoRaw : null;

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("tareas").insert({
    proyecto_id: proyectoId,
    titulo,
    descripcion,
    dificultad,
    asignado_a,
  });
  if (error) return { error: error.message };

  revalidarProyectos(orgId, proyectoId);
  return {};
}

export async function borrarTarea(tareaId: string): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { data: tarea } = await supabase
    .from("tareas")
    .select("proyecto_id, proyectos(org_id)")
    .eq("id", tareaId)
    .maybeSingle();
  if (!tarea) return { error: "La tarea no existe." };
  const proyectoInfo = tarea.proyectos as { org_id: string }[] | { org_id: string } | null;
  const orgId = Array.isArray(proyectoInfo) ? proyectoInfo[0]?.org_id : proyectoInfo?.org_id;
  if (!orgId) return { error: "La tarea no existe." };
  const guard = await verificarGestion(orgId);
  if (guard) return guard;

  const { error } = await supabase.from("tareas").delete().eq("id", tareaId);
  if (error) return { error: error.message };

  revalidarProyectos(orgId, tarea.proyecto_id);
  return {};
}

export async function tomarTarea(tareaId: string, orgId: string, proyectoId?: string): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("tomar_tarea", { tarea: tareaId });
  if (error) return { error: mensajeLegible(error) };

  revalidarProyectos(orgId, proyectoId);
  return {};
}

export async function soltarTarea(tareaId: string, orgId: string, proyectoId?: string): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("soltar_tarea", { tarea: tareaId });
  if (error) return { error: mensajeLegible(error) };

  revalidarProyectos(orgId, proyectoId);
  return {};
}

export async function completarTarea(tareaId: string, orgId: string, proyectoId?: string): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("completar_tarea", { tarea: tareaId });
  if (error) return { error: mensajeLegible(error) };

  revalidarProyectos(orgId, proyectoId);
  return {};
}
