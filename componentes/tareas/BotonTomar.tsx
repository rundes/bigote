"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { tomarTarea, soltarTarea } from "@/app/(app)/o/[orgId]/tareas/acciones";
import { useToast } from "@/componentes/ui/Toast";

export function BotonTomar({
  tareaId,
  orgId,
  proyectoId,
  onOcultar,
  onRestaurar,
}: {
  tareaId: string;
  orgId: string;
  proyectoId?: string;
  onOcultar: () => void;
  onRestaurar: () => void;
}) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [pendiente, startTransition] = useTransition();

  async function deshacer() {
    const resultado = await soltarTarea(tareaId, orgId, proyectoId);
    if (resultado.error) {
      mostrar(resultado.error);
    } else {
      onRestaurar();
    }
    router.refresh();
  }

  function tomar() {
    // Optimista: la fila desaparece al toque, antes de esperar al servidor.
    onOcultar();
    startTransition(async () => {
      const resultado = await tomarTarea(tareaId, orgId, proyectoId);
      if (resultado.error) {
        onRestaurar();
        mostrar(resultado.error);
        router.refresh();
        return;
      }
      mostrar("La tomaste", { etiqueta: "Deshacer", onAccion: deshacer });
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={tomar}
      disabled={pendiente}
      className="flex h-11 shrink-0 items-center rounded-lg bg-acento px-3 text-sm font-medium text-acento-tinta transition hover:opacity-90 disabled:opacity-60"
    >
      Tomala
    </button>
  );
}
