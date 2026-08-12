"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type CampoSimple = {
  nombre: string;
  etiqueta: string;
  requerido?: boolean;
  tipo?: "text" | "email";
  ancho?: "completo" | "mitad";
};

/**
 * Alta rápida para las listas de apoyo (ubicaciones, destinatarios): son
 * formularios de dos a seis campos y no justifican un sheet propio cada uno.
 */
export function FormSimple({
  campos,
  accion,
  textoBoton,
}: {
  campos: CampoSimple[];
  accion: (formData: FormData) => Promise<{ error?: string }>;
  textoBoton: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function enviar(formData: FormData) {
    setGuardando(true);
    setError(null);
    const r = await accion(formData);
    setGuardando(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    router.refresh();
  }

  return (
    <form
      action={enviar}
      className="mt-6 rounded-xl border border-linea bg-superficie p-4"
    >
      <div className="flex flex-wrap gap-3">
        {campos.map((c) => (
          <div
            key={c.nombre}
            className={`flex flex-col gap-1 ${
              c.ancho === "mitad" ? "min-w-[9rem] flex-1" : "w-full"
            }`}
          >
            <label htmlFor={c.nombre} className="text-[13px] text-tinta-suave">
              {c.etiqueta}
            </label>
            <input
              id={c.nombre}
              name={c.nombre}
              type={c.tipo ?? "text"}
              required={c.requerido}
              className="h-11 rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta focus:border-acento focus:outline-none"
            />
          </div>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-peligro">{error}</p>}

      <button
        type="submit"
        disabled={guardando}
        className="mt-4 h-11 rounded-lg bg-acento px-4 text-sm font-medium text-acento-tinta disabled:opacity-60"
      >
        {guardando ? "Guardando…" : textoBoton}
      </button>
    </form>
  );
}
