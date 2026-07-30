"use client";

import { useState } from "react";
import { PipsDificultad } from "@/componentes/tareas/PipsDificultad";
import { BotonTomar } from "@/componentes/tareas/BotonTomar";
import { BotonCompletar } from "@/componentes/tareas/BotonCompletar";

export type AccionFilaTarea = "tomar" | "completar";

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
  // "oculta": la fila desaparece del todo (optimismo de tomar, o tras el
  // fade de completar). "saliendo": anima la fila mientras espera al
  // servidor (solo completar) antes de ocultarla.
  const [oculta, setOculta] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  if (oculta) return null;

  return (
    <div
      className={`flex flex-col gap-1 border-b border-linea py-2 transition-all duration-200 ease-out last:border-b-0 motion-reduce:transition-none ${
        saliendo ? "-translate-y-1 opacity-0" : "translate-y-0 opacity-100"
      }`}
    >
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

        {accion === "tomar" && (
          <BotonTomar
            tareaId={tarea.id}
            orgId={orgId}
            proyectoId={proyectoId}
            onOcultar={() => setOculta(true)}
            onRestaurar={() => setOculta(false)}
          />
        )}
        {accion === "completar" && (
          <BotonCompletar
            tareaId={tarea.id}
            orgId={orgId}
            proyectoId={proyectoId}
            onAnimar={setSaliendo}
            onOcultar={() => setOculta(true)}
          />
        )}
      </div>
    </div>
  );
}
