"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, X } from "lucide-react";
import type { Rol } from "@/lib/equipo";
import { crearRol, editarRol } from "@/app/(app)/o/[orgId]/equipo/acciones";

type Estado = { error?: string } | null;

const PERMISOS: { clave: string; etiqueta: string; nota?: string }[] = [
  { clave: "proyectos", etiqueta: "Proyectos y tareas" },
  { clave: "equipo", etiqueta: "Equipo y track record" },
  { clave: "finanzas", etiqueta: "Finanzas" },
  { clave: "espacios", etiqueta: "Espacios" },
  { clave: "admin", etiqueta: "Administración total", nota: "Incluye gestionar miembros y roles." },
];

export function SheetRol({
  orgId,
  rol,
}: {
  orgId: string;
  /** null = alta */
  rol: Rol | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const router = useRouter();
  const esAlta = rol === null;

  async function accion(_previo: Estado, formData: FormData): Promise<Estado> {
    const resultado = esAlta
      ? await crearRol(orgId, formData)
      : await editarRol(orgId, rol.id, formData);
    if (resultado.error) return resultado;
    setAbierto(false);
    router.refresh();
    return null;
  }

  const [estado, enviarAccion, enCurso] = useActionState(accion, null);

  useEffect(() => {
    if (!abierto) return;
    function alTeclado(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAbierto(false);
    }
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, [abierto]);

  const permisosActuales = rol?.permisos as Record<string, boolean> | undefined;

  return (
    <>
      {esAlta ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="flex h-11 items-center gap-2 rounded-lg bg-acento px-4 text-sm font-medium text-acento-tinta transition hover:opacity-90"
        >
          <Plus size={20} strokeWidth={1.75} />
          Creá un rol
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          aria-label={`Editá el rol ${rol.nombre}`}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-tinta-suave transition hover:text-acento"
        >
          <Pencil size={20} strokeWidth={1.75} />
        </button>
      )}

      {abierto && (
        <>
          <div className="fixed inset-0 z-40 bg-tinta/20" onClick={() => setAbierto(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={esAlta ? "Nuevo rol" : `Editar rol ${rol.nombre}`}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-xl border-t border-linea bg-superficie p-4 pb-6 lg:inset-y-0 lg:left-auto lg:right-0 lg:h-full lg:max-h-none lg:w-[420px] lg:rounded-none lg:border-l lg:border-t-0"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-tinta">
                {esAlta ? "Nuevo rol" : rol.nombre}
              </h2>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar"
                className="flex h-11 w-11 items-center justify-center text-tinta-suave hover:text-tinta"
              >
                <X size={20} strokeWidth={1.75} />
              </button>
            </div>

            <form action={enviarAccion} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="rol-nombre" className="text-[13px] text-tinta-suave">
                  Nombre
                </label>
                <input
                  id="rol-nombre"
                  name="nombre"
                  type="text"
                  required
                  autoFocus={esAlta}
                  defaultValue={rol?.nombre ?? ""}
                  placeholder="Comunicación"
                  className="h-11 w-full rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta placeholder:text-tinta-suave focus:border-acento focus:outline-none"
                />
              </div>

              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 text-[13px] text-tinta-suave">Permisos</legend>
                {PERMISOS.map((p) => (
                  <label
                    key={p.clave}
                    className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-tinta"
                  >
                    <input
                      type="checkbox"
                      name={p.clave}
                      defaultChecked={permisosActuales?.[p.clave] ?? false}
                      className="h-5 w-5 accent-[var(--color-acento)]"
                    />
                    <span>
                      {p.etiqueta}
                      {p.nota && <span className="ml-1.5 text-xs text-tinta-suave">{p.nota}</span>}
                    </span>
                  </label>
                ))}
              </fieldset>

              <button
                type="submit"
                disabled={enCurso}
                className="h-11 w-full rounded-lg bg-acento text-sm font-medium text-acento-tinta transition hover:opacity-90 disabled:opacity-60"
              >
                {enCurso ? "Guardando…" : esAlta ? "Creá el rol" : "Guardá los cambios"}
              </button>

              {estado?.error && <p className="text-sm text-peligro">{estado.error}</p>}
            </form>
          </div>
        </>
      )}
    </>
  );
}
