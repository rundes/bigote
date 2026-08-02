"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { crearMovimiento } from "@/app/(app)/o/[orgId]/finanzas/acciones";

type Estado = { error?: string } | null;

const CAMPO = "h-11 w-full rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta placeholder:text-tinta-suave focus:border-acento focus:outline-none";
const ETIQUETA = "text-[13px] text-tinta-suave";

const CATEGORIAS_SUGERIDAS = [
  "alquiler",
  "servicios",
  "sueldos",
  "insumos",
  "donaciones",
  "eventos",
  "general",
];

export function SheetMovimiento({
  orgId,
  hoy,
  edificios,
}: {
  orgId: string;
  hoy: string;
  edificios: { id: string; nombre: string }[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<"ingreso" | "egreso">("egreso");
  const router = useRouter();

  async function accion(_previo: Estado, formData: FormData): Promise<Estado> {
    const resultado = await crearMovimiento(orgId, formData);
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
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex h-11 items-center gap-2 rounded-lg bg-acento px-4 text-sm font-medium text-acento-tinta transition hover:opacity-90"
      >
        <Plus size={20} strokeWidth={1.75} />
        Cargá un movimiento
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-40 bg-tinta/20" onClick={() => setAbierto(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Nuevo movimiento"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-xl border-t border-linea bg-superficie p-4 pb-6 lg:inset-y-0 lg:left-auto lg:right-0 lg:h-full lg:max-h-none lg:w-[420px] lg:rounded-none lg:border-l lg:border-t-0"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-tinta">Nuevo movimiento</h2>
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
              <div
                className="flex rounded-lg border border-linea p-1"
                role="radiogroup"
                aria-label="Tipo de movimiento"
              >
                {[
                  { valor: "egreso" as const, etiqueta: "Egreso" },
                  { valor: "ingreso" as const, etiqueta: "Ingreso" },
                ].map((opcion) => (
                  <button
                    key={opcion.valor}
                    type="button"
                    role="radio"
                    aria-checked={tipo === opcion.valor}
                    onClick={() => setTipo(opcion.valor)}
                    className={`h-9 flex-1 rounded-md text-sm font-medium transition ${
                      tipo === opcion.valor
                        ? "bg-acento/10 text-acento"
                        : "text-tinta-suave hover:text-tinta"
                    }`}
                  >
                    {opcion.etiqueta}
                  </button>
                ))}
              </div>
              <input type="hidden" name="tipo" value={tipo} />

              <div className="flex flex-col gap-1">
                <label htmlFor="movimiento-monto" className={ETIQUETA}>
                  Monto
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-tinta-suave">$</span>
                  <input
                    id="movimiento-monto"
                    name="monto"
                    type="number"
                    min={1}
                    step="any"
                    required
                    autoFocus
                    placeholder="50000"
                    className="h-11 w-40 rounded-lg border border-linea bg-superficie px-3 text-sm tabular-nums text-tinta placeholder:text-tinta-suave focus:border-acento focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="movimiento-categoria" className={ETIQUETA}>
                  Categoría
                </label>
                <input
                  id="movimiento-categoria"
                  name="categoria"
                  type="text"
                  list="categorias-sugeridas"
                  placeholder="general"
                  className={CAMPO}
                />
                <datalist id="categorias-sugeridas">
                  {CATEGORIAS_SUGERIDAS.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="movimiento-detalle" className={ETIQUETA}>
                  Detalle (opcional)
                </label>
                <input
                  id="movimiento-detalle"
                  name="detalle"
                  type="text"
                  placeholder="Factura de luz de julio"
                  className={CAMPO}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="movimiento-fecha" className={ETIQUETA}>
                    Fecha
                  </label>
                  <input
                    id="movimiento-fecha"
                    name="fecha"
                    type="date"
                    required
                    defaultValue={hoy}
                    className={CAMPO}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="movimiento-ambito" className={ETIQUETA}>
                    Ámbito
                  </label>
                  <select id="movimiento-ambito" name="ambito" defaultValue="" className={CAMPO}>
                    <option value="">Entidad</option>
                    {edificios.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={enCurso}
                className="h-11 w-full rounded-lg bg-acento text-sm font-medium text-acento-tinta transition hover:opacity-90 disabled:opacity-60"
              >
                {enCurso ? "Guardando…" : "Guardá el movimiento"}
              </button>

              {estado?.error && <p className="text-sm text-peligro">{estado.error}</p>}
            </form>
          </div>
        </>
      )}
    </>
  );
}
