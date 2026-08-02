"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, X } from "lucide-react";
import type { Edificio } from "@/lib/espacios";
import { crearEdificio, editarEdificio } from "@/app/(app)/o/[orgId]/espacios/acciones";

type Estado = { error?: string } | null;

const CAMPO = "h-11 w-full rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta placeholder:text-tinta-suave focus:border-acento focus:outline-none";
const ETIQUETA = "text-[13px] text-tinta-suave";

export function SheetEdificio({
  orgId,
  edificio,
  propietariaNombre,
  orgs,
}: {
  orgId: string;
  /** null = alta de un edificio nuevo (la org activa queda como propietaria) */
  edificio: Edificio | null;
  propietariaNombre: string;
  orgs: { id: string; nombre: string }[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [destino, setDestino] = useState(edificio?.destino_ingresos ?? "propietaria");
  const [gestoraId, setGestoraId] = useState(edificio?.org_gestora_id ?? "");
  const router = useRouter();
  const esAlta = edificio === null;

  async function accion(_previo: Estado, formData: FormData): Promise<Estado> {
    const resultado = esAlta
      ? await crearEdificio(orgId, formData)
      : await editarEdificio(orgId, edificio.id, formData);
    if (resultado.error) return resultado;
    setAbierto(false);
    router.refresh();
    return null;
  }

  const [estado, enviarAccion, enCurso] = useActionState(accion, null);

  useEffect(() => {
    if (!abierto) return;
    function alTeclado(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAbierto(false);
    }
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, [abierto]);

  const gestorasPosibles = orgs.filter((o) => o.id !== (edificio?.org_propietaria_id ?? orgId));

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={
          esAlta
            ? "flex h-11 items-center gap-2 rounded-lg bg-acento px-4 text-sm font-medium text-acento-tinta transition hover:opacity-90"
            : "flex h-11 items-center gap-2 rounded-lg border border-linea px-3 text-sm font-medium text-tinta transition hover:border-acento hover:text-acento"
        }
      >
        {esAlta ? <Plus size={20} strokeWidth={1.75} /> : <Pencil size={20} strokeWidth={1.75} />}
        {esAlta ? "Creá un espacio" : "Editá el edificio"}
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-40 bg-tinta/20" onClick={() => setAbierto(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={esAlta ? "Nuevo espacio" : "Editar edificio"}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-xl border-t border-linea bg-superficie p-4 pb-6 lg:inset-y-0 lg:left-auto lg:right-0 lg:h-full lg:max-h-none lg:w-[420px] lg:rounded-none lg:border-l lg:border-t-0"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-tinta">
                {esAlta ? "Nuevo espacio" : edificio.nombre}
              </h2>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar"
                className="flex h-11 w-11 items-center justify-center text-tinta-suave hover:text-tinta"
              >
                <X size={20} strokeWidth={1.75} />
              </button>
            </div>

            <form action={enviarAccion} className="flex flex-col gap-4">
              {esAlta && (
                <div className="flex flex-col gap-1">
                  <label htmlFor="edificio-nombre" className={ETIQUETA}>
                    Nombre
                  </label>
                  <input
                    id="edificio-nombre"
                    name="nombre"
                    type="text"
                    required
                    autoFocus
                    placeholder="Casa central"
                    className={CAMPO}
                  />
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label htmlFor="edificio-direccion" className={ETIQUETA}>
                  Dirección
                </label>
                <input
                  id="edificio-direccion"
                  name="direccion"
                  type="text"
                  defaultValue={edificio?.direccion ?? ""}
                  placeholder="Av. Rivadavia 1234, CABA"
                  className={CAMPO}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="edificio-descripcion" className={ETIQUETA}>
                  Descripción
                </label>
                <textarea
                  id="edificio-descripcion"
                  name="descripcion"
                  rows={3}
                  defaultValue={edificio?.descripcion ?? ""}
                  placeholder="Cómo es el lugar, qué tiene, cómo llegar"
                  className="w-full rounded-lg border border-linea bg-superficie px-3 py-2 text-sm text-tinta placeholder:text-tinta-suave focus:border-acento focus:outline-none"
                />
              </div>

              {!esAlta && (
                <>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="edificio-gestora" className={ETIQUETA}>
                      Organización gestora
                    </label>
                    <select
                      id="edificio-gestora"
                      name="org_gestora_id"
                      value={gestoraId}
                      onChange={(e) => {
                        setGestoraId(e.target.value);
                        if (!e.target.value) setDestino("propietaria");
                      }}
                      className={CAMPO}
                    >
                      <option value="">Sin co-gestión</option>
                      {gestorasPosibles.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <fieldset className="flex flex-col gap-2">
                    <legend className={ETIQUETA}>Ingresos de las reservas</legend>
                    {[
                      { valor: "propietaria", etiqueta: `Todo para ${propietariaNombre} (propietaria)` },
                      { valor: "gestora", etiqueta: "Todo para la gestora" },
                      { valor: "reparto", etiqueta: "Reparto entre las dos" },
                    ].map((opcion) => (
                      <label
                        key={opcion.valor}
                        className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm transition ${
                          destino === opcion.valor
                            ? "border-acento bg-acento/10 text-tinta"
                            : "border-linea text-tinta-suave"
                        } ${opcion.valor !== "propietaria" && !gestoraId ? "opacity-45" : "cursor-pointer"}`}
                      >
                        <input
                          type="radio"
                          name="destino_ingresos"
                          value={opcion.valor}
                          checked={destino === opcion.valor}
                          disabled={opcion.valor !== "propietaria" && !gestoraId}
                          onChange={() => setDestino(opcion.valor as typeof destino)}
                          className="accent-[var(--color-acento)]"
                        />
                        {opcion.etiqueta}
                      </label>
                    ))}
                  </fieldset>

                  {destino === "reparto" && (
                    <div className="flex flex-col gap-1">
                      <label htmlFor="edificio-porcentaje" className={ETIQUETA}>
                        Reparto
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id="edificio-porcentaje"
                          name="porcentaje_propietaria"
                          type="number"
                          min={0}
                          max={100}
                          required
                          defaultValue={edificio?.porcentaje_propietaria ?? 50}
                          className="h-11 w-24 rounded-lg border border-linea bg-superficie px-3 text-sm tabular-nums text-tinta focus:border-acento focus:outline-none"
                        />
                        <span className="text-sm text-tinta-suave">% para la propietaria</span>
                      </div>
                    </div>
                  )}
                </>
              )}

              <button
                type="submit"
                disabled={enCurso}
                className="h-11 w-full rounded-lg bg-acento text-sm font-medium text-acento-tinta transition hover:opacity-90 disabled:opacity-60"
              >
                {enCurso ? "Guardando…" : esAlta ? "Creá el espacio" : "Guardá los cambios"}
              </button>

              {estado?.error && <p className="text-sm text-peligro">{estado.error}</p>}
            </form>
          </div>
        </>
      )}
    </>
  );
}
