"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

function sumarMeses(mes: string, delta: number): string {
  const [y, m] = mes.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`;
}

function etiquetaMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export function SelectorMes({ mes, mesActual }: { mes: string; mesActual: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function irA(nuevo: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("mes", nuevo);
    router.replace(`?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => irA(sumarMeses(mes, -1))}
        aria-label="Mes anterior"
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-linea text-tinta-suave transition hover:text-tinta"
      >
        <ChevronLeft size={20} strokeWidth={1.75} />
      </button>

      <span className="min-w-36 text-center text-sm font-medium text-tinta first-letter:uppercase">
        {etiquetaMes(mes)}
      </span>

      <button
        type="button"
        onClick={() => irA(sumarMeses(mes, 1))}
        aria-label="Mes siguiente"
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-linea text-tinta-suave transition hover:text-tinta"
      >
        <ChevronRight size={20} strokeWidth={1.75} />
      </button>

      {mes !== mesActual && (
        <button
          type="button"
          onClick={() => irA(mesActual)}
          className="h-11 rounded-lg px-3 text-sm font-medium text-acento transition hover:opacity-80"
        >
          Este mes
        </button>
      )}
    </div>
  );
}
