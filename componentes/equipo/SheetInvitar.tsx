"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X } from "lucide-react";
import type { Rol } from "@/lib/equipo";
import { invitarMiembro } from "@/app/(app)/o/[orgId]/equipo/acciones";
import { useToast } from "@/componentes/ui/Toast";

type Estado = { error?: string } | null;

export function SheetInvitar({ orgId, roles }: { orgId: string; roles: Rol[] }) {
  const [abierto, setAbierto] = useState(false);
  const router = useRouter();
  const { mostrar } = useToast();

  async function accion(_previo: Estado, formData: FormData): Promise<Estado> {
    const resultado = await invitarMiembro(orgId, formData);
    if (resultado.error) return resultado;
    setAbierto(false);
    mostrar("Invitación enviada.");
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

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex h-11 items-center gap-2 rounded-lg bg-acento px-4 text-sm font-medium text-acento-tinta transition hover:opacity-90"
      >
        <UserPlus size={20} strokeWidth={1.75} />
        Invitá a alguien
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-40 bg-tinta/20" onClick={() => setAbierto(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Invitar a alguien"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-xl border-t border-linea bg-superficie p-4 pb-6 lg:inset-y-0 lg:left-auto lg:right-0 lg:h-full lg:max-h-none lg:w-[420px] lg:rounded-none lg:border-l lg:border-t-0"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-tinta">Invitá a alguien</h2>
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
                <label htmlFor="invitar-email" className="text-[13px] text-tinta-suave">
                  Email
                </label>
                <input
                  id="invitar-email"
                  name="email"
                  type="email"
                  required
                  autoFocus
                  placeholder="persona@ejemplo.com"
                  className="h-11 w-full rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta placeholder:text-tinta-suave focus:border-acento focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="invitar-rol" className="text-[13px] text-tinta-suave">
                  Rol
                </label>
                <select
                  id="invitar-rol"
                  name="rol_id"
                  required
                  defaultValue={roles[0]?.id ?? ""}
                  className="h-11 w-full rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta focus:border-acento focus:outline-none"
                >
                  {roles.map((rol) => (
                    <option key={rol.id} value={rol.id}>
                      {rol.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <p className="text-sm text-tinta-suave">
                Le llega un email con un enlace para entrar. Si ya tiene cuenta, se suma directo con
                el rol elegido.
              </p>

              <button
                type="submit"
                disabled={enCurso}
                className="h-11 w-full rounded-lg bg-acento text-sm font-medium text-acento-tinta transition hover:opacity-90 disabled:opacity-60"
              >
                {enCurso ? "Invitando…" : "Mandá la invitación"}
              </button>

              {estado?.error && <p className="text-sm text-peligro">{estado.error}</p>}
            </form>
          </div>
        </>
      )}
    </>
  );
}
