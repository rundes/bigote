import { NextResponse } from "next/server";
import { obtenerContextoOrg } from "@/lib/org";
import { listarEdificios } from "@/lib/espacios";
import { listarMovimientosDelMes, mesActualBA } from "@/lib/finanzas";

// Excel es-AR abre bien CSV con ";" y BOM UTF-8.
function campoCsv(valor: string): string {
  if (/[;"\n\r]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`;
  return valor;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto || !contexto.permisos.finanzas) {
    return new NextResponse("Sin permiso", { status: 403 });
  }

  const url = new URL(request.url);
  const mesRaw = url.searchParams.get("mes") ?? "";
  const mes = /^\d{4}-\d{2}$/.test(mesRaw) ? mesRaw : mesActualBA();

  const edificios = await listarEdificios(orgId);
  const ambitosValidos = new Set(["todo", "entidad", ...edificios.map((e) => e.id)]);
  const ambitoRaw = url.searchParams.get("ambito") ?? "";
  const ambito = ambitosValidos.has(ambitoRaw) ? ambitoRaw : "todo";

  const nombreEdificio = new Map(edificios.map((e) => [e.id, e.nombre]));
  const movimientos = await listarMovimientosDelMes(orgId, mes, ambito);

  const filas = [
    ["fecha", "tipo", "categoria", "detalle", "ambito", "origen", "monto"].join(";"),
    ...movimientos.map((m) =>
      [
        m.fecha,
        m.tipo,
        campoCsv(m.categoria),
        campoCsv(m.detalle),
        campoCsv(m.edificio_id ? (nombreEdificio.get(m.edificio_id) ?? "") : "Entidad"),
        m.origen,
        // coma decimal para Excel es-AR
        String(m.monto).replace(".", ","),
      ].join(";")
    ),
  ];

  return new NextResponse("\uFEFF" + filas.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="movimientos-${mes}.csv"`,
    },
  });
}
