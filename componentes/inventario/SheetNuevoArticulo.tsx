"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearArticulo } from "@/app/(app)/o/[orgId]/inventario/acciones";
import { ETIQUETAS_CATEGORIA, type Ubicacion } from "@/lib/inventario";

export function SheetNuevoArticulo({
  orgId,
  ubicaciones,
}: {
  orgId: string;
  ubicaciones: Ubicacion[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [naturaleza, setNaturaleza] = useState<"existencia" | "activo">("existencia");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function enviar(formData: FormData) {
    setGuardando(true);
    setError(null);
    const r = await crearArticulo(orgId, formData);
    setGuardando(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    setAbierto(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex h-10 items-center rounded-lg bg-acento px-4 text-sm font-medium text-acento-tinta transition hover:opacity-90"
      >
        Cargar
      </button>

      {abierto && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-tinta/25 lg:items-center">
          <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-superficie p-6 lg:max-w-md lg:rounded-xl">
            <h2 className="text-lg font-semibold text-tinta">Cargar al inventario</h2>

            <form action={enviar} className="mt-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="nombre" className="text-[13px] text-tinta-suave">
                  Nombre
                </label>
                <input
                  id="nombre"
                  name="nombre"
                  required
                  className="h-11 rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta focus:border-acento focus:outline-none"
                />
              </div>

              <fieldset className="flex flex-col gap-1">
                <legend className="text-[13px] text-tinta-suave">¿Qué es?</legend>
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setNaturaleza("existencia")}
                    aria-pressed={naturaleza === "existencia"}
                    className={`flex-1 rounded-lg border px-3 py-2 text-left text-sm transition ${
                      naturaleza === "existencia"
                        ? "border-acento bg-acento/10 text-acento"
                        : "border-linea text-tinta-suave"
                    }`}
                  >
                    <span className="block font-medium">Se cuenta</span>
                    <span className="block text-xs">Libros, folletos</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNaturaleza("activo")}
                    aria-pressed={naturaleza === "activo"}
                    className={`flex-1 rounded-lg border px-3 py-2 text-left text-sm transition ${
                      naturaleza === "activo"
                        ? "border-acento bg-acento/10 text-acento"
                        : "border-linea text-tinta-suave"
                    }`}
                  >
                    <span className="block font-medium">Cosa única</span>
                    <span className="block text-xs">Cámara, silla</span>
                  </button>
                </div>
                <input type="hidden" name="naturaleza" value={naturaleza} />
              </fieldset>

              <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-1">
                  <label htmlFor="categoria" className="text-[13px] text-tinta-suave">
                    Categoría
                  </label>
                  <select
                    id="categoria"
                    name="categoria"
                    defaultValue="libro"
                    className="h-11 rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta focus:border-acento focus:outline-none"
                  >
                    {Object.entries(ETIQUETAS_CATEGORIA).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                {naturaleza === "existencia" && (
                  <div className="flex w-28 flex-col gap-1">
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
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="ubicacion" className="text-[13px] text-tinta-suave">
                  Ubicación
                </label>
                <select
                  id="ubicacion"
                  name="ubicacion"
                  className="h-11 rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta focus:border-acento focus:outline-none"
                >
                  <option value="">Sin ubicación</option>
                  {ubicaciones.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="descripcion" className="text-[13px] text-tinta-suave">
                  Descripción
                </label>
                <textarea
                  id="descripcion"
                  name="descripcion"
                  rows={2}
                  className="rounded-lg border border-linea bg-superficie px-3 py-2 text-sm text-tinta focus:border-acento focus:outline-none"
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
                  {guardando ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
