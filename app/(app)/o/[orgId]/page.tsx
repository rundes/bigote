import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerContextoOrg } from "@/lib/org";
import { crearClienteServidor } from "@/lib/supabase/server";
import { misTareas, type TareaConProyecto } from "@/lib/proyectos";
import {
  hoyEnBuenosAires,
  listarEdificios,
  reservasDelDia,
  type ReservaDia,
} from "@/lib/espacios";
import {
  listarMovimientosDelMes,
  resumenDelMes,
  mesActualBA,
} from "@/lib/finanzas";
import { listarEsperandoPago, horasParaVencer } from "@/lib/cobros";
import { FilaTarea, type AccionFilaTarea } from "@/componentes/tareas/FilaTarea";

const MAX_TAREAS = 5;

const pesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

function Seccion({
  titulo,
  accion,
  children,
}: {
  titulo: string;
  accion?: { href: string; texto: string };
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-tinta">{titulo}</h2>
        {accion && (
          <Link href={accion.href} className="shrink-0 text-sm font-medium text-acento">
            {accion.texto}
          </Link>
        )}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default async function PaginaHoy({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto) redirect("/");

  const hoy = hoyEnBuenosAires();
  const supabase = await crearClienteServidor();

  const [{ data: perfil }, { asignadas, pools }, edificios] = await Promise.all([
    supabase.from("perfiles").select("nombre").eq("id", contexto.perfilId).maybeSingle(),
    misTareas(orgId, contexto.perfilId),
    listarEdificios(orgId),
  ]);

  // Las reservas del día llegan por edificio; se juntan y se ordenan por hora
  // para que la agenda se lea de corrido, sin importar en qué edificio pasa.
  const porEdificio = await Promise.all(
    edificios.map(async (e) => ({
      edificio: e.nombre,
      salas: await obtenerNombresDeSala(e.id),
      reservas: await reservasDelDia(e.id, hoy),
    }))
  );
  const agenda = porEdificio
    .flatMap(({ edificio, salas, reservas }) =>
      reservas.map((r: ReservaDia) => ({
        ...r,
        edificio,
        sala: salas.get(r.sala_id) ?? "",
      }))
    )
    .sort((a, b) => a.hora_inicio - b.hora_inicio);

  async function obtenerNombresDeSala(edificioId: string): Promise<Map<string, string>> {
    const { data } = await supabase
      .from("salas")
      .select("id, nombre")
      .eq("edificio_id", edificioId)
      .returns<{ id: string; nombre: string }[]>();
    return new Map((data ?? []).map((s) => [s.id, s.nombre]));
  }

  const tareas: { tarea: TareaConProyecto; accion: AccionFilaTarea }[] = [
    ...asignadas.map((tarea) => ({ tarea, accion: "completar" as const })),
    ...pools.map((tarea) => ({ tarea, accion: "tomar" as const })),
  ];

  const finanzas = contexto.permisos.finanzas
    ? await (async () => {
        const mes = mesActualBA();
        const [movs, esperando] = await Promise.all([
          listarMovimientosDelMes(orgId, mes, "todo"),
          listarEsperandoPago(orgId),
        ]);
        return { ...resumenDelMes(movs), esperando };
      })()
    : null;

  const horaActual = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Argentina/Buenos_Aires",
      hour: "2-digit",
      hour12: false,
    }).format(new Date())
  );

  const fechaLarga = new Date(`${hoy}T12:00:00`).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="flex flex-col gap-10">
      <div>
        <p className="text-sm text-tinta-suave first-letter:uppercase">{fechaLarga}</p>
        <h1 className="mt-1 text-2xl font-semibold text-tinta">
          Hola, {perfil?.nombre || ""}
        </h1>
      </div>

      {/* Lo primero es lo que pasa hoy en el edificio: quien atiende necesita
          saber qué sala está ocupada antes que ninguna otra cosa. */}
      <Seccion titulo="Hoy en los espacios" accion={{ href: `/o/${orgId}/espacios`, texto: "Ver agenda" }}>
        {agenda.length === 0 ? (
          <p className="text-sm text-tinta-suave">No hay nada reservado para hoy.</p>
        ) : (
          <div className="divide-y divide-linea border-y border-linea">
            {agenda.map((r) => {
              const enCurso =
                horaActual >= r.hora_inicio && horaActual < r.hora_inicio + r.horas;
              return (
                <div key={r.id} className="flex items-baseline gap-3 py-3">
                  <span
                    className={`w-16 shrink-0 text-sm tabular-nums ${
                      enCurso ? "font-semibold text-acento" : "text-tinta-suave"
                    }`}
                  >
                    {String(r.hora_inicio).padStart(2, "0")}:00
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-tinta">{r.titular}</span>
                    <span className="block truncate text-xs text-tinta-suave">
                      {r.sala}
                      {edificios.length > 1 ? ` · ${r.edificio}` : ""} · {r.horas} h
                    </span>
                  </span>
                  {enCurso && (
                    <span className="shrink-0 rounded-full bg-acento/12 px-2 py-0.5 text-xs font-medium text-acento">
                      ahora
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Seccion>

      <Seccion
        titulo="Tus tareas"
        accion={tareas.length > MAX_TAREAS ? { href: `/o/${orgId}/tareas`, texto: "Ver todas" } : undefined}
      >
        {tareas.length === 0 ? (
          <p className="text-sm text-tinta-suave">Estás al día. No tenés tareas pendientes.</p>
        ) : (
          <div className="flex flex-col">
            {tareas.slice(0, MAX_TAREAS).map(({ tarea, accion }) => (
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
        )}
      </Seccion>

      {finanzas && finanzas.esperando.length > 0 && (
        <Seccion
          titulo="Esperando pago"
          accion={{ href: `/o/${orgId}/finanzas/cobros`, texto: "Registrar" }}
        >
          <div className="divide-y divide-linea border-y border-linea">
            {finanzas.esperando.slice(0, 3).map((r) => {
              const h = horasParaVencer(r.vence_at);
              return (
                <div key={r.id} className="flex items-center justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-tinta">{r.quien}</span>
                    <span
                      className={`block text-xs ${h <= 6 ? "font-medium text-peligro" : "text-tinta-suave"}`}
                    >
                      {r.sala_nombre} · {h <= 0 ? "vence en minutos" : `vence en ${h} h`}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-tinta">
                    {pesos.format(r.costo)}
                  </span>
                </div>
              );
            })}
          </div>
        </Seccion>
      )}

      {finanzas && (
        <Seccion titulo="El mes" accion={{ href: `/o/${orgId}/finanzas`, texto: "Ver finanzas" }}>
          <p
            className={`text-[29px] font-semibold tabular-nums ${
              finanzas.balance < 0 ? "text-peligro" : "text-tinta"
            }`}
          >
            {pesos.format(finanzas.balance)}
          </p>
          <p className="mt-1 text-sm text-tinta-suave tabular-nums">
            <span className="text-ok">+{pesos.format(finanzas.ingresos)}</span>
            {"  ·  "}
            <span className="text-peligro">−{pesos.format(finanzas.egresos)}</span>
          </p>
        </Seccion>
      )}
    </div>
  );
}
