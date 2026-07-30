"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { agregarMiembro, quitarMiembro } from "@/app/(app)/o/[orgId]/tareas/acciones";

function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? "")
    .join("");
}

export function EquipoProyecto({
  proyectoId,
  miembros,
  todosDeLaOrg,
  puedeGestionar,
}: {
  proyectoId: string;
  miembros: { perfil_id: string; nombre: string }[];
  todosDeLaOrg: { perfil_id: string; nombre: string }[];
  puedeGestionar: boolean;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState("");

  const disponibles = todosDeLaOrg.filter(
    (m) => !miembros.some((mi) => mi.perfil_id === m.perfil_id)
  );

  function agregar() {
    if (!seleccion) return;
    setError(null);
    startTransition(async () => {
      const resultado = await agregarMiembro(proyectoId, seleccion);
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      setSeleccion("");
      router.refresh();
    });
  }

  function quitar(perfilId: string) {
    setError(null);
    startTransition(async () => {
      const resultado = await quitarMiembro(proyectoId, perfilId);
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {miembros.length === 0 ? (
        <p className="text-sm text-tinta-suave">Todavía no hay nadie en el equipo.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {miembros.map((m) => (
            <div
              key={m.perfil_id}
              className="flex h-11 items-center gap-2 rounded-lg border border-linea bg-panel py-1 pl-1 pr-3"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-acento text-xs font-medium text-acento-tinta">
                {iniciales(m.nombre)}
              </span>
              <span className="text-sm text-tinta">{m.nombre}</span>
            </div>
          ))}
        </div>
      )}

      {puedeGestionar && (
        <div className="flex flex-col gap-2">
          {miembros.length > 0 && (
            <div className="flex flex-col">
              {miembros.map((m) => (
                <div
                  key={m.perfil_id}
                  className="flex min-h-11 items-center justify-between gap-3 border-b border-linea py-1 last:border-b-0"
                >
                  <span className="text-sm text-tinta">{m.nombre}</span>
                  <button
                    type="button"
                    onClick={() => quitar(m.perfil_id)}
                    disabled={pendiente}
                    className="flex h-11 items-center rounded-lg px-3 text-sm text-peligro transition hover:bg-peligro/10 disabled:opacity-60"
                  >
                    Quitá
                  </button>
                </div>
              ))}
            </div>
          )}

          {disponibles.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={seleccion}
                onChange={(evento) => setSeleccion(evento.target.value)}
                className="h-11 flex-1 rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta focus:border-acento focus:outline-none"
              >
                <option value="">Sumá al equipo…</option>
                {disponibles.map((m) => (
                  <option key={m.perfil_id} value={m.perfil_id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={agregar}
                disabled={pendiente || !seleccion}
                aria-label="Sumá al equipo"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-acento text-acento-tinta transition hover:opacity-90 disabled:opacity-60"
              >
                <UserPlus size={20} strokeWidth={1.75} />
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-peligro">{error}</p>}
    </div>
  );
}
