import { crearClienteServidor } from "@/lib/supabase/server";
import type {
  Articulo, ArticuloConStock, Categoria, Destinatario, ItemDePaquete,
  Movimiento, Paquete, PaqueteConDestinatario, Ubicacion,
} from "@/lib/inventario-tipos";

// Los tipos y helpers puros viven aparte para que los componentes cliente
// puedan importarlos sin arrastrar `next/headers` al bundle del navegador.
export * from "@/lib/inventario-tipos";

export type FiltrosInventario = {
  categoria?: Categoria | "todas";
  ubicacion?: string | "todas";
  busqueda?: string;
  incluirInactivos?: boolean;
};

export async function listarArticulos(
  orgId: string,
  filtros: FiltrosInventario = {}
): Promise<ArticuloConStock[]> {
  const supabase = await crearClienteServidor();

  let consulta = supabase
    .from("inventario_articulos")
    .select("id, codigo, nombre, descripcion, categoria, naturaleza, ubicacion_id, activo")
    .eq("org_id", orgId)
    .order("nombre");

  if (!filtros.incluirInactivos) consulta = consulta.eq("activo", true);
  if (filtros.categoria && filtros.categoria !== "todas") {
    consulta = consulta.eq("categoria", filtros.categoria);
  }
  if (filtros.ubicacion && filtros.ubicacion !== "todas") {
    consulta = consulta.eq("ubicacion_id", filtros.ubicacion);
  }
  if (filtros.busqueda?.trim()) {
    const q = filtros.busqueda.trim();
    consulta = consulta.or(`nombre.ilike.%${q}%,codigo.ilike.%${q}%`);
  }

  const { data: articulos } = await consulta.returns<Articulo[]>();
  if (!articulos?.length) return [];

  // El stock sale de la vista (suma del libro de movimientos), y las ubicaciones
  // en un solo viaje: son pocas filas y evita un join por artículo.
  const [{ data: stocks }, { data: ubicaciones }] = await Promise.all([
    supabase
      .from("inventario_stock")
      .select("articulo_id, stock")
      .in("articulo_id", articulos.map((a) => a.id))
      .returns<{ articulo_id: string; stock: number }[]>(),
    supabase
      .from("inventario_ubicaciones")
      .select("id, nombre")
      .eq("org_id", orgId)
      .returns<{ id: string; nombre: string }[]>(),
  ]);

  const porArticulo = new Map((stocks ?? []).map((s) => [s.articulo_id, s.stock]));
  const nombreUbicacion = new Map((ubicaciones ?? []).map((u) => [u.id, u.nombre]));

  return articulos.map((a) => ({
    ...a,
    stock: porArticulo.get(a.id) ?? 0,
    ubicacion_nombre: a.ubicacion_id ? nombreUbicacion.get(a.ubicacion_id) ?? null : null,
  }));
}

export async function obtenerArticulo(
  id: string
): Promise<{ articulo: ArticuloConStock; movimientos: Movimiento[] } | null> {
  const supabase = await crearClienteServidor();

  const { data: articulo } = await supabase
    .from("inventario_articulos")
    .select("id, org_id, codigo, nombre, descripcion, categoria, naturaleza, ubicacion_id, activo")
    .eq("id", id)
    .maybeSingle<Articulo & { org_id: string }>();
  if (!articulo) return null;

  const [{ data: movimientos }, { data: stock }, { data: ubicacion }] = await Promise.all([
    supabase
      .from("inventario_movimientos")
      .select("id, tipo, cantidad, nota, devolucion_esperada, created_at, perfil_id, destinatario_id")
      .eq("articulo_id", id)
      .order("created_at", { ascending: false })
      .returns<Movimiento[]>(),
    supabase
      .from("inventario_stock")
      .select("stock")
      .eq("articulo_id", id)
      .maybeSingle<{ stock: number }>(),
    articulo.ubicacion_id
      ? supabase
          .from("inventario_ubicaciones")
          .select("nombre")
          .eq("id", articulo.ubicacion_id)
          .maybeSingle<{ nombre: string }>()
      : Promise.resolve({ data: null }),
  ]);

  return {
    articulo: {
      ...articulo,
      stock: stock?.stock ?? 0,
      ubicacion_nombre: ubicacion?.nombre ?? null,
    },
    movimientos: movimientos ?? [],
  };
}

/**
 * Resuelve un código de etiqueta. Un código de otra organización se comporta
 * igual que uno inexistente: RLS no lo devuelve, y distinguir "no existe" de
 * "no es tuyo" filtraría información entre organizaciones.
 */
export async function resolverCodigo(
  codigo: string
): Promise<{ tipo: "articulo" | "paquete"; orgId: string; id: string } | null> {
  const supabase = await crearClienteServidor();
  const limpio = codigo.trim().toUpperCase();

  const { data: articulo } = await supabase
    .from("inventario_articulos")
    .select("id, org_id")
    .eq("codigo", limpio)
    .maybeSingle<{ id: string; org_id: string }>();
  if (articulo) return { tipo: "articulo", orgId: articulo.org_id, id: articulo.id };

  const { data: paquete } = await supabase
    .from("inventario_paquetes")
    .select("id, org_id")
    .eq("codigo", limpio)
    .maybeSingle<{ id: string; org_id: string }>();
  if (paquete) return { tipo: "paquete", orgId: paquete.org_id, id: paquete.id };

  return null;
}

export async function listarUbicaciones(orgId: string): Promise<Ubicacion[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("inventario_ubicaciones")
    .select("id, nombre, edificio_id, activa")
    .eq("org_id", orgId)
    .order("nombre")
    .returns<Ubicacion[]>();
  return data ?? [];
}

export async function listarDestinatarios(orgId: string): Promise<Destinatario[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("inventario_destinatarios")
    .select("id, nombre, localidad, provincia, contacto_nombre, email, direccion")
    .eq("org_id", orgId)
    .order("nombre")
    .returns<Destinatario[]>();
  return data ?? [];
}

export async function listarPaquetes(orgId: string): Promise<PaqueteConDestinatario[]> {
  const supabase = await crearClienteServidor();

  const { data: paquetes } = await supabase
    .from("inventario_paquetes")
    .select("id, codigo, estado, nota, despachado_at, destinatario_id")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .returns<Paquete[]>();
  if (!paquetes?.length) return [];

  const [{ data: destinatarios }, { data: items }] = await Promise.all([
    supabase
      .from("inventario_destinatarios")
      .select("id, nombre")
      .eq("org_id", orgId)
      .returns<{ id: string; nombre: string }[]>(),
    supabase
      .from("inventario_paquete_items")
      .select("paquete_id, cantidad")
      .in("paquete_id", paquetes.map((p) => p.id))
      .returns<{ paquete_id: string; cantidad: number }[]>(),
  ]);

  const nombre = new Map((destinatarios ?? []).map((d) => [d.id, d.nombre]));
  const totales = new Map<string, number>();
  for (const it of items ?? []) {
    totales.set(it.paquete_id, (totales.get(it.paquete_id) ?? 0) + it.cantidad);
  }

  return paquetes.map((p) => ({
    ...p,
    destinatario_nombre: nombre.get(p.destinatario_id) ?? "—",
    total_items: totales.get(p.id) ?? 0,
  }));
}

export async function obtenerPaquete(id: string): Promise<
  | { paquete: PaqueteConDestinatario; destinatario: Destinatario; items: ItemDePaquete[] }
  | null
> {
  const supabase = await crearClienteServidor();

  const { data: paquete } = await supabase
    .from("inventario_paquetes")
    .select("id, codigo, estado, nota, despachado_at, destinatario_id")
    .eq("id", id)
    .maybeSingle<Paquete>();
  if (!paquete) return null;

  const { data: destinatario } = await supabase
    .from("inventario_destinatarios")
    .select("id, nombre, localidad, provincia, contacto_nombre, email, direccion")
    .eq("id", paquete.destinatario_id)
    .maybeSingle<Destinatario>();
  if (!destinatario) return null;

  const { data: filas } = await supabase
    .from("inventario_paquete_items")
    .select("articulo_id, cantidad, inventario_articulos(nombre, codigo)")
    .eq("paquete_id", id)
    .returns<
      {
        articulo_id: string;
        cantidad: number;
        inventario_articulos: { nombre: string; codigo: string } | { nombre: string; codigo: string }[] | null;
      }[]
    >();

  // supabase-js tipa las relaciones belongs-to como objeto, pero a veces llegan
  // envueltas en un array de un elemento; misma ayuda que en lib/org.ts.
  const items: ItemDePaquete[] = (filas ?? []).map((f) => {
    const rel = Array.isArray(f.inventario_articulos)
      ? f.inventario_articulos[0]
      : f.inventario_articulos;
    return {
      articulo_id: f.articulo_id,
      cantidad: f.cantidad,
      nombre: rel?.nombre ?? "",
      codigo: rel?.codigo ?? "",
    };
  });

  return {
    paquete: {
      ...paquete,
      destinatario_nombre: destinatario.nombre,
      total_items: items.reduce((a, i) => a + i.cantidad, 0),
    },
    destinatario,
    items,
  };
}
