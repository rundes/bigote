import { crearClienteServidor } from "@/lib/supabase/server";

export type Movimiento = {
  id: string;
  tipo: "ingreso" | "egreso";
  categoria: string;
  monto: number;
  detalle: string;
  fecha: string;
  edificio_id: string | null;
  origen: "manual" | "reserva";
  reserva_id: string | null;
};

/** "todo" | "entidad" | <edificio id> */
export type Ambito = string;

// Mes actual como "YYYY-MM" en Buenos Aires (el server puede correr en otra TZ).
export function mesActualBA(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

// [primer día del mes, primer día del mes siguiente) como "YYYY-MM-DD".
function rangoDelMes(mes: string): { desde: string; hasta: string } {
  const [y, m] = mes.split("-").map(Number);
  const siguiente = new Date(Date.UTC(y, m, 1));
  const hasta = `${siguiente.getUTCFullYear()}-${String(siguiente.getUTCMonth() + 1).padStart(2, "0")}-01`;
  return { desde: `${mes}-01`, hasta };
}

function filtrarAmbito<T extends { eq(c: string, v: string): T; is(c: string, v: null): T }>(
  consulta: T,
  ambito: Ambito
): T {
  if (ambito === "entidad") return consulta.is("edificio_id", null);
  if (ambito !== "todo") return consulta.eq("edificio_id", ambito);
  return consulta;
}

export async function listarMovimientosDelMes(
  orgId: string,
  mes: string,
  ambito: Ambito
): Promise<Movimiento[]> {
  const supabase = await crearClienteServidor();
  const { desde, hasta } = rangoDelMes(mes);

  let consulta = supabase
    .from("movimientos")
    .select("id, tipo, categoria, monto, detalle, fecha, edificio_id, origen, reserva_id")
    .eq("org_id", orgId)
    .gte("fecha", desde)
    .lt("fecha", hasta);
  consulta = filtrarAmbito(consulta, ambito);

  const { data } = await consulta
    .order("fecha", { ascending: false })
    .order("id", { ascending: false })
    .returns<Movimiento[]>();
  return (data ?? []).map((m) => ({ ...m, monto: Number(m.monto) }));
}

export function resumenDelMes(movimientos: Movimiento[]): {
  ingresos: number;
  egresos: number;
  balance: number;
} {
  let ingresos = 0;
  let egresos = 0;
  for (const m of movimientos) {
    if (m.tipo === "ingreso") ingresos += m.monto;
    else egresos += m.monto;
  }
  return { ingresos, egresos, balance: ingresos - egresos };
}

// Balance histórico hasta el fin del mes elegido (inclusive). Query liviana:
// solo tipo y monto; la suma se hace en JS (volumen chico, y los aggregates
// de PostgREST no están habilitados — mismo criterio que lib/proyectos.ts).
export async function acumuladoHasta(orgId: string, mes: string, ambito: Ambito): Promise<number> {
  const supabase = await crearClienteServidor();
  const { hasta } = rangoDelMes(mes);

  let consulta = supabase
    .from("movimientos")
    .select("tipo, monto")
    .eq("org_id", orgId)
    .lt("fecha", hasta);
  consulta = filtrarAmbito(consulta, ambito);

  const { data } = await consulta.returns<{ tipo: "ingreso" | "egreso"; monto: number }[]>();
  let balance = 0;
  for (const m of data ?? []) {
    balance += m.tipo === "ingreso" ? Number(m.monto) : -Number(m.monto);
  }
  return balance;
}
