import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clienteAdmin, clienteComo } from "./helpers";

// Reserva de este archivo vive en 2027-08-05 (no colisiona con las fechas de
// agosto 2027 usadas por tests/rls/reservas.test.ts, que cubre 08-01 a 08-04).
// Limpieza en beforeAll+afterAll con el cliente admin (bypassa RLS), igual
// que en reservas.test.ts, para poder correr los tests dos veces seguidas.
async function limpiarReserva0805(admin: SupabaseClient) {
  const { error } = await admin.from("reservas").delete().eq("fecha", "2027-08-05");
  if (error) throw new Error(`No pude limpiar la reserva de 2027-08-05: ${error.message}`);
}

describe("co-gestión: usuario solo-gestora y guard de crear_organizacion", () => {
  const admin = clienteAdmin();
  let gestora: SupabaseClient;
  let gestoraId: string;
  let casaDeltaId: string;
  let salaNorteId: string;
  let planGratuitoId: string;
  let fundacionDeltaId: string;

  beforeAll(async () => {
    await limpiarReserva0805(admin);

    gestora = await clienteComo("gestora@demo.test");

    const { data: gestoraUser, error: gestoraUserError } = await gestora.auth.getUser();
    if (gestoraUserError || !gestoraUser.user) throw new Error("No pude obtener el usuario gestora");
    gestoraId = gestoraUser.user.id;

    const { data: edificio, error: edificioError } = await admin
      .from("edificios")
      .select("id")
      .eq("nombre", "Casa Delta")
      .single();
    if (edificioError || !edificio) throw new Error("No encontré el edificio Casa Delta");
    casaDeltaId = edificio.id;

    const { data: salaNorte, error: salaNorteError } = await admin
      .from("salas")
      .select("id")
      .eq("edificio_id", casaDeltaId)
      .eq("nombre", "Sala Norte")
      .single();
    if (salaNorteError || !salaNorte) throw new Error("No encontré la Sala Norte");
    salaNorteId = salaNorte.id;

    const { data: fundacionDelta, error: fundacionDeltaError } = await admin
      .from("organizaciones")
      .select("id")
      .eq("nombre", "Fundación Delta")
      .single();
    if (fundacionDeltaError || !fundacionDelta) throw new Error("No encontré Fundación Delta");
    fundacionDeltaId = fundacionDelta.id;

    const { data: plan, error: planError } = await admin
      .from("planes_reserva")
      .select("id")
      .eq("org_id", fundacionDeltaId)
      .eq("nombre", "Gratuito")
      .single();
    if (planError || !plan) throw new Error("No encontré el plan Gratuito de Fundación Delta");
    planGratuitoId = plan.id;
  });

  afterAll(async () => {
    await limpiarReserva0805(admin);
  });

  it("gestora (solo miembro de Gestora Sur) ve el edificio co-gestionado y sus 3 salas", async () => {
    const { data: edificios, error: errorEdificios } = await gestora
      .from("edificios")
      .select("id")
      .eq("id", casaDeltaId);
    expect(errorEdificios).toBeNull();
    expect(edificios).toHaveLength(1);

    const { data: salas, error: errorSalas } = await gestora
      .from("salas")
      .select("id")
      .eq("edificio_id", casaDeltaId);
    expect(errorSalas).toBeNull();
    expect(salas).toHaveLength(3);
  });

  it("gestora crea una reserva para sí en Sala Norte con el plan Gratuito de Fundación Delta -> OK [fecha 2027-08-05]", async () => {
    const { data: reservaId, error } = await gestora.rpc("crear_reserva", {
      sala: salaNorteId,
      plan: planGratuitoId,
      dia: "2027-08-05",
      inicio: 11,
      duracion: 1,
    });

    expect(error).toBeNull();
    expect(reservaId).toBeTruthy();

    const { data: reserva } = await admin
      .from("reservas")
      .select("para_perfil_id, creada_por")
      .eq("id", reservaId as string)
      .single();
    expect(reserva!.para_perfil_id).toBe(gestoraId);
    expect(reserva!.creada_por).toBe(gestoraId);
  });

  it("gestora ve los clientes de Fundación Delta (autocompletar reservas) pero no sus movimientos", async () => {
    // Migración 0006: los clientes aplicables a una reserva son los de la org
    // propietaria del edificio, así que la co-gestión los expone (igual que
    // los planes). El libro (movimientos) sigue siendo privado de cada org.
    const { data: clientes, error: errorClientes } = await gestora
      .from("clientes")
      .select("id")
      .eq("org_id", fundacionDeltaId);
    expect(errorClientes).toBeNull();
    expect(clientes!.length).toBeGreaterThan(0);

    const { data: movimientos, error: errorMovimientos } = await gestora
      .from("movimientos")
      .select("id")
      .eq("org_id", fundacionDeltaId);
    expect(errorMovimientos).toBeNull();
    expect(movimientos).toEqual([]);
  });

  it("coordi (no super admin) no puede crear organizaciones vía RPC: guard 'Solo plataforma'", async () => {
    const coordi = await clienteComo("coordi@demo.test");
    const { data, error } = await coordi.rpc("crear_organizacion", {
      nombre: "Hack Org",
      tipo: "empresa",
      email_admin: "x@x.test",
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain("Solo plataforma");
    expect(data).toBeNull();

    const { data: hackOrgs, error: errorSelect } = await admin
      .from("organizaciones")
      .select("id")
      .eq("nombre", "Hack Org");
    expect(errorSelect).toBeNull();
    expect(hackOrgs).toEqual([]);

  });
});
