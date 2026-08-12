"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, X } from "lucide-react";
import type { Plan } from "@/lib/espacios";
import { crearPlan, editarPlan } from "@/app/(app)/o/[orgId]/espacios/acciones";

type Estado = { error?: string } | null;

const CAMPO = "h-11 w-full rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta placeholder:text-tinta-suave focus:border-acento focus:outline-none";
const ETIQUETA = "text-[13px] text-tinta-suave";

export function SheetPlan({
  orgId,
  edificioId,
  plan,
}: {
  orgId: string;
  edificioId: string;
  /** null = alta (el plan queda en la org activa, propietaria del edificio) */
  plan: Plan | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [gratuito, setGratuito] = useState(plan?.gratuito ?? false);
  const router = useRouter();
  const esAlta = plan === null;

  async function accion(_previo: Estado, formData: FormData): Promise<Estado> {
    const resultado = esAlta
      ? await crearPlan(orgId, formData)
      : await editarPlan(orgId, edificioId, plan.id, formData);
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

  return (
    <>
      {esAlta ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="flex h-11 items-center gap-2 rounded-lg border border-linea px-3 text-sm font-medium text-tinta transition hover:border-acento hover:text-acento"
        >
          <Plus size={20} strokeWidth={1.75} />
          Agregá un plan
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          aria-label={`Editá el plan ${plan.nombre}`}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-tinta-suave transition hover:text-acento"
        >
          <Pencil size={20} strokeWidth={1.75} />
        </button>
      )}

      {abierto && (
        <>
          <div className="fixed inset-0 z-40 bg-tinta/20" onClick={() => setAbierto(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={esAlta ? "Nuevo plan" : `Editar plan ${plan.nombre}`}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-xl border-t border-linea bg-superficie p-4 pb-6 lg:inset-y-0 lg:left-auto lg:right-0 lg:h-full lg:max-h-none lg:w-[420px] lg:rounded-none lg:border-l lg:border-t-0"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-tinta">
                {esAlta ? "Nuevo plan" : plan.nombre}
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
              <div className="flex flex-col gap-1">
                <label htmlFor="plan-nombre" className={ETIQUETA}>
                  Nombre
                </label>
                <input
                  id="plan-nombre"
                  name="nombre"
                  type="text"
                  required
                  autoFocus={esAlta}
                  defaultValue={plan?.nombre ?? ""}
                  placeholder="Pago por hora"
                  className={CAMPO}
                />
              </div>

              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-tinta">
                <input
                  type="checkbox"
                  name="gratuito"
                  checked={gratuito}
                  onChange={(e) => setGratuito(e.target.checked)}
                  className="h-5 w-5 accent-[var(--color-acento)]"
                />
                Gratuito
              </label>

              {!gratuito && (
                <div className="flex flex-col gap-1">
                  <label htmlFor="plan-precio" className={ETIQUETA}>
                    Precio por hora
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-tinta-suave">$</span>
                    <input
                      id="plan-precio"
                      name="precio_hora"
                      type="number"
                      min={1}
                      step="any"
                      required
                      defaultValue={plan && plan.precio_hora > 0 ? plan.precio_hora : ""}
                      placeholder="8000"
                      className="h-11 w-32 rounded-lg border border-linea bg-superficie px-3 text-sm tabular-nums text-tinta placeholder:text-tinta-suave focus:border-acento focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-tinta">
                <input
                  type="checkbox"
                  name="solo_salas_publicas"
                  defaultChecked={plan?.solo_salas_publicas ?? false}
                  className="h-5 w-5 accent-[var(--color-acento)]"
                />
                Solo salas públicas
              </label>

              {/* Solo tiene sentido en planes con costo: un plan gratuito nunca
                  entra al circuito de cobro previo. */}
              {!gratuito && (
                <label className="flex min-h-11 cursor-pointer items-start gap-2 text-sm text-tinta">
                  <input
                    type="checkbox"
                    name="requiere_pago_previo"
                    defaultChecked={plan?.requiere_pago_previo ?? false}
                    className="mt-2 h-5 w-5 shrink-0 accent-[var(--color-acento)]"
                  />
                  <span>
                    Cobrar antes de confirmar
                    <span className="block text-xs text-tinta-suave">
                      El horario queda retenido hasta que se registre el pago. Requiere
                      tener los cobros activados en Finanzas.
                    </span>
                  </span>
                </label>
              )}

              <button
                type="submit"
                disabled={enCurso}
                className="h-11 w-full rounded-lg bg-acento text-sm font-medium text-acento-tinta transition hover:opacity-90 disabled:opacity-60"
              >
                {enCurso ? "Guardando…" : esAlta ? "Agregá el plan" : "Guardá los cambios"}
              </button>

              {estado?.error && <p className="text-sm text-peligro">{estado.error}</p>}
            </form>
          </div>
        </>
      )}
    </>
  );
}
