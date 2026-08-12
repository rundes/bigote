"use server";

import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";
import { obtenerContextoOrg } from "@/lib/org";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { randomUUID } from "node:crypto";

type Resultado = { error?: string; ok?: boolean };

export async function guardarCobrosConfig(
  orgId: string,
  formData: FormData
): Promise<Resultado> {
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto || !contexto.permisos.finanzas) {
    return { error: "No tenés permiso para configurar cobros." };
  }

  const alias = String(formData.get("alias") ?? "").trim();
  const cbu = String(formData.get("cbu") ?? "").trim();
  const activo = formData.get("activo") === "on";

  // Mismo check que en la base, pero acá el mensaje explica el porqué.
  if (activo && !alias && !cbu) {
    return { error: "Para activar el cobro previo cargá al menos el alias o el CBU." };
  }
  if (cbu && !/^\d{22}$/.test(cbu)) {
    return { error: "El CBU tiene que tener 22 dígitos." };
  }

  const plazo = Number(formData.get("plazo_horas") ?? 48);
  if (!Number.isInteger(plazo) || plazo < 1 || plazo > 720) {
    return { error: "El plazo tiene que estar entre 1 y 720 horas." };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("cobros_config").upsert(
    {
      org_id: orgId,
      alias,
      cbu,
      titular: String(formData.get("titular") ?? "").trim(),
      cuit: String(formData.get("cuit") ?? "").trim(),
      banco: String(formData.get("banco") ?? "").trim(),
      instrucciones: String(formData.get("instrucciones") ?? "").trim(),
      plazo_horas: plazo,
      activo,
    },
    { onConflict: "org_id" }
  );
  if (error) return { error: "No pudimos guardar la configuración." };

  revalidatePath(`/o/${orgId}/finanzas/cobros`);
  return { ok: true };
}

const EXTENSIONES_COMPROBANTE = new Set(["pdf", "jpg", "jpeg", "png", "webp"]);

/**
 * Emite una URL firmada para subir el comprobante. El archivo lo sube el
 * navegador directo al storage: no pasa por el servidor de Next, que tiene
 * límite de tamaño de body y encarecería una subida que no necesita lógica.
 */
export async function pedirSubidaComprobante(
  orgId: string,
  reservaId: string,
  extension: string
): Promise<Resultado & { path?: string; token?: string }> {
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto || !contexto.permisos.finanzas) {
    return { error: "No tenés permiso para registrar pagos." };
  }

  const ext = extension.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!EXTENSIONES_COMPROBANTE.has(ext)) {
    return { error: "El comprobante tiene que ser PDF o imagen (jpg, png o webp)." };
  }

  const admin = crearClienteAdmin();
  const path = `${orgId}/${reservaId}/${randomUUID()}.${ext}`;
  const { data, error } = await admin.storage.from("comprobantes").createSignedUploadUrl(path);
  if (error || !data) return { error: "No pudimos preparar la subida. Probá de nuevo." };

  return { path: data.path, token: data.token };
}

/** URL de lectura de vida corta: el bucket es privado a propósito. */
export async function urlDeComprobante(
  orgId: string,
  path: string
): Promise<Resultado & { url?: string }> {
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto || !contexto.permisos.finanzas) {
    return { error: "No tenés permiso para ver comprobantes." };
  }
  if (!path.startsWith(`${orgId}/`)) {
    return { error: "Ese comprobante no es de la organización." };
  }

  const admin = crearClienteAdmin();
  const { data, error } = await admin.storage.from("comprobantes").createSignedUrl(path, 300);
  if (error || !data) return { error: "No pudimos abrir el comprobante." };
  return { url: data.signedUrl };
}

export async function registrarPago(
  orgId: string,
  reservaId: string,
  monto: number,
  comprobantePath?: string | null
): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("registrar_pago_reserva", {
    reserva: reservaId,
    monto,
    metodo: "transferencia",
    comprobante: comprobantePath ?? null,
    nota: "",
  });
  if (error) {
    const limpio = (error.message ?? "").replace(/^.*?:\s*/, "").trim();
    return { error: limpio || "No pudimos registrar el pago." };
  }

  revalidatePath(`/o/${orgId}/finanzas/cobros`);
  revalidatePath(`/o/${orgId}/finanzas`);
  revalidatePath(`/o/${orgId}/espacios`);
  return { ok: true };
}
