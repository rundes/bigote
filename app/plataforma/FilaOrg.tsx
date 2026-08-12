"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { editarOrg, borrarOrg } from "./acciones";

const TIPOS = [
  { valor: "empresa", etiqueta: "Empresa" },
  { valor: "asociacion_civil", etiqueta: "Asociación civil" },
  { valor: "otro", etiqueta: "Otro" },
];

export type ResumenOrg = {
  id: string;
  nombre: string;
  tipo: string;
  miembros: number;
  proyectos: number;
  edificios: number;
  articulos: number;
};

export function FilaOrg({ org }: { org: ResumenOrg }) {
  const router = useRouter();
  const [modo, setModo] = useState<"ver" | "editar" | "borrar">("ver");
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function guardar(formData: FormData) {
    setOcupado(true);
    setError(null);
    const r = await editarOrg(org.id, formData);
    setOcupado(false);
    if (r.error) return setError(r.error);
    setModo("ver");
    router.refresh();
  }

  async function borrar() {
    setOcupado(true);
    setError(null);
    const r = await borrarOrg(org.id, confirmacion);
    setOcupado(false);
    if (r.error) return setError(r.error);
    setModo("ver");
    setConfirmacion("");
    router.refresh();
  }

  const etiquetaTipo = TIPOS.find((t) => t.valor === org.tipo)?.etiqueta ?? org.tipo;
  const contenido = [
    [org.miembros, "miembro", "miembros"],
    [org.proyectos, "proyecto", "proyectos"],
    [org.edificios, "edificio", "edificios"],
    [org.articulos, "artículo", "artículos"],
  ] as const;

  return (
    <li className="rounded-lg border border-linea bg-superficie px-4 py-3">
      {modo === "ver" && (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-tinta">{org.nombre}</p>
            <p className="text-xs text-tinta-suave">
              {etiquetaTipo} · {org.miembros} miembro{org.miembros === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              aria-label={`Editar ${org.nombre}`}
              onClick={() => setModo("editar")}
              className="flex size-11 items-center justify-center rounded-lg text-tinta-suave transition hover:bg-linea/40 hover:text-tinta"
            >
              <Pencil size={18} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              aria-label={`Borrar ${org.nombre}`}
              onClick={() => setModo("borrar")}
              className="flex size-11 items-center justify-center rounded-lg text-tinta-suave transition hover:bg-peligro/10 hover:text-peligro"
            >
              <Trash2 size={18} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      )}

      {modo === "editar" && (
        <form action={guardar} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={`nombre-${org.id}`} className="text-[13px] text-tinta-suave">
              Nombre
            </label>
            <input
              id={`nombre-${org.id}`}
              name="nombre"
              defaultValue={org.nombre}
              required
              className="h-11 rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta focus:border-acento focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`tipo-${org.id}`} className="text-[13px] text-tinta-suave">
              Tipo
            </label>
            <select
              id={`tipo-${org.id}`}
              name="tipo"
              defaultValue={org.tipo}
              className="h-11 rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta focus:border-acento focus:outline-none"
            >
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-peligro">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setModo("ver");
                setError(null);
              }}
              className="h-11 flex-1 rounded-lg border border-linea text-sm text-tinta"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={ocupado}
              className="h-11 flex-1 rounded-lg bg-acento text-sm font-medium text-acento-tinta disabled:opacity-60"
            >
              {ocupado ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      )}

      {modo === "borrar" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-tinta">
            Borrar &ldquo;{org.nombre}&rdquo;
          </p>
          <p className="text-sm text-tinta-suave">
            Esto es irreversible. Se borra también todo lo que cuelga de la organización:
          </p>
          <ul className="flex flex-col gap-0.5 text-sm text-tinta">
            {contenido.map(([n, sing, plur]) => (
              <li key={plur} className="tabular-nums">
                {n} {n === 1 ? sing : plur}
              </li>
            ))}
            <li className="text-tinta-suave">
              y sus tareas, salas, reservas, movimientos y notificaciones
            </li>
          </ul>

          <div className="flex flex-col gap-1">
            <label htmlFor={`conf-${org.id}`} className="text-[13px] text-tinta-suave">
              Escribí <span className="font-medium text-tinta">{org.nombre}</span> para
              confirmar
            </label>
            <input
              id={`conf-${org.id}`}
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)}
              autoComplete="off"
              className="h-11 rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta focus:border-peligro focus:outline-none"
            />
          </div>

          {error && <p className="text-sm text-peligro">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setModo("ver");
                setConfirmacion("");
                setError(null);
              }}
              className="h-11 flex-1 rounded-lg border border-linea text-sm text-tinta"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={ocupado || confirmacion.trim() !== org.nombre}
              onClick={borrar}
              className="h-11 flex-1 rounded-lg bg-peligro text-sm font-medium text-acento-tinta disabled:opacity-45"
            >
              {ocupado ? "Borrando…" : "Borrar para siempre"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
