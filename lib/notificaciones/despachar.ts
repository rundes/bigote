import type { SupabaseClient } from "@supabase/supabase-js";
import { renderEmail, decidirEnvio } from "./emails";

export type EnviarEmail = (args: {
  from: string; to: string; subject: string; text: string;
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

      const { asunto, texto } = renderEmail(n);
      const envio = await enviarEmail({ from, to: perfil!.email, subject: asunto, text: texto });

      if (envio.ok) {
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
      // Un throw (p.ej. el fetch de Resend por un corte de red) no debe
      // estrangular el resto del lote: se trata igual que un fallo de
      // envío, con su reintento/agotamiento normal.
      const mensaje = e instanceof Error ? e.message : String(e);
      console.error(`despachar: excepción procesando ${n.id}`, e);
      await marcarFallo(admin, n, mensaje, resumen);
    }
  }
  return resumen;
}
