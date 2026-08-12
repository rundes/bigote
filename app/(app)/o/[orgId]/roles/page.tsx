import { redirect } from "next/navigation";
import { obtenerContextoOrg } from "@/lib/org";
import { listarRoles } from "@/lib/equipo";
import { SheetRol } from "@/componentes/equipo/SheetRol";

const ETIQUETAS: {
  clave: "proyectos" | "equipo" | "finanzas" | "espacios" | "inventario" | "admin";
  nombre: string;
}[] = [
  { clave: "proyectos", nombre: "proyectos" },
  { clave: "equipo", nombre: "equipo" },
  { clave: "finanzas", nombre: "finanzas" },
  { clave: "espacios", nombre: "espacios" },
  { clave: "inventario", nombre: "inventario" },
  { clave: "admin", nombre: "admin" },
];

export default async function PaginaRoles({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto) redirect("/");
  if (!contexto.permisos.admin) redirect(`/o/${orgId}/sin-acceso`);

  const roles = await listarRoles(orgId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-tinta">Roles y permisos</h1>
        <SheetRol orgId={orgId} rol={null} />
      </div>

      <p className="max-w-[70ch] text-sm text-tinta-suave">
        Cada miembro tiene un rol, y el rol define qué puede ver y hacer. Los cambios aplican al
        instante para todo el mundo con ese rol.
      </p>

      {roles.length === 0 ? (
        <p className="text-sm text-tinta-suave">Todavía no hay roles. Creá el primero.</p>
      ) : (
        <div className="flex flex-col">
          {roles.map((rol) => {
            const activos = ETIQUETAS.filter((e) => rol.permisos[e.clave]).map((e) => e.nombre);
            return (
              <div
                key={rol.id}
                className="flex min-h-14 items-center justify-between gap-3 border-b border-linea py-2 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-tinta">{rol.nombre}</p>
                  <p className="truncate text-sm text-tinta-suave">
                    {activos.length > 0 ? activos.join(" · ") : "Sin permisos"}
                  </p>
                </div>
                <SheetRol orgId={orgId} rol={rol} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
