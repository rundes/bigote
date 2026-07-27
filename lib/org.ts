import { crearClienteServidor } from "@/lib/supabase/server";

export type Permisos = {
  proyectos: boolean; equipo: boolean; finanzas: boolean; espacios: boolean; admin: boolean;
};
export type ContextoOrg = {
  org: { id: string; nombre: string };
  permisos: Permisos;
  perfilId: string;
};

// supabase-js tipa las relaciones anidadas belongs-to como objeto, pero en
// runtime a veces llegan envueltas en un array de un elemento según cómo
// se resuelva la FK; esta ayuda normaliza ambas formas sin cambiar las
// firmas exportadas.
function primero<T>(valor: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(valor)) return valor[0];
  return valor ?? undefined;
}

export async function obtenerContextoOrg(orgId: string): Promise<ContextoOrg | null> {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("membresias")
    .select("activo, roles(permisos), organizaciones(id, nombre)")
    .eq("org_id", orgId)
    .eq("perfil_id", user.id)
    .eq("activo", true)
    .maybeSingle();
  if (!data?.organizaciones) return null;
  const rol = primero(data.roles as unknown as { permisos: Permisos } | { permisos: Permisos }[]);
  const org = primero(
    data.organizaciones as unknown as { id: string; nombre: string } | { id: string; nombre: string }[]
  );
  if (!rol || !org) return null;
  return { org, permisos: rol.permisos, perfilId: user.id };
}

export async function listarMisOrgs(): Promise<{ id: string; nombre: string }[]> {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("membresias")
    .select("organizaciones(id, nombre)")
    .eq("perfil_id", user.id)
    .eq("activo", true);
  return (data ?? [])
    .map((m) =>
      primero(
        m.organizaciones as unknown as { id: string; nombre: string } | { id: string; nombre: string }[]
      )
    )
    .filter((org): org is { id: string; nombre: string } => Boolean(org));
}
