import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerContextoOrg } from "@/lib/org";
import {
  listarArticulos,
  listarUbicaciones,
  ETIQUETAS_CATEGORIA,
  type Categoria,
} from "@/lib/inventario";
import { SheetNuevoArticulo } from "@/componentes/inventario/SheetNuevoArticulo";

const CATEGORIAS = Object.keys(ETIQUETAS_CATEGORIA) as Categoria[];

export default async function PaginaInventario({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ categoria?: string; ubicacion?: string; q?: string }>;
}) {
  const { orgId } = await params;
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto) redirect("/");
  if (!contexto.permisos.inventario) redirect(`/o/${orgId}/sin-acceso`);

  const sp = await searchParams;
  const categoria = (CATEGORIAS as string[]).includes(sp.categoria ?? "")
    ? (sp.categoria as Categoria)
    : "todas";

  const [articulos, ubicaciones] = await Promise.all([
    listarArticulos(orgId, {
      categoria,
      ubicacion: sp.ubicacion || "todas",
      busqueda: sp.q,
    }),
    listarUbicaciones(orgId),
  ]);

  function href(cambios: Record<string, string | undefined>) {
    const qs = new URLSearchParams();
    const base = { categoria: sp.categoria, ubicacion: sp.ubicacion, q: sp.q, ...cambios };
    for (const [k, v] of Object.entries(base)) if (v) qs.set(k, v);
    const s = qs.toString();
    return `/o/${orgId}/inventario${s ? `?${s}` : ""}`;
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-tinta">Inventario</h1>
          <p className="mt-1 text-sm text-tinta-suave">
            {articulos.length} {articulos.length === 1 ? "artículo" : "artículos"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/o/${orgId}/inventario/paquetes`}
            className="flex h-10 items-center rounded-lg border border-linea px-3 text-sm text-tinta transition hover:bg-linea/40"
          >
            Paquetes
          </Link>
          <Link
            href={`/o/${orgId}/inventario/etiquetas`}
            className="flex h-10 items-center rounded-lg border border-linea px-3 text-sm text-tinta transition hover:bg-linea/40"
          >
            Etiquetas
          </Link>
          <SheetNuevoArticulo orgId={orgId} ubicaciones={ubicaciones} />
        </div>
      </div>

      <form method="GET" className="mt-6">
        <label htmlFor="q" className="sr-only">
          Buscar por nombre o código
        </label>
        <input
          id="q"
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Buscar por nombre o código"
          className="h-11 w-full rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta placeholder:text-tinta-suave focus:border-acento focus:outline-none"
        />
        {sp.categoria && <input type="hidden" name="categoria" value={sp.categoria} />}
        {sp.ubicacion && <input type="hidden" name="ubicacion" value={sp.ubicacion} />}
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={href({ categoria: undefined })}
          className={`flex h-8 items-center rounded-full px-3 text-sm ${
            categoria === "todas"
              ? "bg-acento/12 font-medium text-acento"
              : "border border-linea text-tinta-suave"
          }`}
        >
          Todo
        </Link>
        {CATEGORIAS.map((c) => (
          <Link
            key={c}
            href={href({ categoria: categoria === c ? undefined : c })}
            className={`flex h-8 items-center rounded-full px-3 text-sm ${
              categoria === c
                ? "bg-acento/12 font-medium text-acento"
                : "border border-linea text-tinta-suave"
            }`}
          >
            {ETIQUETAS_CATEGORIA[c]}
          </Link>
        ))}
      </div>

      {ubicaciones.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {ubicaciones.map((u) => (
            <Link
              key={u.id}
              href={href({ ubicacion: sp.ubicacion === u.id ? undefined : u.id })}
              className={`flex h-8 items-center rounded-full px-3 text-sm ${
                sp.ubicacion === u.id
                  ? "bg-acento/12 font-medium text-acento"
                  : "border border-linea text-tinta-suave"
              }`}
            >
              {u.nombre}
            </Link>
          ))}
        </div>
      )}

      {articulos.length === 0 ? (
        <div className="mt-10 rounded-xl border border-linea bg-superficie p-6 text-center">
          <p className="text-sm font-medium text-tinta">Todavía no hay nada cargado</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-tinta-suave">
            Cargá un libro, un equipo o un mueble. Después vas a poder imprimirle una
            etiqueta con QR y pegársela.
          </p>
        </div>
      ) : (
        <div className="mt-6 divide-y divide-linea border-y border-linea">
          {articulos.map((a) => (
            <Link
              key={a.id}
              href={`/o/${orgId}/inventario/${a.id}`}
              className="flex min-h-11 items-center gap-3 py-3 transition hover:bg-linea/20"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-tinta">{a.nombre}</span>
                <span className="block truncate font-mono text-xs text-tinta-suave">
                  {a.codigo} · {ETIQUETAS_CATEGORIA[a.categoria]}
                  {a.ubicacion_nombre ? ` · ${a.ubicacion_nombre}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-medium tabular-nums text-tinta">
                  {a.stock}
                </span>
                <span className="block text-xs text-tinta-suave">
                  {a.naturaleza === "activo" ? "activo" : "en stock"}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
