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
  const { error } = await admin
    .from("reservas")
    .delete()
    .gte("fecha", "2027-08-01")
    .lte("fecha", "2027-08-31");
  if (error) throw new Error(`No pude limpiar reservas de agosto 2027: ${error.message}`);
}

describe("reservas: permisos, solapamiento y checks", () => {
  const admin = clienteAdmin();
  let ope: SupabaseClient;
  let coordi: SupabaseClient;
  let opeId: string;
  let coordiId: string;
  let salaNorteId: string;
  let salaSurId: string;
  let planGratuitoId: string;
  let clienteId: string;

  beforeAll(async () => {
    // Leftovers de una corrida previa que haya crasheado antes de su afterAll
    // romperían el test de solapamiento (b): limpiamos también acá.
    await limpiarReservasAgosto2027(admin);

    ope = await clienteComo("ope@demo.test");
    coordi = await clienteComo("coordi@demo.test");

    const { data: opeUser, error: opeUserError } = await ope.auth.getUser();
    if (opeUserError || !opeUser.user) throw new Error("No pude obtener el usuario ope");
    opeId = opeUser.user.id;

    const { data: coordiUser, error: coordiUserError } = await coordi.auth.getUser();
    if (coordiUserError || !coordiUser.user) throw new Error("No pude obtener el usuario coordi");
    coordiId = coordiUser.user.id;

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

    const { data: cliente, error: clienteError } = await admin
      .from("clientes")
      .select("id")
      .eq("org_id", org.id)
      .limit(1)
      .single();
    if (clienteError || !cliente) throw new Error("No encontré ningún cliente de Fundación Delta");
    clienteId = cliente.id;
  });

  afterAll(async () => {
    await limpiarReservasAgosto2027(admin);
    await ope.auth.signOut();
    await coordi.auth.signOut();
  });

  it("(a) ope (permiso espacios) crea reserva para sí en Sala Norte -> OK [fecha 2027-08-01]", async () => {
    const { data, error } = await ope
      .from("reservas")
      .insert({
        sala_id: salaNorteId,
        plan_id: planGratuitoId,
        cliente_id: null,
        para_perfil_id: opeId,
        fecha: "2027-08-01",
        hora_inicio: 10,
        horas: 1,
        costo: 0,
        creada_por: opeId,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.para_perfil_id).toBe(opeId);
  });

  it("(b) reserva solapada misma sala/fecha/franja -> error 23P01 (exclusion) [fecha 2027-08-02]", async () => {
    const { error: errorBase } = await ope.from("reservas").insert({
      sala_id: salaNorteId,
      plan_id: planGratuitoId,
      cliente_id: null,
      para_perfil_id: opeId,
      fecha: "2027-08-02",
      hora_inicio: 10,
      horas: 1,
      costo: 0,
      creada_por: opeId,
    });
    expect(errorBase).toBeNull();

    // Se solapa con la anterior (10-11): esta pide 10-12 en la misma sala/fecha.
    const { error: errorSolapada } = await ope.from("reservas").insert({
      sala_id: salaNorteId,
      plan_id: planGratuitoId,
      cliente_id: null,
      para_perfil_id: opeId,
      fecha: "2027-08-02",
      hora_inicio: 10,
      horas: 2,
      costo: 0,
      creada_por: opeId,
    });

    expect(errorSolapada).not.toBeNull();
    expect(errorSolapada!.code).toBe("23P01");
  });

  it("(c) coordi (sin espacios) crea reserva para sí -> OK; update de reserva ajena -> 0 filas afectadas [fecha 2027-08-03]", async () => {
    const { error: errorCoordi } = await coordi.from("reservas").insert({
      sala_id: salaNorteId,
      plan_id: planGratuitoId,
      cliente_id: null,
      para_perfil_id: coordiId,
      fecha: "2027-08-03",
      hora_inicio: 9,
      horas: 1,
      costo: 0,
      creada_por: coordiId,
    });
    expect(errorCoordi).toBeNull();

    // Reserva "ajena" (para el update): la crea ope, en otra sala para no
    // solapar con la de coordi de arriba.
    const { data: reservaAjena, error: errorOpe } = await ope
      .from("reservas")
      .insert({
        sala_id: salaSurId,
        plan_id: planGratuitoId,
        cliente_id: null,
        para_perfil_id: opeId,
        fecha: "2027-08-03",
        hora_inicio: 14,
        horas: 1,
        costo: 0,
        creada_por: opeId,
      })
      .select()
      .single();
    expect(errorOpe).toBeNull();
    expect(reservaAjena).not.toBeNull();

    // coordi (no es dueña, no tiene permiso espacios) intenta modificarla.
    // Bajo RLS esto no da error: la fila queda fuera del USING de la policy
    // de update, así que 0 filas son afectadas. Encadenamos .select() para
    // poder comprobarlo (sin .select() supabase-js devuelve data: null).
    const { data: actualizadas, error: errorUpdate } = await coordi
      .from("reservas")
      .update({ horas: 2 })
      .eq("id", reservaAjena!.id)
      .select();

    expect(errorUpdate).toBeNull();
    expect(actualizadas).toEqual([]);

    // Confirmamos con el admin que la reserva ajena no cambió.
    const { data: sinTocar } = await admin
      .from("reservas")
      .select("horas")
      .eq("id", reservaAjena!.id)
      .single();
    expect(sinTocar!.horas).toBe(1);
  });

  it("(d) reserva con cliente_id y para_perfil_id ambos seteados -> error de check [fecha 2027-08-04]", async () => {
    const { error } = await ope.from("reservas").insert({
      sala_id: salaNorteId,
      plan_id: planGratuitoId,
      cliente_id: clienteId,
      para_perfil_id: opeId,
      fecha: "2027-08-04",
      hora_inicio: 10,
      horas: 1,
      costo: 0,
      creada_por: opeId,
    });

    expect(error).not.toBeNull();
    expect(error!.code).toBe("23514");
  });
});
