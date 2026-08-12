"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";
import type { Miembro, Rol } from "@/lib/equipo";
import {
  cambiarRol,
  desactivarMiembro,
  reactivarMiembro,
  editarMiembro,
} from "@/app/(app)/o/[orgId]/equipo/acciones";
import { useToast } from "@/componentes/ui/Toast";

function SheetDesactivar({
  miembro,
  onConfirmar,
  onCerrar,
  enCurso,
}: {
  miembro: Miembro;
  onConfirmar: () => void;
  onCerrar: () => void;
  enCurso: boolean;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-tinta/20" onClick={onCerrar} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Desactivar a ${miembro.nombre}`}
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-xl border-t border-linea bg-superficie p-4 pb-6 lg:inset-y-0 lg:left-auto lg:right-0 lg:h-full lg:w-[420px] lg:rounded-none lg:border-l lg:border-t-0"
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-tinta">Desactivar a {miembro.nombre}</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-11 w-11 items-center justify-center text-tinta-suave hover:text-tinta"
          >
            <X size={20} strokeWidth={1.75} />
          </button>
        </div>
        <p className="mb-4 text-sm text-tinta-suave">
          Pierde el acceso a la organización desde ahora. Su historial (tareas completadas,
          reservas, movimientos) queda intacto y podés reactivarla cuando quieras.
        </p>
        <button
          type="button"
          onClick={onConfirmar}
          disabled={enCurso}
          className="h-11 w-full rounded-lg bg-peligro text-sm font-medium text-acento-tinta transition hover:opacity-90 disabled:opacity-60"
        >
          {enCurso ? "Desactivando…" : "Desactivala"}
        </button>
      </div>
    </>
  );
}

export function ListaMiembros({
  orgId,
  miembros,
  roles,
  esAdmin,
  perfilPropioId,
}: {
  orgId: string;
  miembros: Miembro[];
  roles: Rol[];
  esAdmin: boolean;
  perfilPropioId: string;
}) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [enCurso, iniciar] = useTransition();
  const [aDesactivar, setADesactivar] = useState<Miembro | null>(null);
  const [editando, setEditando] = useState<string | null>(null);

  function ejecutar(accion: () => Promise<{ error?: string }>, mensajeOk?: string) {
    iniciar(async () => {
      const resultado = await accion();
      if (resultado.error) {
        mostrar(resultado.error);
      } else {
        if (mensajeOk) mostrar(mensajeOk);
        router.refresh();
      }
    });
  }

  if (miembros.length === 0) {
    return <p className="text-sm text-tinta-suave">Todavía no hay miembros.</p>;
  }

  return (
    <div className="flex flex-col">
      {miembros.map((m) => (
        <div
          key={m.perfil_id}
          className={`flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 border-b border-linea py-2 last:border-b-0 ${
            m.activo ? "" : "opacity-45"
          }`}
        >
          <div className="min-w-0 flex-1 basis-40">
            {editando === m.perfil_id ? (
              <form
                action={(fd) => {
                  ejecutar(() => editarMiembro(orgId, m.perfil_id, fd), "Nombre actualizado.");
                  setEditando(null);
                }}
                className="flex items-center gap-2"
              >
                <input
                  name="nombre"
                  defaultValue={m.nombre}
                  autoFocus
                  aria-label={`Nombre de ${m.email}`}
                  className="h-11 min-w-0 flex-1 rounded-lg border border-linea bg-superficie px-2 text-sm text-tinta focus:border-acento focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={enCurso}
                  className="h-11 shrink-0 rounded-lg bg-acento px-3 text-sm font-medium text-acento-tinta disabled:opacity-60"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => setEditando(null)}
                  className="h-11 shrink-0 px-2 text-sm text-tinta-suave"
                >
                  Cancelar
                </button>
              </form>
            ) : (
              <>
                <p className="flex items-center gap-1 truncate text-sm font-medium text-tinta">
                  {m.nombre || m.email}
                  {m.perfil_id === perfilPropioId && (
                    <span className="text-xs font-normal text-tinta-suave">(vos)</span>
                  )}
                  {esAdmin && (
                    <button
                      type="button"
                      onClick={() => setEditando(m.perfil_id)}
                      aria-label={`Editar nombre de ${m.nombre || m.email}`}
                      className="shrink-0 rounded p-1 text-tinta-suave transition hover:text-acento"
                    >
                      <Pencil size={14} strokeWidth={1.75} />
                    </button>
                  )}
                </p>
                <p className="truncate text-sm text-tinta-suave">
                  {m.email}
                  {!m.activo && " · Sin acceso"}
                </p>
              </>
            )}
          </div>

          {esAdmin ? (
            <div className="flex shrink-0 items-center gap-2">
              <select
                value={m.rol_id}
                disabled={enCurso || !m.activo}
                onChange={(e) =>
                  ejecutar(() => cambiarRol(orgId, m.perfil_id, e.target.value), "Rol actualizado.")
                }
                aria-label={`Rol de ${m.nombre || m.email}`}
                className="h-11 rounded-lg border border-linea bg-superficie px-2 text-sm text-tinta focus:border-acento focus:outline-none disabled:opacity-60"
              >
                {roles.map((rol) => (
                  <option key={rol.id} value={rol.id}>
                    {rol.nombre}
                  </option>
                ))}
              </select>
              {m.activo ? (
                <button
                  type="button"
                  disabled={enCurso}
                  onClick={() => setADesactivar(m)}
                  className="h-11 rounded-lg px-3 text-sm font-medium text-peligro transition hover:bg-peligro/10 disabled:opacity-60"
                >
                  Desactivala
                </button>
              ) : (
                <button
                  type="button"
                  disabled={enCurso}
                  onClick={() =>
                    ejecutar(() => reactivarMiembro(orgId, m.perfil_id), "Miembro reactivado.")
                  }
                  className="h-11 rounded-lg px-3 text-sm font-medium text-acento transition hover:bg-acento/10 disabled:opacity-60"
                >
                  Reactivala
                </button>
              )}
            </div>
          ) : (
            <span className="shrink-0 text-sm text-tinta-suave">{m.rol_nombre}</span>
          )}
        </div>
      ))}

      {aDesactivar && (
        <SheetDesactivar
          miembro={aDesactivar}
          enCurso={enCurso}
          onCerrar={() => setADesactivar(null)}
          onConfirmar={() =>
            ejecutar(async () => {
              const resultado = await desactivarMiembro(orgId, aDesactivar.perfil_id);
              if (!resultado.error) setADesactivar(null);
              return resultado;
            }, "Miembro desactivado.")
          }
        />
      )}
    </div>
  );
}
