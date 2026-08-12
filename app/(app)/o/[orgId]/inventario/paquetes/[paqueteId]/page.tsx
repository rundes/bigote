import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { obtenerContextoOrg } from "@/lib/org";
import { obtenerPaquete, listarArticulos } from "@/lib/inventario";
import { PanelPaquete } from "@/componentes/inventario/PanelPaquete";

export default async function FichaPaquete({
  params,
}: {
  params: Promise<{ orgId: string; paqueteId: string }>;
}) {
  const { orgId, paqueteId } = await params;
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto) redirect("/");

  const datos = await obtenerPaquete(paqueteId);
  if (!datos) notFound();

  const { paquete, destinatario, items } = datos;
  const articulos = contexto.permisos.inventario ? await listarArticulos(orgId) : [];

  return (
    <>
      <Link
        href={`/o/${orgId}/inventario/paquetes`}
        className="text-sm text-tinta-suave underline decoration-linea underline-offset-4 hover:text-acento"
      >
        Paquetes
      </Link>

      <h1 className="mt-3 text-2xl font-bold text-tinta">{destinatario.nombre}</h1>
      <p className="mt-1 font-mono text-sm text-tinta-suave">{paquete.codigo}</p>
      {(destinatario.localidad || destinatario.provincia) && (
        <p className="mt-1 text-sm text-tinta-suave">
          {[destinatario.localidad, destinatario.provincia].filter(Boolean).join(", ")}
        </p>
      )}

      <div className="mt-4">
        <span
          className={`inline-flex h-8 items-center rounded-full px-3 text-sm font-medium ${
            paquete.estado === "despachado" ? "bg-ok/12 text-ok" : "bg-aviso/15 text-aviso"
          }`}
        >
          {paquete.estado === "despachado"
            ? `Despachado el ${new Date(paquete.despachado_at!).toLocaleDateString("es-AR")}`
            : "Abierto"}
        </span>
      </div>

      <PanelPaquete
        orgId={orgId}
        paqueteId={paqueteId}
        estado={paquete.estado}
        puedeEditar={contexto.permisos.inventario}
        items={items}
        articulos={articulos.map((a) => ({
          id: a.id,
          nombre: a.nombre,
          codigo: a.codigo,
          stock: a.stock,
          naturaleza: a.naturaleza,
        }))}
      />
    </>
  );
}
