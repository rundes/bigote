import { redirect } from "next/navigation";
import { obtenerContextoOrg } from "@/lib/org";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BotonPush } from "@/componentes/perfil/BotonPush";
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

      <section className="border-t border-linea pt-6">
        <h2 className="text-lg font-semibold text-tinta">Avisos del navegador</h2>
        <p className="mt-1 max-w-[70ch] text-sm text-tinta-suave">
          La preferencia de arriba decide si te mandamos push; esto habilita el canal en
          este dispositivo en particular.
        </p>
        <div className="mt-3">
          <BotonPush vapidPublica={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} />
        </div>
      </section>
    </div>
  );
}
