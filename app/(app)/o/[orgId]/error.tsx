"use client";

export default function ErrorShell({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-semibold text-tinta">Algo salió mal.</h1>
      <p className="max-w-[70ch] text-sm text-tinta-suave">
        No pudimos cargar esta pantalla. Puede ser un problema momentáneo de conexión; probá de
        nuevo y, si sigue, recargá la página.
      </p>
      <button
        type="button"
        onClick={reset}
        className="h-11 rounded-lg bg-acento px-4 text-sm font-medium text-acento-tinta transition hover:opacity-90"
      >
        Probá de nuevo
      </button>
    </div>
  );
}
