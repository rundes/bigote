"use client";

import { useState } from "react";
import type { MiReserva } from "@/lib/espacios";
import { SheetCancelar } from "@/componentes/espacios/SheetCancelar";
import { formatearHora } from "@/componentes/espacios/SheetReserva";

const pesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

function fechaCorta(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function TusReservas({ orgId, reservas }: { orgId: string; reservas: MiReserva[] }) {
  const [aCancelar, setACancelar] = useState<MiReserva | null>(null);

  if (reservas.length === 0) {
    return <p className="text-sm text-tinta-suave">No tenés reservas próximas.</p>;
  }

  return (
    <div className="flex flex-col">
      {reservas.map((r) => (
        <div
          key={r.id}
          className="flex min-h-14 items-center gap-3 border-b border-linea py-2 last:border-b-0"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-tinta">
              <span className="first-letter:uppercase">{fechaCorta(r.fecha)}</span>
              {" · "}
              <span className="tabular-nums">
                {formatearHora(r.hora_inicio)}–{formatearHora(r.hora_inicio + r.horas)}
              </span>
            </p>
            <p className="truncate text-sm text-tinta-suave">
              {r.sala} · {r.edificio}
              {r.titular && ` · para ${r.titular}`}
            </p>
          </div>
          <span className="shrink-0 text-sm tabular-nums text-tinta-suave">
            {r.costo === 0 ? "Gratis" : pesos.format(r.costo)}
          </span>
          <button
            type="button"
            onClick={() => setACancelar(r)}
            className="h-11 shrink-0 rounded-lg px-3 text-sm font-medium text-peligro transition hover:bg-peligro/10"
          >
            Cancelala
          </button>
        </div>
      ))}

      {aCancelar && (
        <SheetCancelar
          orgId={orgId}
          reservaId={aCancelar.id}
          descripcion={`${aCancelar.sala} · ${fechaCorta(aCancelar.fecha)} ${formatearHora(aCancelar.hora_inicio)} h`}
          onCerrar={() => setACancelar(null)}
        />
      )}
    </div>
  );
}
