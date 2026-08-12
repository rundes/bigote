import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { obtenerContextoOrg } from "@/lib/org";
import { listarProyectos, misTareas } from "@/lib/proyectos";
import { FilaTarea } from "@/componentes/tareas/FilaTarea";
import { SheetNuevoProyecto } from "@/componentes/proyectos/SheetNuevoProyecto";

type Proyecto = Awaited<ReturnType<typeof listarProyectos>>[number];

function FilaProyecto({ orgId, proyecto }: { orgId: string; proyecto: Proyecto }) {
  const archivado = proyecto.estado === "archivado";
  return (
    <Link
      href={`/o/${orgId}/tareas/${proyecto.id}`}
      className="flex min-h-11 items-center gap-3 py-3 transition hover:bg-linea/20"
    >
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm ${archivado ? "text-tinta-suave" : "font-medium text-tinta"}`}>
          {proyecto.nombre}
        </span>
        <span className="block text-xs text-tinta-suave">
          {proyecto.miembros} {proyecto.miembros === 1 ? "persona" : "personas"}
          {archivado && " · archivado"}
        </span>
      </span>
      {/* El pendiente es el dato que se busca al escanear la lista: va con peso
          y alineado a la derecha, no perdido en el gris del subtítulo. */}
      <span className="shrink-0 text-right">
        <span
          className={`block text-sm font-semibold tabular-nums ${
            proyecto.pendientes === 0 ? "text-tinta-suave" : "text-tinta"
          }`}
        >
          {proyecto.pendientes}
        </span>
        <span className="block text-xs text-tinta-suave">
          {proyecto.pendientes === 1 ? "pendiente" : "pendientes"}
        </span>
      </span>
    </Link>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[13px] text-tinta-suave">{titulo}</p>
      <div className="mt-1 flex flex-col">{children}</div>
    </div>
  );
}

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
  const pendientesTotales = activos.reduce((a, p) => a + p.pendientes, 0);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold text-tinta">Tareas</h1>
        <p className="mt-1 text-sm text-tinta-suave">
          {asignadas.length > 0
            ? `Tenés ${asignadas.length} ${asignadas.length === 1 ? "tarea asignada" : "tareas asignadas"}`
            : "No tenés tareas asignadas"}
          {" · "}
          {pendientesTotales} {pendientesTotales === 1 ? "pendiente" : "pendientes"} en{" "}
          {activos.length} {activos.length === 1 ? "proyecto" : "proyectos"}
        </p>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-tinta">Tus tareas</h2>

        {sinTareas ? (
          <p className="mt-3 text-sm text-tinta-suave">
            Estás al día. Cuando alguien te asigne algo, o quede una tarea libre en tus
            proyectos, aparece acá.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-5">
            {asignadas.length > 0 && (
              <Grupo titulo="Asignadas a vos">
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
              </Grupo>
            )}

            {pools.length > 0 && (
              <Grupo titulo="Libres, para tomar">
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
              </Grupo>
            )}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-tinta">Proyectos</h2>
          {puedeGestionar && <SheetNuevoProyecto orgId={orgId} />}
        </div>

        {proyectos.length === 0 ? (
          <p className="mt-3 text-sm text-tinta-suave">
            Todavía no hay proyectos. Creá el primero y sumá al equipo.
          </p>
        ) : (
          <div className="mt-3">
            {activos.length > 0 && (
              <div className="divide-y divide-linea border-y border-linea">
                {activos.map((p) => (
                  <FilaProyecto key={p.id} orgId={orgId} proyecto={p} />
                ))}
              </div>
            )}

            {archivados.length > 0 && (
              <details className="group mt-2">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-3 text-sm text-tinta-suave [&::-webkit-details-marker]:hidden">
                  <ChevronRight
                    size={20}
                    strokeWidth={1.75}
                    className="shrink-0 transition-transform group-open:rotate-90"
                  />
                  Archivados ({archivados.length})
                </summary>
                <div className="divide-y divide-linea border-y border-linea">
                  {archivados.map((p) => (
                    <FilaProyecto key={p.id} orgId={orgId} proyecto={p} />
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
