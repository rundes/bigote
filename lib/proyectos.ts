import { crearClienteServidor } from "@/lib/supabase/server";

export type Tarea = {
  id: string;
  titulo: string;
  descripcion: string;
  dificultad: number;
  estado: "pendiente" | "en_curso" | "hecha";
  asignado_a: string | null;
};

export type TareaAsignada = Tarea & { asignado_nombre: string };

export type TareaConProyecto = Tarea & { proyecto: { id: string; nombre: string } };

// supabase-js tipa las relaciones anidadas belongs-to como objeto, pero en
// runtime a veces llegan envueltas en un array de un elemento según cómo
// se resuelva la FK; esta ayuda normaliza ambas formas (mismo patrón que
// lib/org.ts) sin cambiar las firmas exportadas.
function primero<T>(valor: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(valor)) return valor[0];
  return valor ?? undefined;
}

type ProyectoListaFila = {
  id: string;
  nombre: string;
  estado: string;
  proyecto_miembros: { perfil_id: string }[] | null;
};

export async function listarProyectos(
  orgId: string
): Promise<{ id: string; nombre: string; estado: string; miembros: number; pendientes: number }[]> {
  const supabase = await crearClienteServidor();

  // Nota: `proyecto_miembros(count)` requiere el toggle de "aggregate
  // functions" de PostgREST (apagado por defecto) y no se puede dar por
  // sentado sin verificar en el proyecto hosted; por eso se trae el embed
  // plano (filas, no agregado) y se cuenta en JS, igual que "pendientes".
  const { data: filas } = await supabase
    .from("proyectos")
    .select("id, nombre, estado, proyecto_miembros(perfil_id)")
    .eq("org_id", orgId)
    .returns<ProyectoListaFila[]>();
  const proyectos = filas ?? [];
  if (proyectos.length === 0) return [];

  // Segunda (y última) query: estados de todas las tareas de estos proyectos,
  // para computar "pendientes" en JS (no se puede filtrar un count anidado
  // por columna con supabase-js v2 en un único select).
  const ids = proyectos.map((p) => p.id);
  const { data: tareas } = await supabase
    .from("tareas")
    .select("proyecto_id, estado")
    .in("proyecto_id", ids)
    .returns<{ proyecto_id: string; estado: string }[]>();

  const pendientesPorProyecto = new Map<string, number>();
  for (const t of tareas ?? []) {
    if (t.estado === "pendiente") {
      pendientesPorProyecto.set(t.proyecto_id, (pendientesPorProyecto.get(t.proyecto_id) ?? 0) + 1);
    }
  }

  return proyectos
    .map((p) => ({
      id: p.id,
      nombre: p.nombre,
      estado: p.estado,
      miembros: (p.proyecto_miembros ?? []).length,
      pendientes: pendientesPorProyecto.get(p.id) ?? 0,
    }))
    .sort((a, b) => {
      if (a.estado === b.estado) return 0;
      return a.estado === "activo" ? -1 : 1;
    });
}

type MiembroFila = {
  perfil_id: string;
  perfiles: { nombre: string }[] | { nombre: string } | null;
};

export async function obtenerProyecto(proyectoId: string): Promise<{
  id: string;
  nombre: string;
  estado: string;
  org_id: string;
  miembros: { perfil_id: string; nombre: string }[];
  pool: Tarea[];
  asignadas: TareaAsignada[];
  hechas: TareaAsignada[];
} | null> {
  const supabase = await crearClienteServidor();

  const { data: proyecto } = await supabase
    .from("proyectos")
    .select("id, nombre, estado, org_id")
    .eq("id", proyectoId)
    .maybeSingle();
  if (!proyecto) return null;

  const { data: miembrosFilas } = await supabase
    .from("proyecto_miembros")
    .select("perfil_id, perfiles(nombre)")
    .eq("proyecto_id", proyectoId)
    .returns<MiembroFila[]>();
  const miembros = (miembrosFilas ?? []).map((m) => ({
    perfil_id: m.perfil_id,
    nombre: primero(m.perfiles)?.nombre ?? "",
  }));

  type TareaFila = {
    id: string;
    titulo: string;
    descripcion: string;
    dificultad: number;
    estado: "pendiente" | "en_curso" | "hecha";
    asignado_a: string | null;
    completada_por: string | null;
    completada_at: string | null;
  };
  const { data: tareasFilas } = await supabase
    .from("tareas")
    .select("id, titulo, descripcion, dificultad, estado, asignado_a, completada_por, completada_at")
    .eq("proyecto_id", proyectoId)
    .returns<TareaFila[]>();
  const tareas = tareasFilas ?? [];

  const idsPerfiles = Array.from(
    new Set(
      tareas
        .flatMap((t) => [t.asignado_a, t.completada_por])
        .filter((id): id is string => Boolean(id))
    )
  );
  const nombrePorPerfil = new Map<string, string>();
  if (idsPerfiles.length > 0) {
    const { data: perfiles } = await supabase
      .from("perfiles")
      .select("id, nombre")
      .in("id", idsPerfiles)
      .returns<{ id: string; nombre: string }[]>();
    for (const p of perfiles ?? []) nombrePorPerfil.set(p.id, p.nombre);
  }

  const aTarea = (t: TareaFila): Tarea => ({
    id: t.id,
    titulo: t.titulo,
    descripcion: t.descripcion,
    dificultad: t.dificultad,
    estado: t.estado,
    asignado_a: t.asignado_a,
  });

  const pool = tareas
    .filter((t) => t.asignado_a === null && t.estado === "pendiente")
    .map(aTarea);

  const asignadas = tareas
    .filter((t) => t.asignado_a !== null && t.estado !== "hecha")
    .map((t) => ({ ...aTarea(t), asignado_nombre: nombrePorPerfil.get(t.asignado_a as string) ?? "" }));

  const hechas = tareas
    .filter((t) => t.estado === "hecha")
    .sort((a, b) => (b.completada_at ?? "").localeCompare(a.completada_at ?? ""))
    .slice(0, 10)
    .map((t) => ({
      ...aTarea(t),
      asignado_nombre: nombrePorPerfil.get(t.completada_por ?? t.asignado_a ?? "") ?? "",
    }));

  return {
    id: proyecto.id,
    nombre: proyecto.nombre,
    estado: proyecto.estado,
    org_id: proyecto.org_id,
    miembros,
    pool,
    asignadas,
    hechas,
  };
}

type TareaConProyectoFila = {
  id: string;
  titulo: string;
  descripcion: string;
  dificultad: number;
  estado: "pendiente" | "en_curso" | "hecha";
  asignado_a: string | null;
  proyectos: { id: string; nombre: string; org_id: string }[] | { id: string; nombre: string; org_id: string } | null;
};

function aTareaConProyecto(t: TareaConProyectoFila): TareaConProyecto {
  const proyecto = primero(t.proyectos);
  return {
    id: t.id,
    titulo: t.titulo,
    descripcion: t.descripcion,
    dificultad: t.dificultad,
    estado: t.estado,
    asignado_a: t.asignado_a,
    proyecto: { id: proyecto?.id ?? "", nombre: proyecto?.nombre ?? "" },
  };
}

export async function misTareas(
  orgId: string,
  perfilId: string
): Promise<{ asignadas: TareaConProyecto[]; pools: TareaConProyecto[] }> {
  const supabase = await crearClienteServidor();

  const { data: proyectosOrg } = await supabase
    .from("proyectos")
    .select("id")
    .eq("org_id", orgId)
    .returns<{ id: string }[]>();
  const idsProyectosOrg = (proyectosOrg ?? []).map((p) => p.id);
  if (idsProyectosOrg.length === 0) return { asignadas: [], pools: [] };

  const columnas = "id, titulo, descripcion, dificultad, estado, asignado_a, proyectos(id, nombre, org_id)";

  const { data: asignadasFilas } = await supabase
    .from("tareas")
    .select(columnas)
    .in("proyecto_id", idsProyectosOrg)
    .eq("asignado_a", perfilId)
    .neq("estado", "hecha")
    .returns<TareaConProyectoFila[]>();
  const asignadas = (asignadasFilas ?? []).map(aTareaConProyecto);

  const { data: membresiasProyecto } = await supabase
    .from("proyecto_miembros")
    .select("proyecto_id")
    .eq("perfil_id", perfilId)
    .in("proyecto_id", idsProyectosOrg)
    .returns<{ proyecto_id: string }[]>();
  const idsProyectosMiembro = (membresiasProyecto ?? []).map((m) => m.proyecto_id);

  let pools: TareaConProyecto[] = [];
  if (idsProyectosMiembro.length > 0) {
    const { data: poolFilas } = await supabase
      .from("tareas")
      .select(columnas)
      .in("proyecto_id", idsProyectosMiembro)
      .is("asignado_a", null)
      .eq("estado", "pendiente")
      .returns<TareaConProyectoFila[]>();
    pools = (poolFilas ?? []).map(aTareaConProyecto);
  }

  return { asignadas, pools };
}

export async function listarMiembrosOrg(orgId: string): Promise<{ perfil_id: string; nombre: string }[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("membresias")
    .select("perfil_id, perfiles(nombre)")
    .eq("org_id", orgId)
    .eq("activo", true)
    .returns<{ perfil_id: string; perfiles: { nombre: string }[] | { nombre: string } | null }[]>();
  return (data ?? []).map((m) => ({
    perfil_id: m.perfil_id,
    nombre: primero(m.perfiles)?.nombre ?? "",
  }));
}
