"use server";

import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";
import { obtenerContextoOrg } from "@/lib/org";

type Resultado = { error?: string };

export async function guardarPerfil(orgId: string, formData: FormData): Promise<Resultado> {
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto) return { error: "No tenés acceso." };

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { error: "El nombre es obligatorio." };

  const crudo = String(formData.get("telefono") ?? "").trim();
  const limpio = crudo.replace(/[\s\-()]/g, "");
  if (limpio && !/^\+[1-9][0-9]{6,14}$/.test(limpio)) {
    return { error: "El teléfono va con código de país, tipo +549115555555." };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("perfiles")
    .update({ nombre, telefono: limpio || null })
    .eq("id", contexto.perfilId);
  if (error) {
    if (error.code === "23505") return { error: "Ese teléfono ya está en otra cuenta." };
    return { error: error.message };
  }

  revalidatePath(`/o/${orgId}/mas/perfil`);
  return {};
}

export async function guardarPreferencias(orgId: string, formData: FormData): Promise<Resultado> {
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto) return { error: "No tenés acceso." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("preferencias_notificaciones").upsert({
    usuario_id: contexto.perfilId,
    wa: formData.get("wa") === "on",
    email: formData.get("email") === "on",
    push: formData.get("push") === "on",
  });
  if (error) return { error: error.message };

  revalidatePath(`/o/${orgId}/mas/perfil`);
  return {};
}
