"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import type { Media } from "@/lib/espacios";
import { borrarMedia } from "@/app/(app)/o/[orgId]/espacios/acciones";
import { useToast } from "@/componentes/ui/Toast";

function BotonBorrar({
  orgId,
  edificioId,
  mediaId,
}: {
  orgId: string;
  edificioId: string;
  mediaId: string;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [enCurso, setEnCurso] = useState(false);
  const router = useRouter();
  const { mostrar } = useToast();

  async function borrar() {
    setEnCurso(true);
    const resultado = await borrarMedia(orgId, edificioId, mediaId);
    setEnCurso(false);
    if (resultado.error) {
      mostrar(resultado.error);
      setConfirmando(false);
      return;
    }
    router.refresh();
  }

  if (confirmando) {
    return (
      <button
        type="button"
        onClick={borrar}
        onBlur={() => setConfirmando(false)}
        disabled={enCurso}
        className="absolute right-1 top-1 rounded-lg bg-peligro px-2 py-1 text-xs font-medium text-acento-tinta disabled:opacity-60"
      >
        {enCurso ? "Borrando…" : "¿Borrar?"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirmando(true)}
      aria-label="Borrar"
      className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-lg bg-tinta/60 text-fondo transition hover:bg-tinta"
    >
      <X size={14} strokeWidth={2} />
    </button>
  );
}

export function GaleriaMedia({
  orgId,
  edificioId,
  media,
  puedeBorrar,
}: {
  orgId: string;
  edificioId: string;
  media: Media[];
  puedeBorrar: boolean;
}) {
  if (media.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {media.map((m) => (
        <div key={m.id} className="relative shrink-0">
          {m.tipo === "foto" ? (
            // Storage público sin dimensiones conocidas: <img> directo, no next/image
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={m.url}
              alt=""
              loading="lazy"
              className="h-28 w-40 rounded-lg border border-linea object-cover"
            />
          ) : (
            <video
              src={m.url}
              controls
              preload="metadata"
              className="h-28 w-40 rounded-lg border border-linea bg-tinta object-cover"
            />
          )}
          {puedeBorrar && <BotonBorrar orgId={orgId} edificioId={edificioId} mediaId={m.id} />}
        </div>
      ))}
    </div>
  );
}
