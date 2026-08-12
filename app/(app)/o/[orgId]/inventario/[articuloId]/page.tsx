import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { obtenerContextoOrg } from "@/lib/org";
import { listarMiembros } from "@/lib/equipo";
import { obtenerArticulo, estadoDeActivo, ETIQUETAS_CATEGORIA } from "@/lib/inventario";
import { AccionesArticulo } from "@/componentes/inventario/AccionesArticulo";

const ETIQUETAS_MOVIMIENTO: Record<string, string> = {
  alta: "Alta",
  prestamo: "Préstamo",
  devolucion: "Devolución",
  despacho: "Despacho",
  ajuste: "Ajuste",
  baja: "Baja",
};

export default async function FichaArticulo({
  params,
}: {
  params: Promise<{ orgId: string; articuloId: string }>;
}) {
  const { orgId, articuloId } = await params;
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto) redirect("/");

  const datos = await obtenerArticulo(articuloId);
  if (!datos) notFound();

  const { articulo, movimientos } = datos;
  const estado = articulo.naturaleza === "activo" ? estadoDeActivo(movimientos) : null;
  const miembros = contexto.permisos.inventario ? await listarMiembros(orgId) : [];

  return (
    <>
      <Link
        href={`/o/${orgId}/inventario`}
        className="text-sm text-tinta-suave underline decoration-linea underline-offset-4 hover:text-acento"
      >
        Inventario
      </Link>

      <h1 className="mt-3 text-2xl font-bold text-tinta">{articulo.nombre}</h1>
      <p className="mt-1 font-mono text-sm text-tinta-suave">
        {articulo.codigo} · {ETIQUETAS_CATEGORIA[articulo.categoria]}
        {articulo.ubicacion_nombre ? ` · ${articulo.ubicacion_nombre}` : ""}
      </p>

      {articulo.descripcion && (
        <p className="mt-3 max-w-[70ch] text-sm text-tinta">{articulo.descripcion}</p>
      )}

      <div className="mt-6 flex items-baseline gap-3">
        {articulo.naturaleza === "activo" ? (
          <span
            className={`flex h-8 items-center rounded-full px-3 text-sm font-medium ${
              estado === "disponible"
                ? "bg-ok/12 text-ok"
                : estado === "prestado"
                  ? "bg-aviso/15 text-aviso"
                  : "bg-linea/60 text-tinta-suave"
            }`}
          >
            {estado === "disponible" ? "Disponible" : estado === "prestado" ? "Prestado" : "Salido"}
          </span>
        ) : (
          <>
            <span className="text-[29px] font-semibold tabular-nums text-tinta">
              {articulo.stock}
            </span>
            <span className="text-sm text-tinta-suave">en stock</span>
          </>
        )}
      </div>

      {contexto.permisos.inventario && (
        <AccionesArticulo
          orgId={orgId}
          articuloId={articuloId}
          naturaleza={articulo.naturaleza}
          estado={estado}
          miembros={miembros.filter((m) => m.activo).map((m) => ({ id: m.perfil_id, nombre: m.nombre || m.email }))}
        />
      )}

      <h2 className="mt-10 text-sm text-tinta-suave">Historial</h2>
      {movimientos.length === 0 ? (
        <p className="mt-2 text-sm text-tinta-suave">Sin movimientos todavía.</p>
      ) : (
        <div className="mt-2 divide-y divide-linea border-y border-linea">
          {movimientos.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 py-3">
              <span className="min-w-0">
                <span className="block text-sm text-tinta">
                  {ETIQUETAS_MOVIMIENTO[m.tipo] ?? m.tipo}
                </span>
                <span className="block text-xs text-tinta-suave">
                  {new Date(m.created_at).toLocaleDateString("es-AR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                  {m.nota ? ` · ${m.nota}` : ""}
                </span>
              </span>
              <span
                className={`shrink-0 text-sm font-medium tabular-nums ${
                  m.cantidad > 0 ? "text-ok" : "text-peligro"
                }`}
              >
                {m.cantidad > 0 ? "+" : ""}
                {m.cantidad}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
