import type { SupabaseClient } from "@supabase/supabase-js";
import { renderEmail, decidirEnvio } from "./emails";
import { enviarPush, renderPush, pushConfigurado, type SuscripcionPush } from "./push";

export type EnviarEmail = (args: {
  from: string; to: string; subject: string; text: string; html?: string;
}) => Promise<{ ok: boolean; error?: string }>;

export type Resumen = {
  rescatadas: number; enviadas: number; descartadas: number;
  reintentos: number; fallidas: number;
};

const LOTE = 50;
// Debe quedar por debajo del tope de rescate (5, en
// rescatar_notificaciones_colgadas / migración 0010): ambos contadores
// comparten la columna `intentos`, así que esta cuenta agota la fila
// ("fallida") bastante antes de que el rescate la de por perdida.
const MAX_INTENTOS = 3;

type NotificacionLote = {
  id: string; usuario_id: string; evento: string;
  payload: Record<string, unknown>; programada_para: string | null; intentos: number;
};

async function marcarFallo(
  admin: SupabaseClient, n: NotificacionLote, mensaje: string, resumen: Resumen
): Promise<void> {
  const intentos = n.intentos + 1;
  const agotado = intentos >= MAX_INTENTOS;
  const { error } = await admin.from("notificaciones")
    .update({
      estado: agotado ? "fallida" : "pendiente",
      intentos,
      reclamada_en: null,
      ultimo_error: mensaje.slice(0, 500),
    })
    .eq("id", n.id);
  if (error) console.error(`despachar: no pude registrar el fallo de ${n.id}`, error);
  if (agotado) resumen.fallidas++; else resumen.reintentos++;
}

export async function despachar(
  admin: SupabaseClient,
  enviarEmail: EnviarEmail,
  from: string,
  ahora: () => Date = () => new Date()
): Promise<Resumen> {
  const resumen: Resumen = { rescatadas: 0, enviadas: 0, descartadas: 0, reintentos: 0, fallidas: 0 };

  const { data: rescatadas, error: errorRescate } = await admin.rpc("rescatar_notificaciones_colgadas");
  if (errorRescate) {
    console.error("despachar: rescate falló", errorRescate);
  } else {
    resumen.rescatadas = rescatadas ?? 0;
  }

  const { data: lote, error: errorClaim } = await admin.rpc("reclamar_notificaciones", {
    canales: ["email"], maximo: LOTE,
  });
  if (errorClaim) throw new Error(`claim falló: ${errorClaim.message}`);

  const notificaciones = (lote ?? []) as NotificacionLote[];
  if (notificaciones.length === 0) return resumen;

  // Hoisteados fuera del loop: 2 queries batcheadas en vez de hasta 50 × 2
  // (N+1). Con Resend real, 3 round trips seriales por fila contra hosted
  // ya rozaban el maxDuration=60 del route handler con un lote lleno.
  const usuarioIds = [...new Set(notificaciones.map((n) => n.usuario_id))];
  const { data: perfiles, error: errorPerfiles } = await admin
    .from("perfiles").select("id, email").in("id", usuarioIds);
  if (errorPerfiles) console.error("despachar: lookup de perfiles falló", errorPerfiles);
  const perfilPorId = new Map((perfiles ?? []).map((p) => [p.id as string, p as { id: string; email: string }]));

  const { data: prefs, error: errorPrefs } = await admin
    .from("preferencias_notificaciones").select("usuario_id, email").in("usuario_id", usuarioIds);
  if (errorPrefs) console.error("despachar: lookup de preferencias falló", errorPrefs);
  const prefPorUsuario = new Map(
    (prefs ?? []).map((p) => [p.usuario_id as string, p as { usuario_id: string; email: boolean }])
  );

  for (const n of notificaciones) {
    // Flags para el catch: si el envío ya salió (Resend lo aceptó) o ya se
    // tomó la decisión de descartar, una excepción DESPUÉS de ese punto
    // (p.ej. el update de cierre tirando por un corte de red) no debe
    // pasar por marcarFallo — eso reencolaría una fila que ya se resolvió
    // y fabricaría un email duplicado (o un reintento espurio sobre un
    // descarte ya decidido). Solo una excepción ANTES de resolver
    // (render, el propio enviarEmail) es un fallo de envío real.
    let envioExitoso = false;
    let decisionDescartar = false;
    try {
      // Si la query batcheada de perfiles o preferencias falló, no hay
      // datos confiables para NINGUNA fila del lote: se dejan "enviando"
      // (ya logueado arriba) y las recupera el rescate en vez de
      // descartarlas a ciegas o mandarlas sin re-chequear preferencias.
      if (errorPerfiles || errorPrefs) continue;

      const perfil = perfilPorId.get(n.usuario_id);
      // perfil ausente acá NO puede ser "usuario borrado": la FK
      // notificaciones.usuario_id → perfiles tiene ON DELETE CASCADE, así
      // que si el perfil no existiera la fila tampoco existiría. Solo
      // llega acá por un desfasaje de timing improbable; se descarta y se
      // deja rastro.
      const prefsUsuario = prefPorUsuario.get(n.usuario_id);

      const decision = perfil
        ? decidirEnvio(n, { email: prefsUsuario?.email ?? true }, ahora())
        : "descartar";
      if (decision === "descartar") {
        decisionDescartar = true;
        const { error } = await admin.from("notificaciones")
          .update({
            estado: "descartada",
            reclamada_en: null,
            ultimo_error: perfil ? null : "perfil no encontrado al despachar",
          })
          .eq("id", n.id);
        if (error) console.error(`despachar: no pude marcar descartada ${n.id}`, error);
        resumen.descartadas++;
        continue;
      }

      const { asunto, texto, html } = renderEmail(n);
      const envio = await enviarEmail({ from, to: perfil!.email, subject: asunto, text: texto, html });

      if (envio.ok) {
        envioExitoso = true;
        const { error } = await admin.from("notificaciones")
          .update({ estado: "enviada", enviada_en: ahora().toISOString(), ultimo_error: null, reclamada_en: null })
          .eq("id", n.id);
        if (error) {
          // El email ya salió (Resend lo aceptó); si este update falla la
          // fila puede quedar "enviando" y el rescate la reencola en hasta
          // 10 min → posible reenvío duplicado. No hay at-most-once
          // perfecto sin outbox transaccional; se deja rastro en logs.
          console.error(
            `despachar: envié ${n.id} pero no pude marcarla enviada (riesgo de duplicado por rescate)`, error
          );
        }
        resumen.enviadas++;
      } else {
        await marcarFallo(admin, n, envio.error ?? "error desconocido", resumen);
      }
    } catch (e) {
      if (envioExitoso || decisionDescartar) {
        // Ver comentario arriba del try: no reintentar algo ya resuelto.
        // La fila queda "enviando" (el update de cierre fue lo que tiró);
        // la retoma el rescate, con el mismo riesgo residual de reenvío
        // ya documentado y aceptado en el camino feliz de arriba.
        console.error(
          `despachar: excepción tras resolver ${n.id} (envioExitoso=${envioExitoso}, descartada=${decisionDescartar}); no reintenta, la retoma el rescate`,
          e
        );
        if (envioExitoso) resumen.enviadas++; else resumen.descartadas++;
        continue;
      }
      // Excepción ANTES de decidir/enviar (p.ej. el fetch de Resend por un
      // corte de red): se trata como un fallo de envío real, con su
      // reintento/agotamiento normal. No estrangula el resto del lote.
      const mensaje = e instanceof Error ? e.message : String(e);
      console.error(`despachar: excepción procesando ${n.id}`, e);
      await marcarFallo(admin, n, mensaje, resumen);
    }
  }
  return resumen;
}

/**
 * Pase de push, paralelo al de email. Comparte el claim atómico y la política
 * de reintentos, pero tiene su propio ciclo porque el destinatario no es una
 * dirección sino N suscripciones de navegador, y cada una puede morir por
 * separado.
 *
 * Una notificación se da por enviada si al menos una suscripción la aceptó.
 * Si todas están muertas (404/410), se descarta en vez de reintentar: no hay
 * a dónde mandarla y reintentar tres veces solo demora el vaciado de la cola.
 */
export async function despacharPush(
  admin: SupabaseClient,
  ahora: () => Date = () => new Date()
): Promise<Resumen> {
  const resumen: Resumen = { rescatadas: 0, enviadas: 0, descartadas: 0, reintentos: 0, fallidas: 0 };

  if (!pushConfigurado()) return resumen;

  const { data: lote, error: errorClaim } = await admin.rpc("reclamar_notificaciones", {
    canales: ["push"], maximo: LOTE,
  });
  if (errorClaim) throw new Error(`claim push falló: ${errorClaim.message}`);

  const notificaciones = (lote ?? []) as NotificacionLote[];
  if (notificaciones.length === 0) return resumen;

  // Batcheado fuera del loop, igual que en el pase de email: sin esto son
  // hasta 50 queries de suscripciones por corrida.
  const usuarioIds = [...new Set(notificaciones.map((n) => n.usuario_id))];
  const [{ data: suscripciones }, { data: prefs }] = await Promise.all([
    admin
      .from("push_suscripciones")
      .select("id, usuario_id, endpoint, p256dh, auth")
      .in("usuario_id", usuarioIds),
    admin
      .from("preferencias_notificaciones")
      .select("usuario_id, push")
      .in("usuario_id", usuarioIds),
  ]);

  const porUsuario = new Map<string, SuscripcionPush[]>();
  for (const s of (suscripciones ?? []) as (SuscripcionPush & { usuario_id: string })[]) {
    const lista = porUsuario.get(s.usuario_id) ?? [];
    lista.push({ id: s.id, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth });
    porUsuario.set(s.usuario_id, lista);
  }
  const pushPorUsuario = new Map(
    ((prefs ?? []) as { usuario_id: string; push: boolean }[]).map((p) => [p.usuario_id, p.push])
  );

  for (const n of notificaciones) {
    const quiere = pushPorUsuario.get(n.usuario_id) ?? true;
    const susUsuario = porUsuario.get(n.usuario_id) ?? [];

    // Recordatorio cuyo turno ya empezó: mismo criterio que email.
    let vencida = false;
    if (n.evento === "reserva_recordatorio" && n.programada_para !== null) {
      const p = n.payload;
      const inicio = new Date(`${p.fecha}T${String(p.hora_inicio).padStart(2, "0")}:00:00-03:00`);
      vencida = ahora() >= inicio;
    }

    if (!quiere || susUsuario.length === 0 || vencida) {
      await admin.from("notificaciones")
        .update({ estado: "descartada", reclamada_en: null })
        .eq("id", n.id);
      resumen.descartadas++;
      continue;
    }

    const contenido = renderPush(n);
    const muertas: string[] = [];
    let algunaAndubo = false;
    let ultimoError = "";

    for (const s of susUsuario) {
      const r = await enviarPush(s, contenido);
      if (r.ok) algunaAndubo = true;
      else if (r.muerta) muertas.push(s.id);
      else ultimoError = r.error;
    }

    // El navegador ya dio de baja estos endpoints: guardarlos solo hace que
    // cada corrida futura vuelva a intentar contra una URL muerta.
    if (muertas.length > 0) {
      await admin.from("push_suscripciones").delete().in("id", muertas);
    }

    if (algunaAndubo) {
      await admin.from("notificaciones")
        .update({ estado: "enviada", enviada_en: ahora().toISOString(), ultimo_error: null, reclamada_en: null })
        .eq("id", n.id);
      resumen.enviadas++;
    } else if (ultimoError) {
      await marcarFallo(admin, n, ultimoError, resumen);
    } else {
      // Todas muertas y ninguna falla transitoria: no hay a dónde mandarla.
      await admin.from("notificaciones")
        .update({ estado: "descartada", reclamada_en: null, ultimo_error: "sin suscripciones vivas" })
        .eq("id", n.id);
      resumen.descartadas++;
    }
  }

  return resumen;
}
