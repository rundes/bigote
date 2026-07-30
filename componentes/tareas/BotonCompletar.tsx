"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { completarTarea } from "@/app/(app)/o/[orgId]/tareas/acciones";
import { useToast } from "@/componentes/ui/Toast";

const DURACION_ANIMACION_MS = 200;

function esperar(ms: number) {
  return new Promise<void>((resolver) => setTimeout(resolver, ms));
}

export function BotonCompletar({
  tareaId,
  orgId,
  proyectoId,
  onAnimar,
  onOcultar,
}: {
  tareaId: string;
  orgId: string;
  proyectoId?: string;
  onAnimar: (saliendo: boolean) => void;
  onOcultar: () => void;
}) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [pendiente, startTransition] = useTransition();
  const [animando, setAnimando] = useState(false);

  function completar() {
    // Check + fade de la fila primero, recién después se llama al servidor.
    setAnimando(true);
    onAnimar(true);
    startTransition(async () => {
      await esperar(DURACION_ANIMACION_MS);
      const resultado = await completarTarea(tareaId, orgId, proyectoId);
      if (resultado.error) {
        setAnimando(false);
        onAnimar(false);
        mostrar(resultado.error);
        router.refresh();
        return;
      }
      onOcultar();
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={completar}
      disabled={pendiente || animando}
      className="flex h-11 shrink-0 items-center justify-center rounded-lg bg-acento px-3 text-sm font-medium text-acento-tinta transition hover:opacity-90 disabled:opacity-60"
    >
      {animando ? <Check size={18} strokeWidth={2} aria-hidden="true" /> : "Marcá hecha"}
    </button>
  );
}
