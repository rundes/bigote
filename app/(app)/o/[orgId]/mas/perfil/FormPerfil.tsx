"use client";

import { useState, useTransition } from "react";
import { guardarPerfil, guardarPreferencias } from "./acciones";

type Props = {
  orgId: string;
  perfil: { nombre: string; email: string; telefono: string | null };
  preferencias: { wa: boolean; email: boolean; push: boolean };
};

const CANALES = [
  { clave: "wa", etiqueta: "WhatsApp" },
  { clave: "email", etiqueta: "Email" },
  { clave: "push", etiqueta: "Push en este dispositivo" },
] as const;

export function FormPerfil({ orgId, perfil, preferencias }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function enviar(accion: (o: string, f: FormData) => Promise<{ error?: string }>) {
    return (formData: FormData) =>
      startTransition(async () => {
        setError(null);
        setGuardado(null);
        const resultado = await accion(orgId, formData);
        if (resultado.error) setError(resultado.error);
        else setGuardado("Listo, guardado.");
      });
  }

  return (
    <div className="flex max-w-sm flex-col gap-8">
      <form action={enviar(guardarPerfil)} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="nombre" className="text-[13px] text-tinta-suave">
            Nombre
          </label>
          <input
            id="nombre"
            name="nombre"
            type="text"
            required
            defaultValue={perfil.nombre}
            className="h-11 w-full rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta placeholder:text-tinta-suave focus:border-acento focus:outline-none"
          />
        </div>
        <p className="text-xs text-tinta-suave">{perfil.email}</p>
        <div className="flex flex-col gap-1">
          <label htmlFor="telefono" className="text-[13px] text-tinta-suave">
            Teléfono (WhatsApp)
          </label>
          <input
            id="telefono"
            name="telefono"
            type="tel"
            inputMode="tel"
            defaultValue={perfil.telefono ?? ""}
            placeholder="+549115555555"
            className="h-11 w-full rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta placeholder:text-tinta-suave focus:border-acento focus:outline-none"
          />
        </div>
        <p className="text-xs text-tinta-suave">
          Con código de país. Es el número desde el que vas a hablar con el bot.
        </p>
        <button
          type="submit"
          disabled={pendiente}
          className="h-11 w-full rounded-lg bg-acento text-sm font-medium text-acento-tinta transition hover:opacity-90 disabled:opacity-60"
        >
          {pendiente ? "Guardando…" : "Guardá los cambios"}
        </button>
      </form>

      <form action={enviar(guardarPreferencias)} className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-tinta">Avisos</h2>
        {CANALES.map((canal) => (
          <label
            key={canal.clave}
            className="flex h-11 items-center justify-between text-sm text-tinta"
          >
            {canal.etiqueta}
            <input
              type="checkbox"
              name={canal.clave}
              defaultChecked={preferencias[canal.clave]}
              className="h-5 w-5 accent-acento"
            />
          </label>
        ))}
        <p className="text-xs text-tinta-suave">
          Reservas, invitaciones y tareas. Los avisos empiezan a llegar en las
          próximas fases; tus preferencias ya quedan guardadas.
        </p>
        <button
          type="submit"
          disabled={pendiente}
          className="h-11 w-full rounded-lg bg-acento text-sm font-medium text-acento-tinta transition hover:opacity-90 disabled:opacity-60"
        >
          {pendiente ? "Guardando…" : "Guardá los avisos"}
        </button>
      </form>

      {error && <p className="text-sm text-peligro">{error}</p>}
      {guardado && !error && <p className="text-sm text-ok">{guardado}</p>}
    </div>
  );
}
