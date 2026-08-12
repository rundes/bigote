"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearPaquete } from "@/app/(app)/o/[orgId]/inventario/acciones";
import type { Destinatario } from "@/lib/inventario";

export function SheetNuevoPaquete({
  orgId,
  destinatarios,
}: {
  orgId: string;
  destinatarios: Destinatario[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function enviar(formData: FormData) {
    setGuardando(true);
    setError(null);
    const r = await crearPaquete(orgId, formData);
    setGuardando(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    setAbierto(false);
    if (r.id) router.push(`/o/${orgId}/inventario/paquetes/${r.id}`);
    else router.refresh();
  }

  return (
    <>
      <button
        type="button"
        disabled={destinatarios.length === 0}
        onClick={() => setAbierto(true)}
        className="flex h-10 items-center rounded-lg bg-acento px-4 text-sm font-medium text-acento-tinta transition hover:opacity-90 disabled:opacity-45"
      >
        Armar paquete
      </button>

      {abierto && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-tinta/25 lg:items-center">
          <div className="w-full rounded-t-xl bg-superficie p-6 lg:max-w-md lg:rounded-xl">
            <h2 className="text-lg font-semibold text-tinta">Nuevo paquete</h2>
            <form action={enviar} className="mt-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="destinatario" className="text-[13px] text-tinta-suave">
                  ¿A quién va?
                </label>
                <select
                  id="destinatario"
                  name="destinatario"
                  required
                  className="h-11 rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta focus:border-acento focus:outline-none"
                >
                  <option value="">Elegí el destinatario</option>
                  {destinatarios.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nombre}
                      {d.provincia ? ` · ${d.provincia}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="nota" className="text-[13px] text-tinta-suave">
                  Nota
                </label>
                <input
                  id="nota"
                  name="nota"
                  className="h-11 rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta focus:border-acento focus:outline-none"
                />
              </div>

              {error && <p className="text-sm text-peligro">{error}</p>}

              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setAbierto(false)}
                  className="h-11 flex-1 rounded-lg border border-linea text-sm text-tinta"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="h-11 flex-1 rounded-lg bg-acento text-sm font-medium text-acento-tinta disabled:opacity-60"
                >
                  {guardando ? "Creando…" : "Crear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
