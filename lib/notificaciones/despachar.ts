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
const MAX_INTENTOS = 3;

export async function despachar(
  admin: SupabaseClient,
  enviarEmail: EnviarEmail,
  from: string,
  ahora: () => Date = () => new Date()
): Promise<Resumen> {
  const resumen: Resumen = { rescatadas: 0, enviadas: 0, descartadas: 0, reintentos: 0, fallidas: 0 };

  const { data: rescatadas } = await admin.rpc("rescatar_notificaciones_colgadas");
  resumen.rescatadas = rescatadas ?? 0;

  const { data: lote, error: errorClaim } = await admin.rpc("reclamar_notificaciones", {
    canales: ["email"], maximo: LOTE,
  });
  if (errorClaim) throw new Error(`claim falló: ${errorClaim.message}`);

  for (const n of (lote ?? []) as {
    id: string; usuario_id: string; evento: string;
    payload: Record<string, unknown>; programada_para: string | null; intentos: number;
  }[]) {
    const { data: perfil } = await admin
      .from("perfiles").select("email").eq("id", n.usuario_id).single();
    const { data: prefs } = await admin
      .from("preferencias_notificaciones").select("email").eq("usuario_id", n.usuario_id).maybeSingle();

    const decision = perfil
      ? decidirEnvio(n, { email: prefs?.email ?? true }, ahora())
      : "descartar";
    if (decision === "descartar") {
      await admin.from("notificaciones")
        .update({ estado: "descartada" }).eq("id", n.id);
      resumen.descartadas++;
      continue;
    }

    const { asunto, texto } = renderEmail(n);
    const envio = await enviarEmail({ from, to: perfil!.email, subject: asunto, text: texto });

    if (envio.ok) {
      await admin.from("notificaciones")
        .update({ estado: "enviada", enviada_en: ahora().toISOString(), ultimo_error: null })
        .eq("id", n.id);
      resumen.enviadas++;
    } else {
      const intentos = n.intentos + 1;
      const agotado = intentos >= MAX_INTENTOS;
      await admin.from("notificaciones")
        .update({
          estado: agotado ? "fallida" : "pendiente",
          intentos,
          reclamada_en: null,
          ultimo_error: (envio.error ?? "error desconocido").slice(0, 500),
        })
        .eq("id", n.id);
      if (agotado) resumen.fallidas++; else resumen.reintentos++;
    }
  }
  return resumen;
}
