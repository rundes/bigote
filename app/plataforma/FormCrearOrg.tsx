"use client";

import { useActionState } from "react";
import { crearOrgConAdmin } from "./acciones";

type Estado = { error: string } | null;

async function accion(_previo: Estado, formData: FormData): Promise<Estado> {
  const resultado = await crearOrgConAdmin(formData);
  return resultado ?? null;
}

export function FormCrearOrg() {
  const [estado, enviarAccion, enCurso] = useActionState(accion, null);

  return (
    <form
      action={enviarAccion}
      className="flex flex-col gap-3 rounded-xl border border-linea bg-superficie p-6 shadow-sm"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="nombre" className="text-sm font-medium text-tinta">
          Nombre de la organización
        </label>
        <input
          id="nombre"
          name="nombre"
          type="text"
          required
          placeholder="Fundación Delta"
          className="h-11 w-full rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta placeholder:text-tinta-suave focus:border-acento focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="tipo" className="text-sm font-medium text-tinta">
          Tipo
        </label>
        <select
          id="tipo"
          name="tipo"
          required
          defaultValue="empresa"
          className="h-11 w-full rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta focus:border-acento focus:outline-none"
        >
          <option value="empresa">Empresa</option>
          <option value="asociacion_civil">Asociación civil</option>
          <option value="otro">Otro</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium text-tinta">
          Email del primer admin
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="admin@laorganizacion.com"
          className="h-11 w-full rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta placeholder:text-tinta-suave focus:border-acento focus:outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={enCurso}
        className="mt-2 h-11 w-full rounded-lg bg-acento text-sm font-medium text-acento-tinta transition hover:opacity-90 disabled:opacity-60"
      >
        {enCurso ? "Creando…" : "Creá la organización"}
      </button>

      {estado?.error && (
        <p className="text-sm text-peligro">{estado.error}</p>
      )}
    </form>
  );
}
