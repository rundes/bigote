import { crearClienteServidor } from "@/lib/supabase/server";
import type { Permisos } from "@/lib/org";

export type Miembro = {
  perfil_id: string;
  nombre: string;
  email: string;
  activo: boolean;
  rol_id: string;
  rol_nombre: string;
  es_admin: boolean;
};

export type Rol = {
  id: string;
  nombre: string;
  permisos: Permisos;
};

// supabase-js tipa las relaciones anidadas belongs-to como objeto, pero en
// runtime a veces llegan envueltas en un array de un elemento; misma ayuda
// que en lib/org.ts.
function primero<T>(valor: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(valor)) return valor[0];
  return valor ?? undefined;
}

type MiembroFila = {
  perfil_id: string;
  activo: boolean;
  rol_id: string;
  perfiles: { nombre: string; email: string }[] | { nombre: string; email: string } | null;
  roles: { nombre: string; permisos: Permisos }[] | { nombre: string; permisos: Permisos } | null;
};

export async function listarMiembros(orgId: string): Promise<Miembro[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("membresias")
    .select("perfil_id, activo, rol_id, perfiles(nombre, email), roles(nombre, permisos)")
    .eq("org_id", orgId)
    .returns<MiembroFila[]>();

  return (data ?? [])
    .map((m) => {
      const perfil = primero(m.perfiles);
      const rol = primero(m.roles);
      return {
        perfil_id: m.perfil_id,
        nombre: perfil?.nombre ?? "",
        email: perfil?.email ?? "",
        activo: m.activo,
        rol_id: m.rol_id,
        rol_nombre: rol?.nombre ?? "",
        es_admin: rol?.permisos.admin ?? false,
      };
    })
    .sort((a, b) => {
      if (a.activo !== b.activo) return a.activo ? -1 : 1;
      return a.nombre.localeCompare(b.nombre, "es");
    });
}

export async function listarRoles(orgId: string): Promise<Rol[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("roles")
    .select("id, nombre, permisos")
    .eq("org_id", orgId)
    .order("nombre")
    .returns<Rol[]>();
  return data ?? [];
}
