"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  prestarArticulo,
  devolverArticulo,
  ajustarStock,
} from "@/app/(app)/o/[orgId]/inventario/acciones";
import type { EstadoActivo, Naturaleza } from "@/lib/inventario";

type Miembro = { id: string; nombre: string };

export function AccionesArticulo({
  orgId,
  articuloId,
  naturaleza,
  estado,
  miembros,
}: {
  orgId: string;
  articuloId: string;
  naturaleza: Naturaleza;
  estado: EstadoActivo | null;
  miembros: Miembro[];
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<"prestar" | "ajustar" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function correr(fn: () => Promise<{ error?: string }>) {
    setOcupado(true);
    setError(null);
    const r = await fn();
    setOcupado(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    setPanel(null);
    router.refresh();
  }

  const puedePrestar = naturaleza === "existencia" || estado === "disponible";
  const puedeDevolver = naturaleza === "activo" && estado === "prestado";

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-2">
        {puedePrestar && (
          <button
            type="button"
            onClick={() => setPanel(panel === "prestar" ? null : "prestar")}
            className="h-11 rounded-lg bg-acento px-4 text-sm font-medium text-acento-tinta transition hover:opacity-90"
          >
            Prestar
          </button>
        )}
        {puedeDevolver && (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => correr(() => devolverArticulo(orgId, articuloId))}
            className="h-11 rounded-lg bg-acento px-4 text-sm font-medium text-acento-tinta transition hover:opacity-90 disabled:opacity-60"
          >
            {ocupado ? "Registrando…" : "Registrar devolución"}
          </button>
        )}
        {naturaleza === "existencia" && (
          <button
            type="button"
            onClick={() => setPanel(panel === "ajustar" ? null : "ajustar")}
            className="h-11 rounded-lg border border-linea px-4 text-sm text-tinta transition hover:bg-linea/40"
          >
            Ajustar stock
          </button>
        )}
      </div>

      {panel === "prestar" && (
        <form
          action={(fd) => correr(() => prestarArticulo(orgId, articuloId, fd))}
          className="mt-4 flex flex-col gap-3 rounded-xl border border-linea bg-superficie p-4"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="perfil" className="text-[13px] text-tinta-suave">
              ¿A quién?
            </label>
            <select
              id="perfil"
              name="perfil"
              required
              className="h-11 rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta focus:border-acento focus:outline-none"
            >
              <option value="">Elegí una persona</option>
              {miembros.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="devolucion" className="text-[13px] text-tinta-suave">
              Vuelve el (opcional)
            </label>
            <input
              id="devolucion"
              name="devolucion"
              type="date"
              className="h-11 rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta focus:border-acento focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={ocupado}
            className="h-11 rounded-lg bg-acento text-sm font-medium text-acento-tinta disabled:opacity-60"
          >
            {ocupado ? "Registrando…" : "Registrar préstamo"}
          </button>
        </form>
      )}

      {panel === "ajustar" && (
        <form
          action={(fd) => correr(() => ajustarStock(orgId, articuloId, fd))}
          className="mt-4 flex flex-col gap-3 rounded-xl border border-linea bg-superficie p-4"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="delta" className="text-[13px] text-tinta-suave">
              Ajuste (negativo para restar)
            </label>
            <input
              id="delta"
              name="delta"
              type="number"
              required
              placeholder="-5"
              className="h-11 rounded-lg border border-linea bg-superficie px-3 text-sm tabular-nums text-tinta focus:border-acento focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="nota" className="text-[13px] text-tinta-suave">
              Motivo
            </label>
            <input
              id="nota"
              name="nota"
              placeholder="Recuento, rotura, extravío…"
              className="h-11 rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta focus:border-acento focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={ocupado}
            className="h-11 rounded-lg bg-acento text-sm font-medium text-acento-tinta disabled:opacity-60"
          >
            {ocupado ? "Ajustando…" : "Ajustar"}
          </button>
        </form>
      )}

      {error && <p className="mt-3 text-sm text-peligro">{error}</p>}
    </div>
  );
}
