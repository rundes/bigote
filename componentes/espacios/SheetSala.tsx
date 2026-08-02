"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, X } from "lucide-react";
import type { Sala } from "@/lib/espacios";
import { crearSala, editarSala } from "@/app/(app)/o/[orgId]/espacios/acciones";

type Estado = { error?: string } | null;

const CAMPO = "h-11 w-full rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta placeholder:text-tinta-suave focus:border-acento focus:outline-none";
const ETIQUETA = "text-[13px] text-tinta-suave";

export function SheetSala({
  orgId,
  edificioId,
  sala,
}: {
  orgId: string;
  edificioId: string;
  /** null = alta */
  sala: Sala | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<"publica" | "privada">(sala?.tipo ?? "publica");
  const router = useRouter();
  const esAlta = sala === null;

  async function accion(_previo: Estado, formData: FormData): Promise<Estado> {
    const resultado = esAlta
      ? await crearSala(orgId, edificioId, formData)
      : await editarSala(orgId, edificioId, sala.id, formData);
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
          className="flex h-11 items-center gap-2 rounded-lg bg-acento px-4 text-sm font-medium text-acento-tinta transition hover:opacity-90"
        >
          <Plus size={20} strokeWidth={1.75} />
          Agregá una sala
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          aria-label={`Editá ${sala.nombre}`}
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
            aria-label={esAlta ? "Nueva sala" : `Editar ${sala.nombre}`}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-xl border-t border-linea bg-superficie p-4 pb-6 lg:inset-y-0 lg:left-auto lg:right-0 lg:h-full lg:max-h-none lg:w-[420px] lg:rounded-none lg:border-l lg:border-t-0"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-tinta">
                {esAlta ? "Nueva sala" : sala.nombre}
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
                <label htmlFor="sala-nombre" className={ETIQUETA}>
                  Nombre
                </label>
                <input
                  id="sala-nombre"
                  name="nombre"
                  type="text"
                  required
                  autoFocus={esAlta}
                  defaultValue={sala?.nombre ?? ""}
                  placeholder="Sala grande"
                  className={CAMPO}
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className={ETIQUETA}>Tipo</span>
                <div className="flex rounded-lg border border-linea p-1" role="radiogroup" aria-label="Tipo de sala">
                  {[
                    { valor: "publica" as const, etiqueta: "Pública" },
                    { valor: "privada" as const, etiqueta: "Privada" },
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
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="sala-descripcion" className={ETIQUETA}>
                  Descripción
                </label>
                <textarea
                  id="sala-descripcion"
                  name="descripcion"
                  rows={3}
                  defaultValue={sala?.descripcion ?? ""}
                  placeholder="Capacidad, equipamiento, para qué sirve"
                  className="w-full rounded-lg border border-linea bg-superficie px-3 py-2 text-sm text-tinta placeholder:text-tinta-suave focus:border-acento focus:outline-none"
                />
              </div>

              {!esAlta && (
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-tinta">
                  <input
                    type="checkbox"
                    name="activa"
                    defaultChecked={sala.activa}
                    className="h-5 w-5 accent-[var(--color-acento)]"
                  />
                  Se puede reservar
                </label>
              )}
              {esAlta && <input type="hidden" name="activa" value="on" />}

              <button
                type="submit"
                disabled={enCurso}
                className="h-11 w-full rounded-lg bg-acento text-sm font-medium text-acento-tinta transition hover:opacity-90 disabled:opacity-60"
              >
                {enCurso ? "Guardando…" : esAlta ? "Agregá la sala" : "Guardá los cambios"}
              </button>

              {estado?.error && <p className="text-sm text-peligro">{estado.error}</p>}
            </form>
          </div>
        </>
      )}
    </>
  );
}
