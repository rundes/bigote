"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";

async function verificarSuperAdmin() {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { data } = await supabase
    .from("super_admins")
    .select("perfil_id")
    .eq("perfil_id", user.id)
    .maybeSingle();
  if (!data) redirect("/");
  return { supabase, user };
}

export async function crearOrgConAdmin(
  formData: FormData
): Promise<{ error: string } | void> {
  const { supabase } = await verificarSuperAdmin();

  const nombre = String(formData.get("nombre") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!nombre || !tipo || !email) {
    return { error: "Completá todos los campos." };
  }

  const { data: orgId, error: errorRpc } = await supabase.rpc("crear_organizacion", {
    nombre,
    tipo,
    email_admin: email,
  });
  if (errorRpc || !orgId) {
    return { error: errorRpc?.message ?? "No pudimos crear la organización." };
  }

  const admin = crearClienteAdmin();

  let perfilId: string | null = null;
  const { data: invitado, error: errorInvite } = await admin.auth.admin.inviteUserByEmail(email);
  if (errorInvite) {
    const { data: usuarios, error: errorList } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (errorList) {
      return { error: "No pudimos invitar ni ubicar a ese usuario." };
    }
    const existente = usuarios.users.find((u) => u.email === email);
    if (!existente) {
      return { error: errorInvite.message };
    }
    perfilId = existente.id;
  } else {
    perfilId = invitado.user.id;
  }

  const { data: rolAdmin, error: errorRol } = await admin
    .from("roles")
    .select("id")
    .eq("org_id", orgId)
    .eq("nombre", "Administración")
    .single();
  if (errorRol || !rolAdmin) {
    return { error: "No pudimos encontrar el rol de Administración de la nueva organización." };
  }

  const { error: errorMembresia } = await admin.from("membresias").insert({
    org_id: orgId,
    perfil_id: perfilId,
    rol_id: rolAdmin.id,
    activo: true,
  });
  if (errorMembresia) {
    return { error: "No pudimos crear la membresía del primer admin." };
  }

  revalidatePath("/plataforma");
}
