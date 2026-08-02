import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clienteAdmin, clienteComo } from "./helpers";

// Todas las reservas de estos tests viven en agosto de 2027 (una fecha por
// escenario, documentada en cada test) para no colisionar entre sí ni con
// corridas anteriores/futuras. La limpieza (beforeAll + afterAll) borra todo
// lo que caiga en ese rango con el cliente admin (bypassa RLS), así los
// tests pueden correrse dos veces seguidas sin arrastrar basura de una
// corrida previa que haya crasheado antes de su propio afterAll.
async function limpiarReservasAgosto2027(admin: SupabaseClient) {
  // Primero los movimientos generados por el trigger (FK a reservas), después
  // las reservas. Este archivo usa solo el plan Gratuito (sin movimientos),
  // pero la limpieza barre el mes completo por si otra corrida dejó algo.
  const { data: reservas } = await admin
    .from("reservas")
    .select("id")
    .gte("fecha", "2027-08-01")
    .lte("fecha", "2027-08-31");
  const ids = (reservas ?? []).map((r) => r.id);
  if (ids.length === 0) return;

  const { error: errorMovs } = await admin.from("movimientos").delete().in("reserva_id", ids);
  if (errorMovs) throw new Error(`No pude limpiar movimientos de agosto 2027: ${errorMovs.message}`);

  const { error } = await admin.from("reservas").delete().in("id", ids);
  if (error) throw new Error(`No pude limpiar reservas de agosto 2027: ${error.message}`);
}

describe("reservas: permisos, solapamiento y endurecimiento", () => {
  const admin = clienteAdmin();
  let ope: SupabaseClient;
  let coordi: SupabaseClient;
  let opeId: string;
  let salaNorteId: string;
  let salaSurId: string;
  let planGratuitoId: string;

  beforeAll(async () => {
    // Leftovers de una corrida previa que haya crasheado antes de su afterAll
    // romperían el test de solapamiento (b): limpiamos también acá.
    await limpiarReservasAgosto2027(admin);

    ope = await clienteComo("ope@demo.test");
    coordi = await clienteComo("coordi@demo.test");

    const { data: opeUser, error: opeUserError } = await ope.auth.getUser();
    if (opeUserError || !opeUser.user) throw new Error("No pude obtener el usuario ope");
    opeId = opeUser.user.id;

    const { data: edificio, error: edificioError } = await admin
      .from("edificios")
      .select("id")
      .eq("nombre", "Casa Delta")
      .single();
    if (edificioError || !edificio) throw new Error("No encontré el edificio Casa Delta");

    const { data: salaNorte, error: salaNorteError } = await admin
      .from("salas")
      .select("id")
      .eq("edificio_id", edificio.id)
      .eq("nombre", "Sala Norte")
      .single();
    if (salaNorteError || !salaNorte) throw new Error("No encontré la Sala Norte");
    salaNorteId = salaNorte.id;

    const { data: salaSur, error: salaSurError } = await admin
      .from("salas")
      .select("id")
      .eq("edificio_id", edificio.id)
      .eq("nombre", "Sala Sur")
      .single();
    if (salaSurError || !salaSur) throw new Error("No encontré la Sala Sur");
    salaSurId = salaSur.id;

    const { data: org, error: orgError } = await admin
      .from("organizaciones")
      .select("id")
      .eq("nombre", "Fundación Delta")
      .single();
    if (orgError || !org) throw new Error("No encontré Fundación Delta");

    const { data: plan, error: planError } = await admin
      .from("planes_reserva")
      .select("id")
      .eq("org_id", org.id)
      .eq("nombre", "Gratuito")
      .single();
    if (planError || !plan) throw new Error("No encontré el plan Gratuito");
    planGratuitoId = plan.id;
  });

  afterAll(async () => {
    await limpiarReservasAgosto2027(admin);
    await ope.auth.signOut();
    await coordi.auth.signOut();
  });

  it("(a) ope crea reserva para sí vía RPC -> OK y queda a su nombre [fecha 2027-08-01]", async () => {
    const { data: reservaId, error } = await ope.rpc("crear_reserva", {
      sala: salaNorteId,
      plan: planGratuitoId,
      dia: "2027-08-01",
      inicio: 10,
      duracion: 1,
    });

    expect(error).toBeNull();
    expect(reservaId).toBeTruthy();

    const { data: reserva } = await admin
      .from("reservas")
      .select("para_perfil_id, cliente_id, creada_por, costo")
      .eq("id", reservaId as string)
      .single();
    expect(reserva!.para_perfil_id).toBe(opeId);
    expect(reserva!.cliente_id).toBeNull();
    expect(reserva!.creada_por).toBe(opeId);
    expect(Number(reserva!.costo)).toBe(0);
  });

  it("(b) reserva solapada misma sala/fecha/franja -> 'Ese horario ya está reservado' [fecha 2027-08-02]", async () => {
    const { error: errorBase } = await ope.rpc("crear_reserva", {
      sala: salaNorteId,
      plan: planGratuitoId,
      dia: "2027-08-02",
      inicio: 10,
      duracion: 1,
    });
    expect(errorBase).toBeNull();

    // Se solapa con la anterior (10-11): esta pide 10-12 en la misma sala/fecha.
    const { error: errorSolapada } = await ope.rpc("crear_reserva", {
      sala: salaNorteId,
      plan: planGratuitoId,
      dia: "2027-08-02",
      inicio: 10,
      duracion: 2,
    });

    expect(errorSolapada).not.toBeNull();
    expect(errorSolapada!.message).toContain("Ese horario ya está reservado");
  });

  it("(c) coordi (sin espacios) reserva para sí -> OK; update directo -> 0 filas incluso para quien la creó [fecha 2027-08-03]", async () => {
    const { error: errorCoordi } = await coordi.rpc("crear_reserva", {
      sala: salaNorteId,
      plan: planGratuitoId,
      dia: "2027-08-03",
      inicio: 9,
      duracion: 1,
    });
    expect(errorCoordi).toBeNull();

    const { data: reservaOpeId, error: errorOpe } = await ope.rpc("crear_reserva", {
      sala: salaSurId,
      plan: planGratuitoId,
      dia: "2027-08-03",
      inicio: 14,
      duracion: 1,
    });
    expect(errorOpe).toBeNull();

    // La migración 0005 eliminó las políticas de escritura directa: ni
    // siquiera quien creó la reserva puede tocarla con un update (solo las
    // RPCs mutan reservas). Encadenamos .select() para ver filas afectadas.
    const { data: porCoordi, error: errorUpdateCoordi } = await coordi
      .from("reservas")
      .update({ horas: 2 })
      .eq("id", reservaOpeId as string)
      .select();
    expect(errorUpdateCoordi).toBeNull();
    expect(porCoordi).toEqual([]);

    const { data: porOpe, error: errorUpdateOpe } = await ope
      .from("reservas")
      .update({ horas: 2 })
      .eq("id", reservaOpeId as string)
      .select();
    expect(errorUpdateOpe).toBeNull();
    expect(porOpe).toEqual([]);

    const { data: sinTocar } = await admin
      .from("reservas")
      .select("horas")
      .eq("id", reservaOpeId as string)
      .single();
    expect(sinTocar!.horas).toBe(1);
  });

  it("(d) insert directo en reservas -> denegado por RLS (sin política de insert) [fecha 2027-08-04]", async () => {
    const { data, error } = await ope
      .from("reservas")
      .insert({
        sala_id: salaNorteId,
        plan_id: planGratuitoId,
        cliente_id: null,
        para_perfil_id: opeId,
        fecha: "2027-08-04",
        hora_inicio: 10,
        horas: 1,
        costo: 0,
        creada_por: opeId,
      })
      .select();

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});
