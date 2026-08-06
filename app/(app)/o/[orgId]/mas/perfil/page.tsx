import { redirect } from "next/navigation";
import { obtenerContextoOrg } from "@/lib/org";
import { crearClienteServidor } from "@/lib/supabase/server";
import { FormPerfil } from "./FormPerfil";

export default async function PaginaPerfil({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto) redirect("/");

  const supabase = await crearClienteServidor();
  const [{ data: perfil }, { data: prefs }] = await Promise.all([
    supabase.from("perfiles").select("nombre, email, telefono").eq("id", contexto.perfilId).single(),
    supabase
      .from("preferencias_notificaciones")
      .select("wa, email, push")
      .eq("usuario_id", contexto.perfilId)
      .maybeSingle(),
  ]);
  if (!perfil) redirect("/");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-tinta">Perfil y avisos</h1>
      <FormPerfil
        orgId={orgId}
        perfil={perfil}
        preferencias={prefs ?? { wa: true, email: true, push: true }}
      />
    </div>
  );
}
