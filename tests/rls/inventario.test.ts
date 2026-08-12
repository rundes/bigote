import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clienteAdmin, clienteComo } from "./helpers";

// Inventario (migración 0012). Todo cuelga de artículos efímeros propios de
// este archivo para no pisar datos del seed ni de los otros tests. La limpieza
// va movimientos -> items de paquete -> paquetes -> artículos -> destinatario
// -> ubicación, en ese orden por las FKs.

const MARCA = "[test-inv]";

async function limpiar(admin: SupabaseClient, orgId: string) {
  const { data: articulos } = await admin
    .from("inventario_articulos")
    .select("id")
    .eq("org_id", orgId)
    .like("nombre", `%${MARCA}`);
  const ids = (articulos ?? []).map((a) => a.id);

  const { data: paquetes } = await admin
    .from("inventario_paquetes")
    .select("id")
    .eq("org_id", orgId);
  const idsPaq = (paquetes ?? []).map((p) => p.id);

  if (ids.length) {
    await admin.from("inventario_movimientos").delete().in("articulo_id", ids);
    await admin.from("inventario_paquete_items").delete().in("articulo_id", ids);
  }
  if (idsPaq.length) {
    await admin.from("inventario_paquete_items").delete().in("paquete_id", idsPaq);
    await admin.from("inventario_paquetes").delete().in("id", idsPaq);
  }
  if (ids.length) await admin.from("inventario_articulos").delete().in("id", ids);

  await admin
    .from("inventario_destinatarios")
    .delete()
    .eq("org_id", orgId)
    .like("nombre", `%${MARCA}`);
  await admin
    .from("inventario_ubicaciones")
    .delete()
    .eq("org_id", orgId)
    .like("nombre", `%${MARCA}`);
}

describe("inventario: stock derivado, reglas de despacho y RLS", () => {
  const admin = clienteAdmin();
  let adminUser: SupabaseClient;
  let gestora: SupabaseClient;
  let orgId: string;
  let destinatarioId: string;

  beforeAll(async () => {
    const { data: delta } = await admin
      .from("organizaciones")
      .select("id")
      .eq("nombre", "Fundación Delta")
      .single();
    if (!delta) throw new Error("Falta Fundación Delta del seed");
    orgId = delta.id;

    await limpiar(admin, orgId);

    adminUser = await clienteComo("admin@demo.test");
    gestora = await clienteComo("gestora@demo.test");

    const { data: dest, error } = await admin
      .from("inventario_destinatarios")
      .insert({ org_id: orgId, nombre: `Grupo La Rioja ${MARCA}`, provincia: "La Rioja" })
      .select("id")
      .single();
    if (error || !dest) throw new Error(`destinatario: ${error?.message}`);
    destinatarioId = dest.id;
  });

  afterAll(async () => {
    await limpiar(admin, orgId);
  });

  it("el stock sale del libro de movimientos: alta, préstamo y devolución", async () => {
    const { data: id, error } = await adminUser.rpc("inv_crear_articulo", {
      org: orgId,
      nombre: `Memoria y lucha ${MARCA}`,
      descripcion: "",
      categoria: "libro",
      naturaleza: "existencia",
      ubicacion: null,
      cantidad_inicial: 200,
    });
    expect(error).toBeNull();

    const stock = async () => {
      const { data } = await admin
        .from("inventario_stock")
        .select("stock")
        .eq("articulo_id", id)
        .maybeSingle();
      return data?.stock ?? 0;
    };

    expect(await stock()).toBe(200);

    const { data: perfil } = await adminUser.auth.getUser();
    await adminUser.rpc("inv_prestar", {
      articulo: id,
      a_perfil: perfil.user!.id,
      devolucion: null,
      nota: "",
    });
    expect(await stock()).toBe(199);

    await adminUser.rpc("inv_devolver", { articulo: id, nota: "" });
    expect(await stock()).toBe(200);
  });

  it("un activo ya prestado no se puede volver a prestar", async () => {
    const { data: id } = await adminUser.rpc("inv_crear_articulo", {
      org: orgId,
      nombre: `Cámara Canon ${MARCA}`,
      descripcion: "",
      categoria: "equipamiento",
      naturaleza: "activo",
      ubicacion: null,
      cantidad_inicial: 1,
    });
    const { data: perfil } = await adminUser.auth.getUser();

    const primero = await adminUser.rpc("inv_prestar", {
      articulo: id,
      a_perfil: perfil.user!.id,
      devolucion: null,
      nota: "",
    });
    expect(primero.error).toBeNull();

    const segundo = await adminUser.rpc("inv_prestar", {
      articulo: id,
      a_perfil: perfil.user!.id,
      devolucion: null,
      nota: "",
    });
    expect(segundo.error).not.toBeNull();
    expect(segundo.error!.message).toContain("no está disponible");
  });

  it("no se puede despachar más de lo que hay, y el paquete queda intacto", async () => {
    const { data: articuloId } = await adminUser.rpc("inv_crear_articulo", {
      org: orgId,
      nombre: `Folleto escaso ${MARCA}`,
      descripcion: "",
      categoria: "grafico",
      naturaleza: "existencia",
      ubicacion: null,
      cantidad_inicial: 5,
    });

    const { data: paqueteId } = await adminUser.rpc("inv_crear_paquete", {
      org: orgId,
      destinatario: destinatarioId,
      nota: "",
    });

    await adminUser.rpc("inv_agregar_a_paquete", {
      paquete: paqueteId,
      articulo: articuloId,
      cantidad: 30,
    });

    const despacho = await adminUser.rpc("inv_despachar_paquete", { paquete: paqueteId });
    expect(despacho.error).not.toBeNull();
    expect(despacho.error!.message).toContain("stock suficiente");

    // Falla entero: ni se descontó ni se cerró el paquete.
    const { data: st } = await admin
      .from("inventario_stock")
      .select("stock")
      .eq("articulo_id", articuloId)
      .maybeSingle();
    expect(st?.stock ?? 0).toBe(5);

    const { data: paq } = await admin
      .from("inventario_paquetes")
      .select("estado")
      .eq("id", paqueteId)
      .single();
    expect(paq.estado).toBe("abierto");
  });

  it("despachar descuenta el stock y cierra el paquete; después no se toca", async () => {
    const { data: articuloId } = await adminUser.rpc("inv_crear_articulo", {
      org: orgId,
      nombre: `Cuadernillo ${MARCA}`,
      descripcion: "",
      categoria: "grafico",
      naturaleza: "existencia",
      ubicacion: null,
      cantidad_inicial: 100,
    });
    const { data: paqueteId } = await adminUser.rpc("inv_crear_paquete", {
      org: orgId,
      destinatario: destinatarioId,
      nota: "",
    });
    await adminUser.rpc("inv_agregar_a_paquete", {
      paquete: paqueteId,
      articulo: articuloId,
      cantidad: 30,
    });

    const despacho = await adminUser.rpc("inv_despachar_paquete", { paquete: paqueteId });
    expect(despacho.error).toBeNull();

    const { data: st } = await admin
      .from("inventario_stock")
      .select("stock")
      .eq("articulo_id", articuloId)
      .maybeSingle();
    expect(st?.stock).toBe(70);

    const reintento = await adminUser.rpc("inv_agregar_a_paquete", {
      paquete: paqueteId,
      articulo: articuloId,
      cantidad: 1,
    });
    expect(reintento.error).not.toBeNull();
    expect(reintento.error!.message).toContain("ya se despachó");
  });

  it("los movimientos no se pueden escribir directo: solo por RPC", async () => {
    const { data: articuloId } = await adminUser.rpc("inv_crear_articulo", {
      org: orgId,
      nombre: `Silla ${MARCA}`,
      descripcion: "",
      categoria: "mobiliario",
      naturaleza: "activo",
      ubicacion: null,
      cantidad_inicial: 1,
    });

    const { data: perfil } = await adminUser.auth.getUser();
    const { error } = await adminUser.from("inventario_movimientos").insert({
      org_id: orgId,
      articulo_id: articuloId,
      tipo: "ajuste",
      cantidad: 999,
      creado_por: perfil.user!.id,
    });
    expect(error).not.toBeNull();
  });

  it("otra organización no ve el inventario ajeno", async () => {
    const { data } = await gestora
      .from("inventario_articulos")
      .select("id")
      .eq("org_id", orgId);
    expect(data ?? []).toHaveLength(0);
  });

  it("sin permiso de inventario no se puede crear", async () => {
    const { error } = await gestora.rpc("inv_crear_articulo", {
      org: orgId,
      nombre: `Intruso ${MARCA}`,
      descripcion: "",
      categoria: "otro",
      naturaleza: "existencia",
      ubicacion: null,
      cantidad_inicial: 1,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("permiso");
  });
});
