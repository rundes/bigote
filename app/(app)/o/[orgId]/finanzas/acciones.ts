"use server";

import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";
import { obtenerContextoOrg } from "@/lib/org";
import { listarEdificios } from "@/lib/espacios";

type Resultado = { error?: string };

export async function crearMovimiento(orgId: string, formData: FormData): Promise<Resultado> {
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto || !contexto.permisos.finanzas) {
    return { error: "No tenés permiso para cargar movimientos." };
  }

  const tipo = String(formData.get("tipo") ?? "");
  if (tipo !== "ingreso" && tipo !== "egreso") return { error: "Elegí ingreso o egreso." };

  const monto = Number(formData.get("monto"));
  if (!Number.isFinite(monto) || monto <= 0) {
    return { error: "El monto tiene que ser mayor a cero." };
  }

  const categoria = String(formData.get("categoria") ?? "").trim() || "general";
  const detalle = String(formData.get("detalle") ?? "").trim();

  const fecha = String(formData.get("fecha") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "Elegí la fecha." };

  // "" = entidad; sino, un edificio que la org activa opere (propietaria o
  // gestora), validado contra la lista visible para esta org.
  const ambitoRaw = String(formData.get("ambito") ?? "").trim();
  let edificio_id: string | null = null;
  if (ambitoRaw) {
    const edificios = await listarEdificios(orgId);
    if (!edificios.some((e) => e.id === ambitoRaw)) {
      return { error: "Ese edificio no es de esta organización." };
    }
    edificio_id = ambitoRaw;
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("movimientos").insert({
    org_id: orgId,
    edificio_id,
    tipo,
    categoria,
    monto,
    detalle,
    fecha,
    origen: "manual",
    creado_por: contexto.perfilId,
  });
  if (error) return { error: error.message };

  revalidatePath(`/o/${orgId}/finanzas`);
  return {};
}
