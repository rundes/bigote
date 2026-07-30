"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical } from "lucide-react";
import { renombrarProyecto, archivarProyecto } from "@/app/(app)/o/[orgId]/tareas/acciones";

export function MenuProyecto({
  proyectoId,
  nombreActual,
}: {
  proyectoId: string;
  nombreActual: string;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [renombrando, setRenombrando] = useState(false);
  const [confirmarArchivo, setConfirmarArchivo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function cerrar() {
    setAbierto(false);
    setRenombrando(false);
    setConfirmarArchivo(false);
    setError(null);
  }

  useEffect(() => {
    if (!abierto) return;
    function alClicAfuera(evento: MouseEvent) {
      if (ref.current && !ref.current.contains(evento.target as Node)) cerrar();
    }
    function alTeclado(evento: KeyboardEvent) {
      if (evento.key === "Escape") cerrar();
    }
    document.addEventListener("mousedown", alClicAfuera);
    document.addEventListener("keydown", alTeclado);
    return () => {
      document.removeEventListener("mousedown", alClicAfuera);
      document.removeEventListener("keydown", alTeclado);
    };
  }, [abierto]);

  function alRenombrar(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const resultado = await renombrarProyecto(proyectoId, formData);
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      cerrar();
      router.refresh();
    });
  }

  function alArchivar() {
    if (!confirmarArchivo) {
      setConfirmarArchivo(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const resultado = await archivarProyecto(proyectoId);
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      cerrar();
      router.refresh();
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label="Más opciones del proyecto"
        aria-expanded={abierto}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-tinta-suave transition hover:bg-linea/40 hover:text-tinta"
      >
        <MoreVertical size={20} strokeWidth={1.75} />
      </button>

      {abierto && (
        <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-lg border border-linea bg-superficie p-3 shadow-sm">
          {renombrando ? (
            <form action={alRenombrar} className="flex flex-col gap-2">
              <input
                name="nombre"
                defaultValue={nombreActual}
                autoFocus
                required
                className="h-11 w-full rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta focus:border-acento focus:outline-none"
              />
              <button
                type="submit"
                disabled={pendiente}
                className="h-11 rounded-lg bg-acento text-sm font-medium text-acento-tinta transition hover:opacity-90 disabled:opacity-60"
              >
                Guardá
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setRenombrando(true)}
              className="flex h-11 w-full items-center rounded-lg px-2 text-left text-sm text-tinta transition hover:bg-panel"
            >
              Renombrá
            </button>
          )}

          <button
            type="button"
            onClick={alArchivar}
            disabled={pendiente}
            className={`flex h-11 w-full items-center rounded-lg px-2 text-left text-sm transition hover:bg-panel disabled:opacity-60 ${
              confirmarArchivo ? "text-peligro" : "text-tinta"
            }`}
          >
            {confirmarArchivo ? "¿Seguro? Archivá" : "Archivá"}
          </button>

          {error && <p className="mt-1 text-xs text-peligro">{error}</p>}
        </div>
      )}
    </div>
  );
}
