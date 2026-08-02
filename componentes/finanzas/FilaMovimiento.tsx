import Link from "next/link";
import type { Movimiento } from "@/lib/finanzas";

const pesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

function fechaCorta(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function FilaMovimiento({
  orgId,
  movimiento,
  nombreAmbito,
}: {
  orgId: string;
  movimiento: Movimiento;
  /** nombre del ámbito (Entidad / edificio) — solo cuando el chip activo es "Todo" */
  nombreAmbito: string | null;
}) {
  const m = movimiento;
  const esIngreso = m.tipo === "ingreso";

  return (
    <div className="flex min-h-14 items-center gap-3 border-b border-linea py-2 last:border-b-0">
      <span className="w-14 shrink-0 text-sm text-tinta-suave">{fechaCorta(m.fecha)}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-tinta">
          {m.categoria}
          {m.origen === "reserva" && m.edificio_id && (
            <Link
              href={`/o/${orgId}/espacios?edificio=${m.edificio_id}&fecha=${m.fecha}`}
              className="ml-2 rounded-full border border-linea px-2 py-0.5 text-xs font-normal text-tinta-suave transition hover:border-acento hover:text-acento"
            >
              Reserva
            </Link>
          )}
        </p>
        {(m.detalle || nombreAmbito) && (
          <p className="truncate text-sm text-tinta-suave">
            {[m.detalle, nombreAmbito].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      <span
        className={`shrink-0 text-sm font-medium tabular-nums ${esIngreso ? "text-ok" : "text-peligro"}`}
      >
        {esIngreso ? "+" : "−"}
        {pesos.format(m.monto)}
      </span>
    </div>
  );
}
