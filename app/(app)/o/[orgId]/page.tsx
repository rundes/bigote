import { redirect } from "next/navigation";
import { obtenerContextoOrg } from "@/lib/org";
import { crearClienteServidor } from "@/lib/supabase/server";

export default async function PaginaHoy({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto) redirect("/");

  const supabase = await crearClienteServidor();
  const { data: perfil } = await supabase
    .from("perfiles")
    .select("nombre")
    .eq("id", contexto.perfilId)
    .maybeSingle();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-tinta">Hola, {perfil?.nombre || ""}</h1>
      <p className="text-sm text-tinta-suave">
        Acá van a aparecer tus tareas y reservas del día.
      </p>
    </div>
  );
}
