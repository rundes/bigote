"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PipsDificultad } from "@/componentes/tareas/PipsDificultad";
import { tomarTarea, completarTarea } from "@/app/(app)/o/[orgId]/tareas/acciones";

export type AccionFilaTarea = "tomar" | "completar";

// Botones simples (sin optimismo): Task 4 los reemplaza por BotonTomar/
// BotonCompletar con useOptimistic + toast + undo, sin tocar esta interfaz.
export function FilaTarea({
  tarea,
  accion,
  orgId,
  proyectoId,
  subtitulo,
  tachada,
}: {
  tarea: { id: string; titulo: string; dificultad: number };
  accion?: AccionFilaTarea;
  orgId: string;
  proyectoId: string;
  subtitulo?: string;
  tachada?: boolean;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function ejecutar() {
    setError(null);
    startTransition(async () => {
      const resultado =
        accion === "tomar"
          ? await tomarTarea(tarea.id, orgId, proyectoId)
          : await completarTarea(tarea.id, orgId, proyectoId);
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1 border-b border-linea py-2 last:border-b-0">
      <div className="flex min-h-11 items-center gap-3">
        <div className="flex flex-1 flex-col gap-0.5">
          <span
            className={`text-sm ${
              tachada ? "text-tinta-suave line-through" : "text-tinta"
            }`}
          >
            {tarea.titulo}
          </span>
          <div className="flex items-center gap-2">
            <PipsDificultad valor={tarea.dificultad} />
            {subtitulo && <span className="text-xs text-tinta-suave">{subtitulo}</span>}
          </div>
        </div>

        {accion && (
          <button
            type="button"
            onClick={ejecutar}
            disabled={pendiente}
            className="flex h-11 shrink-0 items-center rounded-lg bg-acento px-3 text-sm font-medium text-acento-tinta transition hover:opacity-90 disabled:opacity-60"
          >
            {accion === "tomar" ? "Tomala" : "Marcá hecha"}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-peligro">{error}</p>}
    </div>
  );
}
