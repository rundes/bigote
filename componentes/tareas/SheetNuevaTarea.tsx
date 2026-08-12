"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { crearTarea } from "@/app/(app)/o/[orgId]/tareas/acciones";

type Estado = { error?: string } | null;

export function SheetNuevaTarea({
  proyectoId,
  miembros,
}: {
  proyectoId: string;
  miembros: { perfil_id: string; nombre: string }[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [dificultad, setDificultad] = useState(3);
  const router = useRouter();

  async function accion(_previo: Estado, formData: FormData): Promise<Estado> {
    const resultado = await crearTarea(proyectoId, formData);
    if (resultado.error) return resultado;
    setAbierto(false);
    setDificultad(3);
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
        Agregá una tarea
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-40 bg-tinta/20" onClick={() => setAbierto(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Nueva tarea"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-xl border-t border-linea bg-superficie p-4 pb-6 lg:inset-y-0 lg:left-auto lg:right-0 lg:h-full lg:max-h-none lg:w-[420px] lg:rounded-none lg:border-l lg:border-t-0"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-tinta">Nueva tarea</h2>
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
                <label htmlFor="titulo-tarea" className="text-[13px] text-tinta-suave">
                  Título
                </label>
                <input
                  id="titulo-tarea"
                  name="titulo"
                  type="text"
                  required
                  autoFocus
                  placeholder="Armar el flyer"
                  className="h-11 w-full rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta placeholder:text-tinta-suave focus:border-acento focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="descripcion-tarea" className="text-[13px] text-tinta-suave">
                  Descripción (opcional)
                </label>
                <textarea
                  id="descripcion-tarea"
                  name="descripcion"
                  rows={3}
                  placeholder="Detalles para quien la tome"
                  className="w-full rounded-lg border border-linea bg-superficie px-3 py-2 text-sm text-tinta placeholder:text-tinta-suave focus:border-acento focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[13px] text-tinta-suave">Dificultad</span>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={dificultad === n}
                      aria-label={`Dificultad ${n} de 5`}
                      onClick={() => setDificultad(n)}
                      className={`flex h-11 w-11 items-center justify-center rounded-lg border text-lg transition ${
                        n <= dificultad
                          ? "border-acento bg-acento/10 text-acento"
                          : "border-linea text-tinta-suave"
                      }`}
                    >
                      ●
                    </button>
                  ))}
                </div>
                <input type="hidden" name="dificultad" value={dificultad} />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="asignado-tarea" className="text-[13px] text-tinta-suave">
                  Asignar a (opcional)
                </label>
                <select
                  id="asignado-tarea"
                  name="asignado_a"
                  defaultValue=""
                  className="h-11 w-full rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta focus:border-acento focus:outline-none"
                >
                  <option value="">Pool (sin asignar)</option>
                  {miembros.map((m) => (
                    <option key={m.perfil_id} value={m.perfil_id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="fecha-tarea" className="text-[13px] text-tinta-suave">
                  Para cuándo (opcional)
                </label>
                <input
                  id="fecha-tarea"
                  name="fecha_estimada"
                  type="date"
                  className="h-11 w-full rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta focus:border-acento focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={enCurso}
                className="h-11 w-full rounded-lg bg-acento text-sm font-medium text-acento-tinta transition hover:opacity-90 disabled:opacity-60"
              >
                {enCurso ? "Agregando…" : "Agregá la tarea"}
              </button>

              {estado?.error && <p className="text-sm text-peligro">{estado.error}</p>}
            </form>
          </div>
        </>
      )}
    </>
  );
}
