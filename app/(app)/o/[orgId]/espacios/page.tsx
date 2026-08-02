import Link from "next/link";
import { redirect } from "next/navigation";
import { Settings2 } from "lucide-react";
import { obtenerContextoOrg } from "@/lib/org";
import {
  hoyEnBuenosAires,
  listarEdificios,
  listarClientes,
  misReservas,
  obtenerEdificio,
  reservasDelDia,
} from "@/lib/espacios";
import { SelectorDia } from "@/componentes/espacios/SelectorDia";
import { GrillaDia } from "@/componentes/espacios/GrillaDia";
import { TusReservas } from "@/componentes/espacios/TusReservas";

export default async function PaginaEspacios({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ edificio?: string; fecha?: string }>;
}) {
  const { orgId } = await params;
  const sp = await searchParams;
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto) redirect("/");

  const edificios = await listarEdificios(orgId);
  const hoy = hoyEnBuenosAires();
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(sp.fecha ?? "") ? (sp.fecha as string) : hoy;

  if (edificios.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold text-tinta">Espacios</h1>
        <p className="text-sm text-tinta-suave">
          Todavía no hay espacios.{" "}
          {contexto.permisos.espacios
            ? "Creá el primero desde la administración."
            : "Pedile a quien administra que cargue uno."}
        </p>
      </div>
    );
  }

  const edificioId =
    sp.edificio && edificios.some((e) => e.id === sp.edificio) ? sp.edificio : edificios[0].id;

  const [detalle, reservas, propias] = await Promise.all([
    obtenerEdificio(edificioId),
    reservasDelDia(edificioId, fecha),
    misReservas(contexto.perfilId),
  ]);
  if (!detalle) redirect(`/o/${orgId}/espacios`);

  const clientes = await listarClientes(detalle.edificio.org_propietaria_id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-tinta">Espacios</h1>
        {contexto.permisos.espacios && (
          <Link
            href={`/o/${orgId}/espacios/${edificioId}`}
            className="flex h-11 items-center gap-2 rounded-lg border border-linea px-3 text-sm font-medium text-tinta transition hover:border-acento hover:text-acento"
          >
            <Settings2 size={20} strokeWidth={1.75} />
            Administrá el espacio
          </Link>
        )}
      </div>

      {edificios.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {edificios.map((e) => (
            <Link
              key={e.id}
              href={`/o/${orgId}/espacios?edificio=${e.id}&fecha=${fecha}`}
              aria-current={e.id === edificioId ? "true" : undefined}
              className={`flex h-8 items-center rounded-full px-3 text-sm transition ${
                e.id === edificioId
                  ? "bg-acento/10 font-medium text-acento"
                  : "border border-linea text-tinta-suave hover:text-tinta"
              }`}
            >
              {e.nombre}
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-tinta">{detalle.edificio.nombre}</h2>
        {detalle.edificio.direccion && (
          <p className="text-sm text-tinta-suave">{detalle.edificio.direccion}</p>
        )}
      </div>

      <SelectorDia fecha={fecha} hoy={hoy} />

      <GrillaDia
        orgId={orgId}
        orgPropietariaId={detalle.edificio.org_propietaria_id}
        salas={detalle.salas}
        reservas={reservas}
        planes={detalle.planes}
        clientes={clientes}
        fecha={fecha}
        hoy={hoy}
        perfilId={contexto.perfilId}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-tinta">Tus reservas</h2>
        <TusReservas orgId={orgId} reservas={propias} />
      </section>
    </div>
  );
}
