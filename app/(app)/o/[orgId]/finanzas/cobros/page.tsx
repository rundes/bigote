import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerContextoOrg } from "@/lib/org";
import { obtenerCobrosConfig, listarEsperandoPago } from "@/lib/cobros";
import { FormCobros } from "@/componentes/finanzas/FormCobros";
import { ListaEsperandoPago } from "@/componentes/finanzas/ListaEsperandoPago";

export default async function PaginaCobros({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto) redirect("/");
  if (!contexto.permisos.finanzas) redirect(`/o/${orgId}/sin-acceso`);

  const [config, esperando] = await Promise.all([
    obtenerCobrosConfig(orgId),
    listarEsperandoPago(orgId),
  ]);

  return (
    <>
      <Link
        href={`/o/${orgId}/finanzas`}
        className="text-sm text-tinta-suave underline decoration-linea underline-offset-4 hover:text-acento"
      >
        Finanzas
      </Link>

      <h1 className="mt-3 text-2xl font-bold text-tinta">Cobros</h1>
      <p className="mt-1 max-w-[70ch] text-sm text-tinta-suave">
        Datos de la cuenta que se le mandan a quien reserva, y las reservas que están
        esperando que entre la transferencia.
      </p>

      <h2 className="mt-8 text-sm text-tinta-suave">
        Esperando pago {esperando.length > 0 && `(${esperando.length})`}
      </h2>
      <ListaEsperandoPago orgId={orgId} reservas={esperando} />

      <h2 className="mt-10 text-sm text-tinta-suave">Datos de la cuenta</h2>
      <FormCobros orgId={orgId} config={config} />
    </>
  );
}
