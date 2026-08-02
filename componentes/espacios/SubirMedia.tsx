"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus } from "lucide-react";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { pedirSubidaMedia, registrarMedia } from "@/app/(app)/o/[orgId]/espacios/acciones";
import { useToast } from "@/componentes/ui/Toast";

const MAX_FOTO = 10 * 1024 * 1024;
const MAX_VIDEO = 200 * 1024 * 1024;

export function SubirMedia({
  orgId,
  edificioId,
  salaId,
}: {
  orgId: string;
  edificioId: string;
  /** null = media del edificio */
  salaId: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const router = useRouter();
  const { mostrar } = useToast();

  async function alElegir(archivo: File) {
    const tipo = archivo.type.startsWith("image/")
      ? ("foto" as const)
      : archivo.type.startsWith("video/")
        ? ("video" as const)
        : null;
    if (!tipo) {
      mostrar("Elegí una foto o un video.");
      return;
    }
    if (tipo === "foto" && archivo.size > MAX_FOTO) {
      mostrar("Las fotos pueden pesar hasta 10 MB.");
      return;
    }
    if (tipo === "video" && archivo.size > MAX_VIDEO) {
      mostrar("Los videos pueden pesar hasta 200 MB.");
      return;
    }

    const extension = archivo.name.split(".").pop() ?? "";
    setSubiendo(true);
    try {
      const pedido = await pedirSubidaMedia(edificioId, tipo, extension);
      if (pedido.error || !pedido.path || !pedido.token) {
        mostrar(pedido.error ?? "No pudimos preparar la subida.");
        return;
      }

      // Subida directa del navegador a Storage (los videos no pasan por el
      // server action, que tiene límite de body).
      const supabase = crearClienteNavegador();
      const { error: errorSubida } = await supabase.storage
        .from("espacios")
        .uploadToSignedUrl(pedido.path, pedido.token, archivo);
      if (errorSubida) {
        mostrar("La subida falló. Probá de nuevo.");
        return;
      }

      const registro = await registrarMedia(orgId, edificioId, salaId, tipo, pedido.path);
      if (registro.error) {
        mostrar(registro.error);
        return;
      }
      router.refresh();
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          if (archivo) void alElegir(archivo);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={subiendo}
        className="flex h-11 items-center gap-2 rounded-lg border border-linea px-3 text-sm font-medium text-tinta transition hover:border-acento hover:text-acento disabled:opacity-60"
      >
        <ImagePlus size={20} strokeWidth={1.75} />
        {subiendo ? "Subiendo…" : "Subí una foto o video"}
      </button>
    </>
  );
}
