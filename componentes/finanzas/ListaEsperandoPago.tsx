"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { registrarPago } from "@/app/(app)/o/[orgId]/finanzas/cobros/acciones";
import { horasParaVencer, type ReservaEsperandoPago } from "@/lib/cobros-tipos";

const pesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export function ListaEsperandoPago({
  orgId,
  reservas,
}: {
  orgId: string;
  reservas: ReservaEsperandoPago[];
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function registrar(r: ReservaEsperandoPago) {
    setOcupado(r.id);
    setError(null);
    const res = await registrarPago(orgId, r.id, r.costo);
    setOcupado(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  if (reservas.length === 0) {
    return (
      <p className="mt-2 text-sm text-tinta-suave">
        Ninguna reserva está esperando pago.
      </p>
    );
  }

  return (
    <>
      <div className="mt-2 divide-y divide-linea border-y border-linea">
        {reservas.map((r) => {
          const horas = horasParaVencer(r.vence_at);
          const urgente = horas <= 6;
          return (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-tinta">
                  {r.quien}
                </span>
                <span className="block text-xs text-tinta-suave">
                  {r.sala_nombre} ·{" "}
                  {new Date(`${r.fecha}T00:00:00`).toLocaleDateString("es-AR", {
                    weekday: "short",
                    day: "2-digit",
                    month: "2-digit",
                  })}{" "}
                  {r.hora_inicio}:00 · {r.horas} h
                </span>
                <span
                  className={`block text-xs ${urgente ? "font-medium text-peligro" : "text-tinta-suave"}`}
                >
                  {horas <= 0 ? "vence en minutos" : `vence en ${horas} h`}
                </span>
              </span>

              <span className="shrink-0 text-sm font-semibold tabular-nums text-tinta">
                {pesos.format(r.costo)}
              </span>

              <button
                type="button"
                disabled={ocupado !== null}
                onClick={() => registrar(r)}
                className="h-11 shrink-0 rounded-lg bg-acento px-4 text-sm font-medium text-acento-tinta transition hover:opacity-90 disabled:opacity-60"
              >
                {ocupado === r.id ? "Registrando…" : "Registrar pago"}
              </button>
            </div>
          );
        })}
      </div>
      {error && <p className="mt-3 text-sm text-peligro">{error}</p>}
    </>
  );
}
