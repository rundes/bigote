import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerContextoOrg } from "@/lib/org";
import { listarProyectos, misTareas } from "@/lib/proyectos";
import { FilaTarea } from "@/componentes/tareas/FilaTarea";
import { SheetNuevoProyecto } from "@/componentes/proyectos/SheetNuevoProyecto";

export default async function PaginaTareas({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto) redirect("/");

  const [{ asignadas, pools }, proyectos] = await Promise.all([
    misTareas(orgId, contexto.perfilId),
    listarProyectos(orgId),
  ]);

  const puedeGestionar = contexto.permisos.proyectos || contexto.permisos.admin;
  const activos = proyectos.filter((p) => p.estado !== "archivado");
  const archivados = proyectos.filter((p) => p.estado === "archivado");
  const sinTareas = asignadas.length === 0 && pools.length === 0;

  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-2xl font-semibold text-tinta">Tareas</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-tinta">Tus tareas</h2>

        {sinTareas ? (
          <p className="text-sm text-tinta-suave">Estás al día.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {asignadas.length > 0 && (
              <div className="flex flex-col">
                {asignadas.map((t) => (
                  <FilaTarea
                    key={t.id}
                    tarea={t}
                    accion="completar"
                    orgId={orgId}
                    proyectoId={t.proyecto.id}
                    subtitulo={t.proyecto.nombre}
                  />
                ))}
              </div>
            )}

            {pools.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-tinta-suave">
                  Del pool de tus proyectos
                </p>
                <div className="flex flex-col">
                  {pools.map((t) => (
                    <FilaTarea
                      key={t.id}
                      tarea={t}
                      accion="tomar"
                      orgId={orgId}
                      proyectoId={t.proyecto.id}
                      subtitulo={t.proyecto.nombre}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-tinta">Proyectos</h2>
          {puedeGestionar && <SheetNuevoProyecto orgId={orgId} />}
        </div>

        {proyectos.length === 0 ? (
          <p className="text-sm text-tinta-suave">
            Todavía no hay proyectos. Creá el primero y sumá al equipo.
          </p>
        ) : (
          <div className="flex flex-col">
            {[...activos, ...archivados].map((p) => (
              <Link
                key={p.id}
                href={`/o/${orgId}/tareas/${p.id}`}
                className="flex min-h-11 items-center justify-between gap-3 border-b border-linea py-3 last:border-b-0"
              >
                <span
                  className={`text-sm ${p.estado === "archivado" ? "text-tinta-suave" : "text-tinta"}`}
                >
                  {p.nombre}
                  {p.estado === "archivado" && " (archivado)"}
                </span>
                <span className="shrink-0 text-xs text-tinta-suave">
                  {p.pendientes} pendientes · {p.miembros} personas
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
