import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerContextoOrg } from "@/lib/org";
import { listarArticulos, listarPaquetes } from "@/lib/inventario";
import { FORMATOS, renderizarEtiquetas, type FormatoEtiqueta, type DatosEtiqueta } from "@/lib/etiquetas";
import { HojaEtiquetas } from "@/componentes/inventario/HojaEtiquetas";
import { BotonImprimir } from "@/componentes/inventario/BotonImprimir";
import { SelectorEtiquetas } from "@/componentes/inventario/SelectorEtiquetas";

function esFormato(v: string | undefined): v is FormatoEtiqueta {
  return v === "chica" || v === "mediana" || v === "grande" || v === "banderita";
}

export default async function PaginaEtiquetas({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ formato?: string; codigo?: string | string[] }>;
}) {
  const { orgId } = await params;
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto) redirect("/");
  if (!contexto.permisos.inventario) redirect(`/o/${orgId}/sin-acceso`);

  const sp = await searchParams;
  const formato: FormatoEtiqueta = esFormato(sp.formato) ? sp.formato : "mediana";
  const seleccion = sp.codigo
    ? (Array.isArray(sp.codigo) ? sp.codigo : [sp.codigo])
    : [];

  const [articulos, paquetes] = await Promise.all([
    listarArticulos(orgId),
    listarPaquetes(orgId),
  ]);

  const porCodigo = new Map<string, DatosEtiqueta>();
  for (const a of articulos) {
    porCodigo.set(a.codigo, { codigo: a.codigo, nombre: a.nombre });
  }
  for (const p of paquetes) {
    porCodigo.set(p.codigo, {
      codigo: p.codigo,
      nombre: `Paquete ${p.codigo}`,
      destinatario: p.destinatario_nombre,
      cantidad: p.total_items,
    });
  }

  const elegidas = seleccion
    .map((c) => porCodigo.get(c))
    .filter((d): d is DatosEtiqueta => d != null);

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const etiquetas = elegidas.length ? await renderizarEtiquetas(elegidas, base) : [];

  return (
    <>
      <div className="no-imprimir">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-tinta">Etiquetas</h1>
            <p className="mt-1 text-sm text-tinta-suave">
              Elegí qué imprimir y en qué tamaño. Sale en hoja A4 con guías de corte.
            </p>
          </div>
          <Link
            href={`/o/${orgId}/inventario`}
            className="text-sm text-tinta-suave underline decoration-linea underline-offset-4 hover:text-acento"
          >
            Volver
          </Link>
        </div>

        {!base && (
          <p className="mt-4 rounded-lg border border-linea bg-superficie p-3 text-sm text-aviso">
            Falta configurar <code className="font-mono">NEXT_PUBLIC_SITE_URL</code>. Sin eso los
            QR apuntan a una ruta relativa y no se pueden escanear desde el teléfono.
          </p>
        )}

        <SelectorEtiquetas
          orgId={orgId}
          formatoActual={formato}
          seleccionActual={seleccion}
          articulos={articulos.map((a) => ({
            codigo: a.codigo,
            nombre: a.nombre,
            detalle: a.ubicacion_nombre ?? "sin ubicación",
          }))}
          paquetes={paquetes.map((p) => ({
            codigo: p.codigo,
            nombre: `Paquete → ${p.destinatario_nombre}`,
            detalle: `${p.total_items} ${p.total_items === 1 ? "unidad" : "unidades"}`,
          }))}
        />

        {etiquetas.length > 0 && (
          <div className="mt-8 flex items-center justify-between gap-3 border-t border-linea pt-6">
            <p className="text-sm text-tinta-suave">
              {etiquetas.length} {etiquetas.length === 1 ? "etiqueta" : "etiquetas"} ·{" "}
              {Math.ceil(etiquetas.length / FORMATOS[formato].porHoja)}{" "}
              {Math.ceil(etiquetas.length / FORMATOS[formato].porHoja) === 1 ? "hoja" : "hojas"}
            </p>
            <BotonImprimir />
          </div>
        )}
      </div>

      {etiquetas.length > 0 && (
        <div className="mt-6">
          <HojaEtiquetas etiquetas={etiquetas} formato={formato} />
        </div>
      )}
    </>
  );
}
