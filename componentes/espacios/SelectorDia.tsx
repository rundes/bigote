"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const nueva = new Date(Date.UTC(y, m - 1, d + dias));
  const yy = nueva.getUTCFullYear();
  const mm = String(nueva.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(nueva.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function etiquetaDia(fecha: string, hoy: string): string {
  if (fecha === hoy) return "Hoy";
  if (fecha === sumarDias(hoy, 1)) return "Mañana";
  const [y, m, d] = fecha.split("-").map(Number);
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function SelectorDia({ fecha, hoy }: { fecha: string; hoy: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function irA(nueva: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("fecha", nueva);
    router.replace(`?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => irA(sumarDias(fecha, -1))}
        aria-label="Día anterior"
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-linea text-tinta-suave transition hover:text-tinta"
      >
        <ChevronLeft size={20} strokeWidth={1.75} />
      </button>

      <label className="relative flex h-11 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-lg border border-linea px-3 text-sm font-medium text-tinta sm:flex-none sm:px-4">
        <span className="truncate first-letter:uppercase">{etiquetaDia(fecha, hoy)}</span>
        <input
          type="date"
          value={fecha}
          onChange={(e) => e.target.value && irA(e.target.value)}
          aria-label="Elegí la fecha"
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>

      <button
        type="button"
        onClick={() => irA(sumarDias(fecha, 1))}
        aria-label="Día siguiente"
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-linea text-tinta-suave transition hover:text-tinta"
      >
        <ChevronRight size={20} strokeWidth={1.75} />
      </button>

      {fecha !== hoy && (
        <button
          type="button"
          onClick={() => irA(hoy)}
          className="h-11 rounded-lg px-3 text-sm font-medium text-acento transition hover:opacity-80"
        >
          Hoy
        </button>
      )}
    </div>
  );
}
