import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { obtenerContextoOrg, listarMisOrgs } from "@/lib/org";
import { obtenerEdificio } from "@/lib/espacios";
import { SheetEdificio } from "@/componentes/espacios/SheetEdificio";
import { SheetSala } from "@/componentes/espacios/SheetSala";
import { SheetPlan } from "@/componentes/espacios/SheetPlan";
import { GaleriaMedia } from "@/componentes/espacios/GaleriaMedia";
import { SubirMedia } from "@/componentes/espacios/SubirMedia";

const pesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export default async function PaginaEdificio({
  params,
}: {
  params: Promise<{ orgId: string; edificioId: string }>;
}) {
  const { orgId, edificioId } = await params;
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto) redirect("/");

  const detalle = await obtenerEdificio(edificioId);
  if (!detalle) notFound();

  const { edificio, salas, mediaEdificio, planes, propietaria, gestora } = detalle;
  const administra = contexto.permisos.espacios;
  const orgs = administra ? await listarMisOrgs() : [];

  const destinoLegible =
    edificio.destino_ingresos === "propietaria"
      ? `Ingresos: todo para ${propietaria}`
      : edificio.destino_ingresos === "gestora"
        ? `Ingresos: todo para ${gestora ?? "la gestora"}`
        : `Ingresos: ${edificio.porcentaje_propietaria}% para ${propietaria}, ${100 - (edificio.porcentaje_propietaria ?? 0)}% para ${gestora ?? "la gestora"}`;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Link
          href={`/o/${orgId}/espacios?edificio=${edificio.id}`}
          className="flex items-center gap-1.5 text-sm text-tinta-suave transition hover:text-tinta"
        >
          <ArrowLeft size={16} strokeWidth={1.75} />
          Volvé a la disponibilidad
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-2xl font-semibold text-tinta">{edificio.nombre}</h1>
            {edificio.direccion && <p className="text-sm text-tinta-suave">{edificio.direccion}</p>}
          </div>
          {administra && (
            <SheetEdificio
              orgId={orgId}
              edificio={edificio}
              propietariaNombre={propietaria}
              orgs={orgs}
            />
          )}
        </div>

        {edificio.descripcion && (
          <p className="max-w-[70ch] text-[15px] text-tinta">{edificio.descripcion}</p>
        )}

        <p className="text-sm text-tinta-suave">
          {gestora ? `Co-gestionado por ${gestora} (propietaria: ${propietaria}) · ` : ""}
          {destinoLegible}
        </p>

        <GaleriaMedia
          orgId={orgId}
          edificioId={edificio.id}
          media={mediaEdificio}
          puedeBorrar={administra}
        />
        {administra && <SubirMedia orgId={orgId} edificioId={edificio.id} salaId={null} />}
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-tinta">Salas</h2>
          {administra && <SheetSala orgId={orgId} edificioId={edificio.id} sala={null} />}
        </div>

        {salas.length === 0 ? (
          <p className="text-sm text-tinta-suave">
            Todavía no hay salas. {administra ? "Agregá la primera." : ""}
          </p>
        ) : (
          <div className="flex flex-col">
            {salas.map((sala) => (
              <div
                key={sala.id}
                className={`flex flex-col gap-2 border-b border-linea py-4 last:border-b-0 ${
                  sala.activa ? "" : "opacity-45"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-tinta">
                      {sala.nombre}
                      <span className="ml-2 text-xs font-normal text-tinta-suave">
                        {sala.tipo === "privada" ? "Privada" : "Pública"}
                        {!sala.activa && " · No se puede reservar"}
                      </span>
                    </p>
                    {sala.descripcion && (
                      <p className="text-sm text-tinta-suave">{sala.descripcion}</p>
                    )}
                  </div>
                  {administra && <SheetSala orgId={orgId} edificioId={edificio.id} sala={sala} />}
                </div>
                <GaleriaMedia
                  orgId={orgId}
                  edificioId={edificio.id}
                  media={sala.media}
                  puedeBorrar={administra}
                />
                {administra && (
                  <div>
                    <SubirMedia orgId={orgId} edificioId={edificio.id} salaId={sala.id} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-tinta">Planes de {propietaria}</h2>
          {administra && contexto.org.id === edificio.org_propietaria_id && (
            <SheetPlan orgId={orgId} edificioId={edificio.id} plan={null} />
          )}
        </div>

        {planes.length === 0 ? (
          <p className="text-sm text-tinta-suave">Todavía no hay planes.</p>
        ) : (
          <div className="flex flex-col">
            {planes.map((plan) => (
              <div
                key={plan.id}
                className="flex min-h-14 items-center justify-between gap-3 border-b border-linea py-2 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-tinta">{plan.nombre}</p>
                  {plan.solo_salas_publicas && (
                    <p className="text-xs text-tinta-suave">Solo salas públicas</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-sm tabular-nums text-tinta-suave">
                    {plan.gratuito ? "Gratis" : `${pesos.format(plan.precio_hora)}/h`}
                  </span>
                  {administra && contexto.org.id === edificio.org_propietaria_id && (
                    <SheetPlan orgId={orgId} edificioId={edificio.id} plan={plan} />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
