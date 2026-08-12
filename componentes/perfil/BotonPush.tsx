"use client";

import { useEffect, useState } from "react";
import { BellRing, BellOff } from "lucide-react";
import {
  guardarSuscripcionPush,
  borrarSuscripcionPush,
} from "@/app/(app)/o/[orgId]/mas/perfil/acciones";

/**
 * La VAPID pública viaja en base64url; PushManager la quiere en bytes.
 * Se construye sobre un ArrayBuffer explícito: el tipo por defecto de
 * Uint8Array es ArrayBufferLike, que incluye SharedArrayBuffer y no encaja en
 * BufferSource.
 */
function aBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const relleno = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + relleno).replace(/-/g, "+").replace(/_/g, "/");
  const crudo = atob(base64);
  const buffer = new ArrayBuffer(crudo.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < crudo.length; i++) bytes[i] = crudo.charCodeAt(i);
  return bytes;
}

function aBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

type Estado = "cargando" | "no-soportado" | "sin-clave" | "bloqueado" | "activo" | "inactivo";

export function BotonPush({ vapidPublica }: { vapidPublica: string }) {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // El estado se resuelve una sola vez y se aplica al final: así el efecto no
  // llama a setState de forma sincrónica, y si el componente se desmonta
  // mientras se registra el service worker no se escribe sobre un montaje ido.
  useEffect(() => {
    let vivo = true;

    Promise.resolve()
      .then(async (): Promise<Estado> => {
        if (!vapidPublica) return "sin-clave";
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
          return "no-soportado";
        }
        if (Notification.permission === "denied") return "bloqueado";

        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        return sub ? "activo" : "inactivo";
      })
      .catch((): Estado => "no-soportado")
      .then((resuelto) => {
        if (vivo) setEstado(resuelto);
      });

    return () => {
      vivo = false;
    };
  }, [vapidPublica]);

  async function activar() {
    setOcupado(true);
    setError(null);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? "bloqueado" : "inactivo");
        return;
      }

      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: aBytes(vapidPublica),
      });

      const r = await guardarSuscripcionPush({
        endpoint: sub.endpoint,
        p256dh: aBase64(sub.getKey("p256dh")),
        auth: aBase64(sub.getKey("auth")),
      });
      if (r.error) {
        setError(r.error);
        await sub.unsubscribe();
        return;
      }
      setEstado("activo");
    } catch {
      setError("No pudimos activar los avisos en este dispositivo.");
    } finally {
      setOcupado(false);
    }
  }

  async function desactivar() {
    setOcupado(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await borrarSuscripcionPush(sub.endpoint);
        await sub.unsubscribe();
      }
      setEstado("inactivo");
    } catch {
      setError("No pudimos desactivar los avisos.");
    } finally {
      setOcupado(false);
    }
  }

  if (estado === "cargando") return null;

  if (estado === "sin-clave" || estado === "no-soportado") {
    return (
      <p className="text-sm text-tinta-suave">
        {estado === "sin-clave"
          ? "Los avisos del navegador no están configurados en este servidor."
          : "Este navegador no soporta avisos push. En iPhone hay que agregar la app a la pantalla de inicio primero."}
      </p>
    );
  }

  if (estado === "bloqueado") {
    return (
      <p className="text-sm text-tinta-suave">
        Bloqueaste los avisos para este sitio. Para volver a activarlos hay que permitirlos
        desde la configuración del navegador.
      </p>
    );
  }

  const activo = estado === "activo";
  return (
    <div>
      <button
        type="button"
        disabled={ocupado}
        onClick={activo ? desactivar : activar}
        className={`flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium transition disabled:opacity-60 ${
          activo
            ? "border border-linea text-tinta hover:bg-linea/40"
            : "bg-acento text-acento-tinta hover:opacity-90"
        }`}
      >
        {activo ? <BellOff size={18} strokeWidth={1.75} /> : <BellRing size={18} strokeWidth={1.75} />}
        {ocupado ? "Un momento…" : activo ? "Desactivar en este dispositivo" : "Activar en este dispositivo"}
      </button>
      <p className="mt-2 text-sm text-tinta-suave">
        {activo
          ? "Vas a recibir avisos en este dispositivo aunque tengas la app cerrada."
          : "Los avisos llegan al navegador aunque la app esté cerrada. Se activa por dispositivo."}
      </p>
      {error && <p className="mt-2 text-sm text-peligro">{error}</p>}
    </div>
  );
}
