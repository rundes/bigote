import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { obtenerContextoOrg } from "@/lib/org";
import { obtenerProyecto, listarMiembrosOrg } from "@/lib/proyectos";
import { FilaTarea } from "@/componentes/tareas/FilaTarea";
import { SheetNuevaTarea } from "@/componentes/tareas/SheetNuevaTarea";
import { EquipoProyecto } from "@/componentes/proyectos/EquipoProyecto";
import { MenuProyecto } from "@/componentes/proyectos/MenuProyecto";

export default async function PaginaProyecto({
  params,
}: {
  params: Promise<{ orgId: string; proyectoId: string }>;
}) {
  const { orgId, proyectoId } = await params;
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto) redirect("/");

  const proyecto = await obtenerProyecto(proyectoId);
  if (!proyecto || proyecto.org_id !== orgId) notFound();

  const puedeGestionar = contexto.permisos.proyectos || contexto.permisos.admin;
  const miembrosOrg = puedeGestionar ? await listarMiembrosOrg(orgId) : [];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Link
          href={`/o/${orgId}/tareas`}
          className="text-sm text-tinta-suave transition hover:text-tinta"
        >
          ← Tareas
        </Link>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-tinta">
            {proyecto.nombre}
            {proyecto.estado === "archivado" && (
              <span className="ml-2 text-sm font-normal text-tinta-suave">(archivado)</span>
            )}
          </h1>
          {puedeGestionar && (
            <MenuProyecto proyectoId={proyecto.id} nombreActual={proyecto.nombre} />
          )}
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-tinta">Pool</h2>
          {puedeGestionar && <SheetNuevaTarea proyectoId={proyecto.id} miembros={miembrosOrg} />}
        </div>
        {proyecto.pool.length === 0 ? (
          <p className="text-sm text-tinta-suave">No hay tareas en el pool.</p>
        ) : (
          <div className="flex flex-col">
            {proyecto.pool.map((t) => (
              <FilaTarea key={t.id} tarea={t} accion="tomar" orgId={orgId} proyectoId={proyecto.id} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-tinta">Asignadas</h2>
        {proyecto.asignadas.length === 0 ? (
          <p className="text-sm text-tinta-suave">No hay tareas asignadas.</p>
        ) : (
          <div className="flex flex-col">
            {proyecto.asignadas.map((t) => (
              <FilaTarea
                key={t.id}
                tarea={t}
                accion={
                  t.asignado_a === contexto.perfilId || contexto.permisos.admin
                    ? "completar"
                    : undefined
                }
                orgId={orgId}
                proyectoId={proyecto.id}
                subtitulo={t.asignado_nombre}
              />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-tinta">Hechas</h2>
        {proyecto.hechas.length === 0 ? (
          <p className="text-sm text-tinta-suave">Todavía no se completó ninguna.</p>
        ) : (
          <div className="flex flex-col">
            {proyecto.hechas.map((t) => (
              <FilaTarea
                key={t.id}
                tarea={t}
                orgId={orgId}
                proyectoId={proyecto.id}
                subtitulo={t.asignado_nombre}
                tachada
              />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-tinta">Equipo</h2>
        <EquipoProyecto
          proyectoId={proyecto.id}
          miembros={proyecto.miembros}
          todosDeLaOrg={miembrosOrg}
          puedeGestionar={puedeGestionar}
        />
      </section>
    </div>
  );
}
