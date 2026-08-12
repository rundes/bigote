"use client";

export function BotonImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="h-10 shrink-0 rounded-lg bg-acento px-4 text-sm font-medium text-acento-tinta transition hover:opacity-90"
    >
      Imprimir
    </button>
  );
}
