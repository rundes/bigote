import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { obtenerContextoOrg } from "@/lib/org";
import { hoyEnBuenosAires, listarEdificios } from "@/lib/espacios";
import {
  acumuladoHasta,
  listarMovimientosDelMes,
  mesActualBA,
  resumenDelMes,
} from "@/lib/finanzas";
import { SelectorMes } from "@/componentes/finanzas/SelectorMes";
import { ChipsAmbito } from "@/componentes/finanzas/ChipsAmbito";
import { FilaMovimiento } from "@/componentes/finanzas/FilaMovimiento";
import { SheetMovimiento } from "@/componentes/finanzas/SheetMovimiento";

const pesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export default async function PaginaFinanzas({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ mes?: string; ambito?: string }>;
}) {
  const { orgId } = await params;
  const sp = await searchParams;
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto) redirect("/");
  if (!contexto.permisos.finanzas) redirect(`/o/${orgId}/sin-acceso`);

  const mesActual = mesActualBA();
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? (sp.mes as string) : mesActual;

  const edificios = await listarEdificios(orgId);
  const ambitosValidos = new Set(["todo", "entidad", ...edificios.map((e) => e.id)]);
  const ambito = ambitosValidos.has(sp.ambito ?? "") ? (sp.ambito as string) : "todo";

  const [movimientos, acumulado] = await Promise.all([
    listarMovimientosDelMes(orgId, mes, ambito),
    acumuladoHasta(orgId, mes, ambito),
  ]);
  const resumen = resumenDelMes(movimientos);

  const nombreEdificio = new Map(edificios.map((e) => [e.id, e.nombre]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-tinta">Finanzas</h1>
        <SheetMovimiento
          orgId={orgId}
          hoy={hoyEnBuenosAires()}
          edificios={edificios.map((e) => ({ id: e.id, nombre: e.nombre }))}
        />
      </div>

      <SelectorMes mes={mes} mesActual={mesActual} />

      <ChipsAmbito
        orgId={orgId}
        mes={mes}
        ambito={ambito}
        edificios={edificios.map((e) => ({ id: e.id, nombre: e.nombre }))}
      />

      <div className="flex flex-col gap-1">
        <p
          className={`text-[29px] font-semibold tabular-nums ${
            resumen.balance >= 0 ? "text-ok" : "text-peligro"
          }`}
        >
          {resumen.balance >= 0 ? "+" : "−"}
          {pesos.format(Math.abs(resumen.balance))}
        </p>
        <p className="text-sm tabular-nums text-tinta-suave">
          Ingresos {pesos.format(resumen.ingresos)} · Egresos {pesos.format(resumen.egresos)}
        </p>
        <p className="text-sm tabular-nums text-tinta-suave">
          Acumulado {acumulado < 0 ? "−" : ""}
          {pesos.format(Math.abs(acumulado))}
        </p>
      </div>

      {movimientos.length === 0 ? (
        <p className="text-sm text-tinta-suave">Todavía no hay movimientos este mes.</p>
      ) : (
        <div className="flex flex-col">
          {movimientos.map((m) => (
            <FilaMovimiento
              key={m.id}
              orgId={orgId}
              movimiento={m}
              nombreAmbito={
                ambito === "todo"
                  ? m.edificio_id
                    ? (nombreEdificio.get(m.edificio_id) ?? "")
                    : "Entidad"
                  : null
              }
            />
          ))}
        </div>
      )}

      <div>
        <a
          href={`/o/${orgId}/finanzas/csv?mes=${mes}&ambito=${ambito}`}
          className="inline-flex h-11 items-center gap-2 rounded-lg border border-linea px-3 text-sm font-medium text-tinta transition hover:border-acento hover:text-acento"
        >
          <Download size={20} strokeWidth={1.75} />
          Descargá el CSV del mes
        </a>
      </div>
    </div>
  );
}
