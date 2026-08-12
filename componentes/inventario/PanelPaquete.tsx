"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  agregarAPaquete,
  despacharPaquete,
} from "@/app/(app)/o/[orgId]/inventario/acciones";
import type { ItemDePaquete, Naturaleza } from "@/lib/inventario";

type Opcion = {
  id: string;
  nombre: string;
  codigo: string;
  stock: number;
  naturaleza: Naturaleza;
};

export function PanelPaquete({
  orgId,
  paqueteId,
  estado,
  puedeEditar,
  items,
  articulos,
}: {
  orgId: string;
  paqueteId: string;
  estado: "abierto" | "despachado";
  puedeEditar: boolean;
  items: ItemDePaquete[];
  articulos: Opcion[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  async function correr(fn: () => Promise<{ error?: string }>) {
    setOcupado(true);
    setError(null);
    const r = await fn();
    setOcupado(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    setConfirmando(false);
    router.refresh();
  }

  const editable = puedeEditar && estado === "abierto";
  const total = items.reduce((a, i) => a + i.cantidad, 0);

  return (
    <>
      <h2 className="mt-8 text-sm text-tinta-suave">Contenido</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-tinta-suave">El paquete está vacío.</p>
      ) : (
        <div className="mt-2 divide-y divide-linea border-y border-linea">
          {items.map((i) => (
            <div key={i.articulo_id} className="flex items-center justify-between gap-3 py-3">
              <span className="min-w-0">
                <span className="block truncate text-sm text-tinta">{i.nombre}</span>
                <span className="block font-mono text-xs text-tinta-suave">{i.codigo}</span>
              </span>
              <span className="shrink-0 text-sm font-medium tabular-nums text-tinta">
                {i.cantidad}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between py-3">
            <span className="text-sm font-medium text-tinta">Total</span>
            <span className="text-sm font-semibold tabular-nums text-tinta">{total}</span>
          </div>
        </div>
      )}

      {editable && (
        <form
          action={(fd) => correr(() => agregarAPaquete(orgId, paqueteId, fd))}
          className="mt-6 flex flex-col gap-3 rounded-xl border border-linea bg-superficie p-4"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="articulo" className="text-[13px] text-tinta-suave">
              Agregar
            </label>
            <select
              id="articulo"
              name="articulo"
              required
              className="h-11 rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta focus:border-acento focus:outline-none"
            >
              <option value="">Elegí un artículo</option>
              {articulos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre} ({a.stock} disponible{a.stock === 1 ? "" : "s"})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="cantidad" className="text-[13px] text-tinta-suave">
              Cantidad
            </label>
            <input
              id="cantidad"
              name="cantidad"
              type="number"
              min={1}
              defaultValue={1}
              className="h-11 rounded-lg border border-linea bg-superficie px-3 text-sm tabular-nums text-tinta focus:border-acento focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={ocupado}
            className="h-11 rounded-lg border border-linea text-sm font-medium text-tinta disabled:opacity-60"
          >
            {ocupado ? "Agregando…" : "Agregar al paquete"}
          </button>
        </form>
      )}

      {editable && items.length > 0 && (
        <div className="mt-6 border-t border-linea pt-6">
          {confirmando ? (
            <div className="rounded-xl border border-linea bg-superficie p-4">
              <p className="text-sm text-tinta">
                Despachar descuenta {total} {total === 1 ? "unidad" : "unidades"} del stock y
                cierra el paquete. No se puede deshacer.
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmando(false)}
                  className="h-11 flex-1 rounded-lg border border-linea text-sm text-tinta"
                >
                  Volver
                </button>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => correr(() => despacharPaquete(orgId, paqueteId))}
                  className="h-11 flex-1 rounded-lg bg-acento text-sm font-medium text-acento-tinta disabled:opacity-60"
                >
                  {ocupado ? "Despachando…" : "Sí, despachar"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              className="h-11 rounded-lg bg-acento px-4 text-sm font-medium text-acento-tinta transition hover:opacity-90"
            >
              Despachar paquete
            </button>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-peligro">{error}</p>}
    </>
  );
}
