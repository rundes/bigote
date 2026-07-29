import { redirect } from "next/navigation";
import { obtenerContextoOrg } from "@/lib/org";

export default async function PaginaTareas({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto) redirect("/");
  if (!contexto.permisos.proyectos) redirect(`/o/${orgId}/sin-acceso`);

  return <p className="text-sm text-tinta-suave">Acá vas a ver tus proyectos y tareas.</p>;
}
