import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clienteAdmin, clienteComo } from "./helpers";

// Movimientos automáticos por reserva (migración 0007). Para poder mutar
// `destino_ingresos` sin pisar a los otros archivos de test (corren en
// paralelo contra Casa Delta), todo pasa por un edificio efímero propio:
// propietaria Fundación Delta, gestora Gestora Sur, reparto 60%. Reservas en
// octubre de 2027. La limpieza borra movimientos -> reservas -> edificio
// (cascada de salas) -> plan efímero, en ese orden por las FKs.

const NOMBRE_EDIFICIO = "Edificio Finanzas [test-f4]";
const NOMBRE_PLAN_IMPAR = "Impar [test-f4]";

async function limpiar(admin: SupabaseClient, fundacionDeltaId: string | null) {
  const { data: edificio } = await admin
    .from("edificios")
    .select("id")
    .eq("nombre", NOMBRE_EDIFICIO)
    .maybeSingle();
  if (edificio) {
    const { data: salas } = await admin.from("salas").select("id").eq("edificio_id", edificio.id);
    const idsSalas = (salas ?? []).map((s) => s.id);

    let paso = await admin.from("movimientos").delete().eq("edificio_id", edificio.id);
    if (paso.error) throw new Error(`limpiar movimientos: ${paso.error.message}`);
    if (idsSalas.length > 0) {
      paso = await admin.from("reservas").delete().in("sala_id", idsSalas);
      if (paso.error) throw new Error(`limpiar reservas: ${paso.error.message}`);
    }
    paso = await admin.from("edificios").delete().eq("id", edificio.id);
    if (paso.error) throw new Error(`limpiar edificio: ${paso.error.message}`);
  }
  if (fundacionDeltaId) {
    const { error } = await admin
      .from("planes_reserva")
      .delete()
      .eq("org_id", fundacionDeltaId)
      .eq("nombre", NOMBRE_PLAN_IMPAR);
    if (error) throw new Error(`limpiar plan impar: ${error.message}`);
  }
}

describe("movimientos por reserva: destinos, redondeo, reversión y RLS", () => {
  const admin = clienteAdmin();
  let ope: SupabaseClient;
  let coordi: SupabaseClient;
  let adminUser: SupabaseClient;
  let adminUserId: string;
  let fundacionDeltaId: string;
  let gestoraSurId: string;
  let edificioId: string;
  let salaId: string;
  let planPagoId: string;
  let planGratuitoId: string;
  let planImparId: string;
  let reservaRepartoId: string;

  beforeAll(async () => {
    const { data: delta } = await admin
      .from("organizaciones")
      .select("id")
      .eq("nombre", "Fundación Delta")
      .single();
    const { data: sur } = await admin
      .from("organizaciones")
      .select("id")
      .eq("nombre", "Gestora Sur")
      .single();
    if (!delta || !sur) throw new Error("Faltan las orgs del seed");
    fundacionDeltaId = delta.id;
    gestoraSurId = sur.id;

    await limpiar(admin, fundacionDeltaId);

    const { data: edificio, error: edificioError } = await admin
      .from("edificios")
      .insert({
        nombre: NOMBRE_EDIFICIO,
        org_propietaria_id: fundacionDeltaId,
        org_gestora_id: gestoraSurId,
        destino_ingresos: "reparto",
        porcentaje_propietaria: 60,
      })
      .select("id")
      .single();
    if (edificioError || !edificio) throw new Error(`insert edificio: ${edificioError?.message}`);
    edificioId = edificio.id;

    const { data: sala, error: salaError } = await admin
      .from("salas")
      .insert({ edificio_id: edificioId, nombre: "Sala F [test-f4]", tipo: "publica" })
      .select("id")
      .single();
    if (salaError || !sala) throw new Error(`insert sala: ${salaError?.message}`);
    salaId = sala.id;

    const { data: planPago } = await admin
      .from("planes_reserva")
      .select("id")
      .eq("org_id", fundacionDeltaId)
      .eq("nombre", "Pago por hora")
      .single();
    const { data: planGratuito } = await admin
      .from("planes_reserva")
      .select("id")
      .eq("org_id", fundacionDeltaId)
      .eq("nombre", "Gratuito")
      .single();
    if (!planPago || !planGratuito) throw new Error("Faltan planes del seed");
    planPagoId = planPago.id;
    planGratuitoId = planGratuito.id;

    const { data: planImpar, error: planImparError } = await admin
      .from("planes_reserva")
      .insert({
        org_id: fundacionDeltaId,
        nombre: NOMBRE_PLAN_IMPAR,
        gratuito: false,
        precio_hora: 33.33,
      })
      .select("id")
      .single();
    if (planImparError || !planImpar) throw new Error(`insert plan impar: ${planImparError?.message}`);
    planImparId = planImpar.id;

    ope = await clienteComo("ope@demo.test");
    coordi = await clienteComo("coordi@demo.test");
    adminUser = await clienteComo("admin@demo.test");

    const { data: adminAuth, error: adminAuthError } = await adminUser.auth.getUser();
    if (adminAuthError || !adminAuth.user) throw new Error("No pude obtener el usuario admin");
    adminUserId = adminAuth.user.id;
  });

  afterAll(async () => {
    await limpiar(admin, fundacionDeltaId);
    await ope.auth.signOut();
    await coordi.auth.signOut();
    await adminUser.auth.signOut();
  });

  it("(1) reparto 60%: dos ingresos que suman el costo exacto de la reserva [fecha 2027-10-01]", async () => {
    const { data: reservaId, error } = await ope.rpc("crear_reserva", {
      sala: salaId,
      plan: planPagoId,
      dia: "2027-10-01",
      inicio: 10,
      duracion: 2,
    });
    expect(error).toBeNull();
    reservaRepartoId = reservaId as string;

    const { data: reserva } = await admin
      .from("reservas")
      .select("costo")
      .eq("id", reservaRepartoId)
      .single();

    const { data: movimientos } = await admin
      .from("movimientos")
      .select("org_id, tipo, categoria, monto, edificio_id, origen")
      .eq("reserva_id", reservaRepartoId);

    expect(movimientos).toHaveLength(2);
    const delta = movimientos!.find((m) => m.org_id === fundacionDeltaId);
    const sur = movimientos!.find((m) => m.org_id === gestoraSurId);
    expect(Number(delta!.monto)).toBe(9600);
    expect(Number(sur!.monto)).toBe(6400);
    for (const m of movimientos!) {
      expect(m.tipo).toBe("ingreso");
      expect(m.categoria).toBe("reservas");
      expect(m.origen).toBe("reserva");
      expect(m.edificio_id).toBe(edificioId);
    }

    // Criterio §5.3: el costo mostrado (el de la reserva) coincide con la
    // suma de los movimientos generados.
    const suma = movimientos!.reduce((acc, m) => acc + Number(m.monto), 0);
    expect(suma).toBe(Number(reserva!.costo));
  });

  it("(2) redondeo a favor de la propietaria: $33.33 -> 20.00 / 13.33 [fecha 2027-10-01]", async () => {
    const { data: reservaId, error } = await ope.rpc("crear_reserva", {
      sala: salaId,
      plan: planImparId,
      dia: "2027-10-01",
      inicio: 14,
      duracion: 1,
    });
    expect(error).toBeNull();

    const { data: movimientos } = await admin
      .from("movimientos")
      .select("org_id, monto")
      .eq("reserva_id", reservaId as string);

    const delta = movimientos!.find((m) => m.org_id === fundacionDeltaId);
    const sur = movimientos!.find((m) => m.org_id === gestoraSurId);
    expect(Number(delta!.monto)).toBe(20.0);
    expect(Number(sur!.monto)).toBe(13.33);
    expect(Number(delta!.monto) + Number(sur!.monto)).toBeCloseTo(33.33, 2);
  });

  it("(3) modos propietaria y gestora: un solo ingreso en el libro que corresponde [fecha 2027-10-02]", async () => {
    const { error: e1 } = await admin
      .from("edificios")
      .update({ destino_ingresos: "propietaria" })
      .eq("id", edificioId);
    expect(e1).toBeNull();

    const { data: reservaProp } = await ope.rpc("crear_reserva", {
      sala: salaId,
      plan: planPagoId,
      dia: "2027-10-02",
      inicio: 10,
      duracion: 1,
    });
    const { data: movsProp } = await admin
      .from("movimientos")
      .select("org_id, monto")
      .eq("reserva_id", reservaProp as string);
    expect(movsProp).toHaveLength(1);
    expect(movsProp![0].org_id).toBe(fundacionDeltaId);
    expect(Number(movsProp![0].monto)).toBe(8000);

    const { error: e2 } = await admin
      .from("edificios")
      .update({ destino_ingresos: "gestora" })
      .eq("id", edificioId);
    expect(e2).toBeNull();

    const { data: reservaGest } = await ope.rpc("crear_reserva", {
      sala: salaId,
      plan: planPagoId,
      dia: "2027-10-02",
      inicio: 12,
      duracion: 1,
    });
    const { data: movsGest } = await admin
      .from("movimientos")
      .select("org_id, monto")
      .eq("reserva_id", reservaGest as string);
    expect(movsGest).toHaveLength(1);
    expect(movsGest![0].org_id).toBe(gestoraSurId);
    expect(Number(movsGest![0].monto)).toBe(8000);

    const { error: e3 } = await admin
      .from("edificios")
      .update({ destino_ingresos: "reparto" })
      .eq("id", edificioId);
    expect(e3).toBeNull();
  });

  it("(4) cancelar la reserva revierte todos sus movimientos, trazado en la reserva", async () => {
    const { error } = await ope.rpc("cancelar_reserva", {
      reserva: reservaRepartoId,
      motivo: "Se suspendió el evento",
    });
    expect(error).toBeNull();

    const { data: movimientos } = await admin
      .from("movimientos")
      .select("id")
      .eq("reserva_id", reservaRepartoId);
    expect(movimientos).toEqual([]);

    const { data: reserva } = await admin
      .from("reservas")
      .select("estado, motivo_cancelacion")
      .eq("id", reservaRepartoId)
      .single();
    expect(reserva!.estado).toBe("cancelada");
    expect(reserva!.motivo_cancelacion).toBe("Se suspendió el evento");
  });

  it("(5) reserva gratuita no genera movimientos [fecha 2027-10-03]", async () => {
    const { data: reservaId, error } = await ope.rpc("crear_reserva", {
      sala: salaId,
      plan: planGratuitoId,
      dia: "2027-10-03",
      inicio: 10,
      duracion: 1,
    });
    expect(error).toBeNull();

    const { data: movimientos } = await admin
      .from("movimientos")
      .select("id")
      .eq("reserva_id", reservaId as string);
    expect(movimientos).toEqual([]);
  });

  it("(6) RLS: sin permiso finanzas no se leen movimientos; con permiso sí", async () => {
    // coordi (permiso finanzas: false) no ve nada del libro de su propia org
    const { data: deCoordi, error: errorCoordi } = await coordi
      .from("movimientos")
      .select("id")
      .eq("org_id", fundacionDeltaId);
    expect(errorCoordi).toBeNull();
    expect(deCoordi).toEqual([]);

    // admin (finanzas: true en ambas orgs) ve los ingresos del edificio efímero
    const { data: deAdmin, error: errorAdmin } = await adminUser
      .from("movimientos")
      .select("id")
      .eq("edificio_id", edificioId);
    expect(errorAdmin).toBeNull();
    expect(deAdmin!.length).toBeGreaterThan(0);
  });

  it("(7) insert manual con origen='reserva' -> rechazado por la política", async () => {
    const { data, error } = await adminUser
      .from("movimientos")
      .insert({
        org_id: fundacionDeltaId,
        tipo: "ingreso",
        categoria: "reservas",
        monto: 1000,
        detalle: "trucho",
        fecha: "2027-10-01",
        origen: "reserva",
        creado_por: adminUserId,
      })
      .select();

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});
