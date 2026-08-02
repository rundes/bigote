import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clienteAdmin, clienteComo } from "./helpers";

// Fechas de septiembre 2027 (agosto 2027 lo usa reservas.test.ts). La
// limpieza borra el rango completo con el admin para que la suite pueda
// correrse dos veces seguidas.
async function limpiarReservasSeptiembre2027(admin: SupabaseClient) {
  const { error } = await admin
    .from("reservas")
    .delete()
    .gte("fecha", "2027-09-01")
    .lte("fecha", "2027-09-30");
  if (error) throw new Error(`No pude limpiar reservas de septiembre 2027: ${error.message}`);
}

describe("crear_reserva / cancelar_reserva: validaciones server-side", () => {
  const admin = clienteAdmin();
  let ope: SupabaseClient;
  let coordi: SupabaseClient;
  let gestora: SupabaseClient;
  let salaNorteId: string;
  let estudioId: string;
  let planPagoId: string;
  let planComunidadId: string;
  let planPagoSurId: string;

  beforeAll(async () => {
    await limpiarReservasSeptiembre2027(admin);

    ope = await clienteComo("ope@demo.test");
    coordi = await clienteComo("coordi@demo.test");
    gestora = await clienteComo("gestora@demo.test");

    const { data: edificio } = await admin
      .from("edificios")
      .select("id, org_propietaria_id, org_gestora_id")
      .eq("nombre", "Casa Delta")
      .single();
    if (!edificio) throw new Error("No encontré el edificio Casa Delta");

    const { data: salas } = await admin
      .from("salas")
      .select("id, nombre")
      .eq("edificio_id", edificio.id);
    const salaNorte = salas?.find((s) => s.nombre === "Sala Norte");
    const estudio = salas?.find((s) => s.nombre === "Estudio");
    if (!salaNorte || !estudio) throw new Error("Faltan salas del seed (Sala Norte / Estudio)");
    salaNorteId = salaNorte.id;
    estudioId = estudio.id;

    const { data: planes } = await admin
      .from("planes_reserva")
      .select("id, nombre, org_id");
    const planPago = planes?.find(
      (p) => p.nombre === "Pago por hora" && p.org_id === edificio.org_propietaria_id
    );
    const planComunidad = planes?.find(
      (p) => p.nombre === "Comunidad" && p.org_id === edificio.org_propietaria_id
    );
    const planPagoSur = planes?.find(
      (p) => p.nombre === "Pago Sur" && p.org_id === edificio.org_gestora_id
    );
    if (!planPago || !planComunidad || !planPagoSur) {
      throw new Error("Faltan planes del seed (Pago por hora / Comunidad / Pago Sur)");
    }
    planPagoId = planPago.id;
    planComunidadId = planComunidad.id;
    planPagoSurId = planPagoSur.id;
  });

  afterAll(async () => {
    await limpiarReservasSeptiembre2027(admin);
    await ope.auth.signOut();
    await coordi.auth.signOut();
    await gestora.auth.signOut();
  });

  it("(1) el costo lo calcula el servidor: plan pago 2h -> costo 16000 [fecha 2027-09-01]", async () => {
    // La RPC ni siquiera acepta un parámetro de costo: no hay forma de
    // mandarlo desde el cliente (criterio del spec §5.3).
    const { data: reservaId, error } = await ope.rpc("crear_reserva", {
      sala: salaNorteId,
      plan: planPagoId,
      dia: "2027-09-01",
      inicio: 10,
      duracion: 2,
    });
    expect(error).toBeNull();

    const { data: reserva } = await admin
      .from("reservas")
      .select("costo")
      .eq("id", reservaId as string)
      .single();
    expect(Number(reserva!.costo)).toBe(16000);
  });

  it("(2) plan de la org gestora -> 'Ese plan no aplica acá' [fecha 2027-09-01]", async () => {
    const { error } = await gestora.rpc("crear_reserva", {
      sala: salaNorteId,
      plan: planPagoSurId,
      dia: "2027-09-01",
      inicio: 15,
      duracion: 1,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("Ese plan no aplica acá");
  });

  it("(2b) cliente de otra org -> 'Ese cliente no es de la organización' [fecha 2027-09-01]", async () => {
    // Cliente efímero de Gestora Sur: no pertenece a la org propietaria del
    // edificio, así que la RPC lo rechaza aunque quien reserva sí opere ahí.
    const { data: edificio } = await admin
      .from("edificios")
      .select("org_gestora_id")
      .eq("nombre", "Casa Delta")
      .single();
    const { data: clienteAjeno, error: errorCliente } = await admin
      .from("clientes")
      .insert({ org_id: edificio!.org_gestora_id, nombre: "Cliente Sur [test-f3]" })
      .select("id")
      .single();
    expect(errorCliente).toBeNull();

    const { error } = await ope.rpc("crear_reserva", {
      sala: salaNorteId,
      plan: planPagoId,
      dia: "2027-09-01",
      inicio: 18,
      duracion: 1,
      cliente: clienteAjeno!.id,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("Ese cliente no es de la organización");

    await admin.from("clientes").delete().eq("id", clienteAjeno!.id);
  });

  it("(3) plan solo salas públicas en sala privada -> error [fecha 2027-09-01]", async () => {
    const { error } = await ope.rpc("crear_reserva", {
      sala: estudioId,
      plan: planComunidadId,
      dia: "2027-09-01",
      inicio: 10,
      duracion: 1,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("Ese plan es solo para salas públicas");
  });

  it("(4) fecha pasada -> 'Esa fecha ya pasó'", async () => {
    const { error } = await ope.rpc("crear_reserva", {
      sala: salaNorteId,
      plan: planPagoId,
      dia: "2020-01-01",
      inicio: 10,
      duracion: 1,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("Esa fecha ya pasó");
  });

  it("(5) cancelar: solo creadora (o permiso espacios), con motivo obligatorio [fecha 2027-09-02]", async () => {
    const { data: reservaId, error: errorAlta } = await ope.rpc("crear_reserva", {
      sala: salaNorteId,
      plan: planPagoId,
      dia: "2027-09-02",
      inicio: 10,
      duracion: 1,
    });
    expect(errorAlta).toBeNull();

    // coordi no la creó y no tiene permiso espacios
    const { error: errorAjena } = await coordi.rpc("cancelar_reserva", {
      reserva: reservaId as string,
      motivo: "no va más",
    });
    expect(errorAjena).not.toBeNull();
    expect(errorAjena!.message).toContain("Solo quien la creó");

    // la creadora, pero sin motivo
    const { error: errorSinMotivo } = await ope.rpc("cancelar_reserva", {
      reserva: reservaId as string,
      motivo: "  ",
    });
    expect(errorSinMotivo).not.toBeNull();
    expect(errorSinMotivo!.message).toContain("Contanos el motivo");

    // la creadora, con motivo
    const { error: errorCancelar } = await ope.rpc("cancelar_reserva", {
      reserva: reservaId as string,
      motivo: "Se levantó la reunión",
    });
    expect(errorCancelar).toBeNull();

    const { data: reserva } = await admin
      .from("reservas")
      .select("estado, motivo_cancelacion")
      .eq("id", reservaId as string)
      .single();
    expect(reserva!.estado).toBe("cancelada");
    expect(reserva!.motivo_cancelacion).toBe("Se levantó la reunión");
  });

  it("(6) co-gestión: gestora (permiso espacios en la org gestora) cancela una reserva ajena [fecha 2027-09-03]", async () => {
    const { data: reservaId, error: errorAlta } = await ope.rpc("crear_reserva", {
      sala: salaNorteId,
      plan: planPagoId,
      dia: "2027-09-03",
      inicio: 10,
      duracion: 1,
    });
    expect(errorAlta).toBeNull();

    const { error } = await gestora.rpc("cancelar_reserva", {
      reserva: reservaId as string,
      motivo: "Mantenimiento de la sala",
    });
    expect(error).toBeNull();

    const { data: reserva } = await admin
      .from("reservas")
      .select("estado")
      .eq("id", reservaId as string)
      .single();
    expect(reserva!.estado).toBe("cancelada");
  });

  it("(7) la franja de una reserva cancelada se puede volver a reservar [fecha 2027-09-04]", async () => {
    const { data: primeraId, error: errorPrimera } = await ope.rpc("crear_reserva", {
      sala: salaNorteId,
      plan: planPagoId,
      dia: "2027-09-04",
      inicio: 10,
      duracion: 1,
    });
    expect(errorPrimera).toBeNull();

    const { error: errorCancelar } = await ope.rpc("cancelar_reserva", {
      reserva: primeraId as string,
      motivo: "Cambio de planes",
    });
    expect(errorCancelar).toBeNull();

    const { error: errorSegunda } = await coordi.rpc("crear_reserva", {
      sala: salaNorteId,
      plan: planPagoId,
      dia: "2027-09-04",
      inicio: 10,
      duracion: 1,
    });
    expect(errorSegunda).toBeNull();
  });
});
