import webpush from "web-push";
import type { NotificacionEmail } from "./emails";

/*
  Web Push (fase 3 del spec de notificaciones).

  El navegador entrega el push aunque la pestaña esté cerrada, así que el texto
  tiene que valerse solo: título corto y cuerpo con lo mínimo para decidir si
  abrir. La URL viaja en `data` y la abre el service worker al tocar.
*/

export type SuscripcionPush = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type ResultadoPush =
  | { ok: true }
  | { ok: false; muerta: boolean; error: string };

let configurado = false;

function configurar(): boolean {
  if (configurado) return true;
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  const sujeto = process.env.VAPID_SUBJECT;
  if (!publica || !privada || !sujeto) return false;
  webpush.setVapidDetails(sujeto, publica, privada);
  configurado = true;
  return true;
}

export function pushConfigurado(): boolean {
  return configurar();
}

export function renderPush(n: NotificacionEmail): { titulo: string; cuerpo: string; url: string } {
  const p = n.payload;
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  switch (n.evento) {
    case "reserva_confirmada":
      return { titulo: "Reserva confirmada", cuerpo: `${p.sala} · ${p.fecha} ${p.hora_inicio}:00`, url: base };
    case "reserva_recordatorio":
      return { titulo: `Mañana ${p.hora_inicio}:00`, cuerpo: `${p.sala} (${p.edificio})`, url: base };
    case "reserva_cancelada":
      return { titulo: "Reserva cancelada", cuerpo: `${p.sala} · ${p.fecha}`, url: base };
    case "reserva_esperando_pago":
      return {
        titulo: "Falta el pago",
        cuerpo: `${p.sala} queda reservada hasta que entre la transferencia`,
        url: base,
      };
    case "reserva_vencida":
      return { titulo: "Se liberó tu reserva", cuerpo: `${p.sala} · no llegó el pago`, url: base };
    case "pago_registrado":
      return { titulo: "Pago registrado", cuerpo: `${p.sala} quedó confirmada`, url: base };
    case "tarea_asignada":
      return { titulo: "Tarea nueva", cuerpo: `${p.titulo} · ${p.proyecto}`, url: base };
    case "tarea_hecha":
      return { titulo: "Tarea hecha", cuerpo: `${p.titulo} · ${p.proyecto}`, url: base };
    default:
      return { titulo: "bigote", cuerpo: "Tenés novedades en tu organización.", url: base };
  }
}

/**
 * Envía a una suscripción. `muerta` distingue el caso en que el navegador dio
 * de baja el endpoint (404/410) de un fallo transitorio: la primera se borra,
 * la segunda se reintenta.
 */
export async function enviarPush(
  sus: SuscripcionPush,
  contenido: { titulo: string; cuerpo: string; url: string }
): Promise<ResultadoPush> {
  if (!configurar()) {
    return { ok: false, muerta: false, error: "VAPID sin configurar" };
  }

  try {
    await webpush.sendNotification(
      { endpoint: sus.endpoint, keys: { p256dh: sus.p256dh, auth: sus.auth } },
      JSON.stringify(contenido)
    );
    return { ok: true };
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    return {
      ok: false,
      muerta: status === 404 || status === 410,
      error: `push ${status ?? "?"}: ${(e as Error).message}`,
    };
  }
}
