import { redirect } from "next/navigation";
import { obtenerContextoOrg } from "@/lib/org";

export default async function PaginaFinanzas({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto) redirect("/");
  if (!contexto.permisos.finanzas) redirect(`/o/${orgId}/sin-acceso`);

  return <p className="text-sm text-tinta-suave">Acá vas a ver el balance y los movimientos.</p>;
}
