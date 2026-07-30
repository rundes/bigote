import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerContextoOrg } from "@/lib/org";
import { crearClienteServidor } from "@/lib/supabase/server";
import { misTareas, type TareaConProyecto } from "@/lib/proyectos";
import { FilaTarea, type AccionFilaTarea } from "@/componentes/tareas/FilaTarea";

const MAX_VISIBLES = 5;

export default async function PaginaHoy({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto) redirect("/");

  const supabase = await crearClienteServidor();
  const [{ data: perfil }, { asignadas, pools }] = await Promise.all([
    supabase.from("perfiles").select("nombre").eq("id", contexto.perfilId).maybeSingle(),
    misTareas(orgId, contexto.perfilId),
  ]);

  // Asignadas primero (son mías, hay que completarlas), después el pool
  // (disponibles para tomar) de los proyectos de los que soy miembro.
  const tareas: { tarea: TareaConProyecto; accion: AccionFilaTarea }[] = [
    ...asignadas.map((tarea) => ({ tarea, accion: "completar" as const })),
    ...pools.map((tarea) => ({ tarea, accion: "tomar" as const })),
  ];
  const visibles = tareas.slice(0, MAX_VISIBLES);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-tinta">Hola, {perfil?.nombre || ""}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-tinta">Tus tareas</h2>

        {tareas.length === 0 ? (
          <p className="text-sm text-tinta-suave">Estás al día. No tenés tareas pendientes.</p>
        ) : (
          <>
            <div className="flex flex-col">
              {visibles.map(({ tarea, accion }) => (
                <FilaTarea
                  key={tarea.id}
                  tarea={tarea}
                  accion={accion}
                  orgId={orgId}
                  proyectoId={tarea.proyecto.id}
                  subtitulo={tarea.proyecto.nombre}
                />
              ))}
            </div>
            {tareas.length > MAX_VISIBLES && (
              <Link href={`/o/${orgId}/tareas`} className="text-sm font-medium text-acento">
                Ver todas →
              </Link>
            )}
          </>
        )}
      </section>
    </div>
  );
}
