import { redirect } from "next/navigation";
import { obtenerContextoOrg } from "@/lib/org";
import { listarProyectos } from "@/lib/proyectos";
import { crearClienteServidor } from "@/lib/supabase/server";
import { FiltrosTrackRecord, type Periodo } from "@/componentes/equipo/FiltrosTrackRecord";
import { TarjetaPersona, type FilaTrackRecord } from "@/componentes/equipo/TarjetaPersona";

function esPeriodo(valor: string | undefined): valor is Periodo {
  return valor === "mes" || valor === "trimestre" || valor === "historico";
}

// Argentina no observa horario de verano (UTC-3 fijo), pero se calcula la
// fecha de "hoy" vía Intl en vez de asumir el offset a mano, por si el
// servidor corre en otra zona horaria.
function hoyEnBuenosAires(): { anio: number; mes: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const anio = Number(partes.find((p) => p.type === "year")?.value);
  const mes = Number(partes.find((p) => p.type === "month")?.value);
  return { anio, mes };
}

// Primer día del mes actual menos `mesesAtras`, como "YYYY-MM-DD". Se arma
// con Date.UTC sobre año/mes (sin componente de día ni hora) para no
// arrastrar el offset horario: el día calendario es el mismo en cualquier
// timezone porque solo nos importan año y mes.
function primerDiaDelMes(mesesAtras: number): string {
  const { anio, mes } = hoyEnBuenosAires();
  const fecha = new Date(Date.UTC(anio, mes - 1 - mesesAtras, 1));
  const y = fecha.getUTCFullYear();
  const m = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

function calcularDesde(periodo: Periodo): string | null {
  if (periodo === "historico") return null;
  if (periodo === "trimestre") return primerDiaDelMes(2);
  return primerDiaDelMes(0);
}

export default async function PaginaEquipo({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ periodo?: string; proyecto?: string }>;
}) {
  const { orgId } = await params;
  const sp = await searchParams;
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto) redirect("/");

  const periodo: Periodo = esPeriodo(sp.periodo) ? sp.periodo : "mes";
  const proyectoId = sp.proyecto ?? null;

  // Cliente de sesión (nunca admin): la RPC hace su propio recorte de
  // privacidad server-side según el permiso `equipo` del usuario logueado.
  const supabase = await crearClienteServidor();
  const [{ data: filas }, proyectos] = await Promise.all([
    supabase.rpc("track_record", { org: orgId, desde: calcularDesde(periodo), proyecto: proyectoId }),
    listarProyectos(orgId),
  ]);

  // Sin tipos generados de Supabase en el proyecto, el builder de `.rpc()`
  // no infiere el shape de la tabla devuelta (a diferencia de `.from().select()`
  // con `.returns<>()`, que sí funciona): se castea explícitamente acá.
  const personas = (filas ?? []) as unknown as FilaTrackRecord[];
  const activos = proyectos.filter((p) => p.estado !== "archivado");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-tinta">
        {contexto.permisos.equipo ? "Equipo" : "Tu track record"}
      </h1>

      <FiltrosTrackRecord orgId={orgId} periodo={periodo} proyectoId={proyectoId} proyectos={activos} />

      {personas.length === 0 ? (
        <p className="text-sm text-tinta-suave">Nada completado en este período.</p>
      ) : (
        <div className="flex flex-col">
          {personas.map((persona) => (
            <TarjetaPersona key={persona.perfil_id} persona={persona} />
          ))}
        </div>
      )}
    </div>
  );
}
