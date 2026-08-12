"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X } from "lucide-react";
import type { Rol } from "@/lib/equipo";
import { invitarMiembro, altaDirecta } from "@/app/(app)/o/[orgId]/equipo/acciones";
import { useToast } from "@/componentes/ui/Toast";

type Estado = { error?: string } | null;

export function SheetInvitar({ orgId, roles }: { orgId: string; roles: Rol[] }) {
  const [abierto, setAbierto] = useState(false);
  // "invitar" manda el mail con enlace; "directa" crea la cuenta con una
  // contraseña puesta acá, para cuando el mail no llega o la persona no tiene
  // acceso a su casilla en el momento.
  const [modo, setModo] = useState<"invitar" | "directa">("invitar");
  const router = useRouter();
  const { mostrar } = useToast();

  async function accion(_previo: Estado, formData: FormData): Promise<Estado> {
    const resultado =
      modo === "invitar"
        ? await invitarMiembro(orgId, formData)
        : await altaDirecta(orgId, formData);
    if (resultado.error) return resultado;
    setAbierto(false);
    mostrar(modo === "invitar" ? "Invitación enviada." : "Cuenta creada.");
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

            <div className="mb-4 flex gap-2">
              {(["invitar", "directa"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModo(m)}
                  aria-pressed={modo === m}
                  className={`flex h-9 flex-1 items-center justify-center rounded-lg text-sm transition ${
                    modo === m
                      ? "bg-acento/12 font-medium text-acento"
                      : "border border-linea text-tinta-suave"
                  }`}
                >
                  {m === "invitar" ? "Por email" : "Con contraseña"}
                </button>
              ))}
            </div>

            <form action={enviarAccion} className="flex flex-col gap-4">
              {modo === "directa" && (
                <div className="flex flex-col gap-1">
                  <label htmlFor="alta-nombre" className="text-[13px] text-tinta-suave">
                    Nombre
                  </label>
                  <input
                    id="alta-nombre"
                    name="nombre"
                    required
                    placeholder="Nombre y apellido"
                    className="h-11 w-full rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta placeholder:text-tinta-suave focus:border-acento focus:outline-none"
                  />
                </div>
              )}

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

              {modo === "directa" && (
                <div className="flex flex-col gap-1">
                  <label htmlFor="alta-password" className="text-[13px] text-tinta-suave">
                    Contraseña provisoria
                  </label>
                  <input
                    id="alta-password"
                    name="password"
                    type="text"
                    required
                    minLength={8}
                    autoComplete="off"
                    placeholder="Al menos 8 caracteres"
                    className="h-11 w-full rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta placeholder:text-tinta-suave focus:border-acento focus:outline-none"
                  />
                </div>
              )}

              <p className="text-sm text-tinta-suave">
                {modo === "invitar"
                  ? "Le llega un email con un enlace para entrar. Si ya tiene cuenta, se suma directo con el rol elegido."
                  : "Se crea la cuenta lista para usar y le pasás la contraseña vos. Decile que la cambie desde Perfil al entrar. Si ya tiene cuenta, no se le toca la contraseña: solo se la suma a la organización."}
              </p>

              <button
                type="submit"
                disabled={enCurso}
                className="h-11 w-full rounded-lg bg-acento text-sm font-medium text-acento-tinta transition hover:opacity-90 disabled:opacity-60"
              >
                {enCurso
                  ? modo === "invitar" ? "Invitando…" : "Creando…"
                  : modo === "invitar" ? "Mandá la invitación" : "Creá la cuenta"}
              </button>

              {estado?.error && <p className="text-sm text-peligro">{estado.error}</p>}
            </form>
          </div>
        </>
      )}
    </>
  );
}
