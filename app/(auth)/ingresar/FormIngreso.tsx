"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearClienteNavegador } from "@/lib/supabase/client";

export function FormIngreso() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enlaceEnviado, setEnlaceEnviado] = useState(false);
  const [cargando, setCargando] = useState<"google" | "password" | "magico" | null>(null);

  async function entrarConGoogle() {
    setError(null);
    setCargando("google");
    try {
      const supabase = crearClienteNavegador();
      const { error: errorAuth } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (errorAuth) {
        setError("Google no está configurado todavía. Probá con tu email.");
      }
    } catch {
      setError("No pudimos conectar. Probá de nuevo.");
    } finally {
      setCargando(null);
    }
  }

  async function entrarConPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnlaceEnviado(false);
    setCargando("password");
    try {
      const supabase = crearClienteNavegador();
      const { error: errorAuth } = await supabase.auth.signInWithPassword({ email, password });
      if (errorAuth) {
        setError("No pudimos ingresarte. Revisá el email y la contraseña.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("No pudimos conectar. Probá de nuevo.");
    } finally {
      setCargando(null);
    }
  }

  async function mandarEnlaceMagico() {
    setError(null);
    if (!email) {
      setError("Escribí tu email para mandarte el enlace.");
      return;
    }
    setCargando("magico");
    try {
      const supabase = crearClienteNavegador();
      const { error: errorAuth } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (errorAuth) {
        setError("No pudimos enviarte el enlace. Probá de nuevo.");
        return;
      }
      setEnlaceEnviado(true);
    } catch {
      setError("No pudimos conectar. Probá de nuevo.");
    } finally {
      setCargando(null);
    }
  }

  return (
    <div className="rounded-xl border border-linea bg-superficie p-6 shadow-sm">
      <button
        type="button"
        onClick={entrarConGoogle}
        disabled={cargando !== null}
        className="flex h-11 w-full items-center justify-center rounded-lg border border-linea bg-panel text-sm font-medium text-tinta transition hover:bg-linea/40 disabled:opacity-60"
      >
        {cargando === "google" ? "Conectando…" : "Continuá con Google"}
      </button>

      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-linea" />
        <span className="text-xs text-tinta-suave">o con tu email</span>
        <div className="h-px flex-1 bg-linea" />
      </div>

      <form onSubmit={entrarConPassword} className="flex flex-col gap-3">
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="tu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 w-full rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta placeholder:text-tinta-suave focus:border-acento focus:outline-none"
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-11 w-full rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta placeholder:text-tinta-suave focus:border-acento focus:outline-none"
        />
        <button
          type="submit"
          disabled={cargando !== null}
          className="h-11 w-full rounded-lg bg-acento text-sm font-medium text-acento-tinta transition hover:opacity-90 disabled:opacity-60"
        >
          {cargando === "password" ? "Ingresando…" : "Ingresá"}
        </button>
      </form>

      <button
        type="button"
        onClick={mandarEnlaceMagico}
        disabled={cargando !== null}
        className="mt-3 w-full text-center text-sm text-tinta-suave underline decoration-linea underline-offset-4 hover:text-acento disabled:opacity-60"
      >
        {cargando === "magico" ? "Enviando…" : "Mandame un enlace mágico"}
      </button>

      {enlaceEnviado && (
        <p className="mt-4 text-center text-sm text-ok">
          Revisá tu correo: te mandamos el enlace.
        </p>
      )}

      {error && (
        <p className="mt-4 text-center text-sm text-peligro">{error}</p>
      )}
    </div>
  );
}
