"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FORMATOS, type FormatoEtiqueta } from "@/lib/etiquetas-formatos";

type Fila = { codigo: string; nombre: string; detalle: string };

/**
 * La selección viaja en la URL (`?codigo=...&formato=...`) para que la hoja se
 * pueda compartir, recargar y volver atrás sin perderla.
 */
export function SelectorEtiquetas({
  orgId,
  formatoActual,
  seleccionActual,
  articulos,
  paquetes,
}: {
  orgId: string;
  formatoActual: FormatoEtiqueta;
  seleccionActual: string[];
  articulos: Fila[];
  paquetes: Fila[];
}) {
  const router = useRouter();
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set(seleccionActual));
  const [formato, setFormato] = useState<FormatoEtiqueta>(formatoActual);

  function alternar(codigo: string) {
    setSeleccion((prev) => {
      const proxima = new Set(prev);
      if (proxima.has(codigo)) proxima.delete(codigo);
      else proxima.add(codigo);
      return proxima;
    });
  }

  function generar() {
    const qs = new URLSearchParams();
    qs.set("formato", formato);
    for (const c of seleccion) qs.append("codigo", c);
    router.push(`/o/${orgId}/inventario/etiquetas?${qs.toString()}`);
  }

  const listas: [string, Fila[]][] = [
    ["Artículos", articulos],
    ["Paquetes", paquetes],
  ];

  return (
    <div className="mt-6">
      <fieldset>
        <legend className="text-[13px] text-tinta-suave">Tamaño</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.values(FORMATOS).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFormato(f.id)}
              aria-pressed={formato === f.id}
              className={`flex h-8 items-center rounded-full px-3 text-sm transition ${
                formato === f.id
                  ? "bg-acento/12 font-medium text-acento"
                  : "border border-linea text-tinta-suave hover:text-tinta"
              }`}
            >
              {f.etiqueta} · {f.porHoja}/hoja
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-tinta-suave">{FORMATOS[formato].descripcion}</p>
      </fieldset>

      {listas.map(([titulo, filas]) =>
        filas.length === 0 ? null : (
          <div key={titulo} className="mt-6">
            <h2 className="text-[13px] text-tinta-suave">{titulo}</h2>
            <div className="mt-2 divide-y divide-linea border-y border-linea">
              {filas.map((f) => (
                <label
                  key={f.codigo}
                  className="flex min-h-11 cursor-pointer items-center gap-3 py-2"
                >
                  <input
                    type="checkbox"
                    checked={seleccion.has(f.codigo)}
                    onChange={() => alternar(f.codigo)}
                    className="size-4 accent-[var(--color-acento)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-tinta">{f.nombre}</span>
                    <span className="block font-mono text-xs text-tinta-suave">
                      {f.codigo} · {f.detalle}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )
      )}

      <button
        type="button"
        onClick={generar}
        disabled={seleccion.size === 0}
        className="mt-6 h-10 rounded-lg bg-acento px-4 text-sm font-medium text-acento-tinta transition hover:opacity-90 disabled:opacity-45"
      >
        {seleccion.size === 0
          ? "Elegí al menos una"
          : `Generar ${seleccion.size} ${seleccion.size === 1 ? "etiqueta" : "etiquetas"}`}
      </button>
    </div>
  );
}
