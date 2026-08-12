import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerContextoOrg } from "@/lib/org";
import { listarPaquetes, listarDestinatarios } from "@/lib/inventario";
import { SheetNuevoPaquete } from "@/componentes/inventario/SheetNuevoPaquete";

export default async function PaginaPaquetes({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto) redirect("/");
  if (!contexto.permisos.inventario) redirect(`/o/${orgId}/sin-acceso`);

  const [paquetes, destinatarios] = await Promise.all([
    listarPaquetes(orgId),
    listarDestinatarios(orgId),
  ]);

  return (
    <>
      <Link
        href={`/o/${orgId}/inventario`}
        className="text-sm text-tinta-suave underline decoration-linea underline-offset-4 hover:text-acento"
      >
        Inventario
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-tinta">Paquetes</h1>
          <p className="mt-1 text-sm text-tinta-suave">
            Armá un paquete, cargale lo que va adentro y despachalo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/o/${orgId}/inventario/destinatarios`}
            className="flex h-10 items-center rounded-lg border border-linea px-3 text-sm text-tinta transition hover:bg-linea/40"
          >
            Destinatarios
          </Link>
          <SheetNuevoPaquete orgId={orgId} destinatarios={destinatarios} />
        </div>
      </div>

      {destinatarios.length === 0 && (
        <p className="mt-6 rounded-lg border border-linea bg-superficie p-4 text-sm text-tinta-suave">
          Primero cargá un destinatario: un paquete siempre va dirigido a alguien.
        </p>
      )}

      {paquetes.length === 0 ? (
        <p className="mt-6 text-sm text-tinta-suave">Todavía no armaste ninguno.</p>
      ) : (
        <div className="mt-6 divide-y divide-linea border-y border-linea">
          {paquetes.map((p) => (
            <Link
              key={p.id}
              href={`/o/${orgId}/inventario/paquetes/${p.id}`}
              className="flex min-h-11 items-center gap-3 py-3 transition hover:bg-linea/20"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-tinta">
                  {p.destinatario_nombre}
                </span>
                <span className="block font-mono text-xs text-tinta-suave">
                  {p.codigo} · {p.total_items} {p.total_items === 1 ? "unidad" : "unidades"}
                </span>
              </span>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                  p.estado === "despachado" ? "bg-ok/12 text-ok" : "bg-aviso/15 text-aviso"
                }`}
              >
                {p.estado === "despachado" ? "Despachado" : "Abierto"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
