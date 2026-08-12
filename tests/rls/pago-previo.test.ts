import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clienteAdmin, clienteComo } from "./helpers";

// Pago previo a la reserva (migración 0013). Edificio y plan efímeros propios
// para no tocar los del seed. Activar cobros_config no altera a los otros
// tests: el circuito lo dispara `planes_reserva.requiere_pago_previo`, que es
// por plan y viene en false.

const NOMBRE_EDIFICIO = "Edificio Cobros [test-pp]";
const NOMBRE_PLAN = "Con seña [test-pp]";
const FECHA = "2027-11-15";

async function limpiar(admin: SupabaseClient, orgId: string) {
  const { data: edificio } = await admin
    .from("edificios")
    .select("id")
    .eq("nombre", NOMBRE_EDIFICIO)
    .maybeSingle();
  if (edificio) {
    const { data: salas } = await admin.from("salas").select("id").eq("edificio_id", edificio.id);
    const idsSalas = (salas ?? []).map((s) => s.id);
    if (idsSalas.length) {
      const { data: reservas } = await admin
        .from("reservas")
        .select("id")
        .in("sala_id", idsSalas);
      const idsRes = (reservas ?? []).map((r) => r.id);
      if (idsRes.length) {
        await admin.from("pagos_reserva").delete().in("reserva_id", idsRes);
        await admin.from("movimientos").delete().in("reserva_id", idsRes);
      }
      await admin.from("reservas").delete().in("sala_id", idsSalas);
    }
    await admin.from("movimientos").delete().eq("edificio_id", edificio.id);
    await admin.from("edificios").delete().eq("id", edificio.id);
  }
  await admin.from("planes_reserva").delete().eq("org_id", orgId).eq("nombre", NOMBRE_PLAN);
  await admin.from("cobros_config").delete().eq("org_id", orgId);
}

describe("pago previo: retención del horario, vencimiento e ingreso", () => {
  const admin = clienteAdmin();
  let adminUser: SupabaseClient;
  let orgId: string;
  let salaId: string;
  let planId: string;

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

    const { data: edificio, error: eErr } = await admin
      .from("edificios")
      .insert({
        nombre: NOMBRE_EDIFICIO,
        org_propietaria_id: orgId,
        destino_ingresos: "propietaria",
      })
      .select("id")
      .single();
    if (eErr || !edificio) throw new Error(`edificio: ${eErr?.message}`);

    const { data: sala, error: sErr } = await admin
      .from("salas")
      .insert({ edificio_id: edificio.id, nombre: "Salón [test-pp]", tipo: "publica" })
      .select("id")
      .single();
    if (sErr || !sala) throw new Error(`sala: ${sErr?.message}`);
    salaId = sala.id;

    const { data: plan, error: pErr } = await admin
      .from("planes_reserva")
      .insert({
        org_id: orgId,
        nombre: NOMBRE_PLAN,
        gratuito: false,
        precio_hora: 1000,
        requiere_pago_previo: true,
      })
      .select("id")
      .single();
    if (pErr || !plan) throw new Error(`plan: ${pErr?.message}`);
    planId = plan.id;

    const { error: cErr } = await admin.from("cobros_config").insert({
      org_id: orgId,
      alias: "delta.test",
      titular: "Fundación Delta",
      plazo_horas: 48,
      activo: true,
    });
    if (cErr) throw new Error(`cobros_config: ${cErr.message}`);
  });

  afterAll(async () => {
    await limpiar(admin, orgId);
  });

  it("nace esperando pago, con vencimiento, y sin ingreso en finanzas", async () => {
    const { data: id, error } = await adminUser.rpc("crear_reserva", {
      sala: salaId,
      plan: planId,
      dia: FECHA,
      inicio: 10,
      duracion: 2,
      cliente: null,
    });
    expect(error).toBeNull();

    const { data: reserva } = await admin
      .from("reservas")
      .select("estado, vence_at, costo")
      .eq("id", id)
      .single();
    expect(reserva.estado).toBe("esperando_pago");
    expect(reserva.vence_at).not.toBeNull();
    expect(Number(reserva.costo)).toBe(2000);

    // El ingreso no debe existir todavía: nadie pagó.
    const { data: movs } = await admin.from("movimientos").select("id").eq("reserva_id", id);
    expect(movs ?? []).toHaveLength(0);
  });

  it("una reserva esperando pago BLOQUEA el horario", async () => {
    // Este es el test que protege la decisión de §4 del spec: si la constraint
    // de exclusión volviera a filtrar solo por 'confirmada', esto pasaría a
    // dejar reservar dos veces el mismo turno.
    const { error } = await adminUser.rpc("crear_reserva", {
      sala: salaId,
      plan: planId,
      dia: FECHA,
      inicio: 11,
      duracion: 1,
      cliente: null,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("ya está reservado");
  });

  it("registrar el pago confirma la reserva y recién ahí nace el ingreso", async () => {
    const { data: reserva } = await admin
      .from("reservas")
      .select("id, costo")
      .eq("sala_id", salaId)
      .eq("estado", "esperando_pago")
      .single();

    const { error } = await adminUser.rpc("registrar_pago_reserva", {
      reserva: reserva.id,
      monto: Number(reserva.costo),
      metodo: "transferencia",
      comprobante: null,
      nota: "",
    });
    expect(error).toBeNull();

    const { data: despues } = await admin
      .from("reservas")
      .select("estado")
      .eq("id", reserva.id)
      .single();
    expect(despues.estado).toBe("confirmada");

    const { data: movs } = await admin
      .from("movimientos")
      .select("monto, tipo")
      .eq("reserva_id", reserva.id);
    expect(movs ?? []).toHaveLength(1);
    expect(Number(movs![0].monto)).toBe(2000);
    expect(movs![0].tipo).toBe("ingreso");
  });

  it("un monto distinto al costo se rechaza", async () => {
    const { data: id } = await adminUser.rpc("crear_reserva", {
      sala: salaId,
      plan: planId,
      dia: FECHA,
      inicio: 15,
      duracion: 1,
      cliente: null,
    });

    const { error } = await adminUser.rpc("registrar_pago_reserva", {
      reserva: id,
      monto: 500,
      metodo: "transferencia",
      comprobante: null,
      nota: "",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("igual al costo");
  });

  it("al vencer libera el horario y el turno se puede volver a tomar", async () => {
    const { data: pendiente } = await admin
      .from("reservas")
      .select("id")
      .eq("sala_id", salaId)
      .eq("estado", "esperando_pago")
      .single();

    await admin
      .from("reservas")
      .update({ vence_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", pendiente.id);

    const { error: errCron } = await admin.rpc("vencer_reservas_impagas");
    expect(errCron).toBeNull();

    const { data: vencida } = await admin
      .from("reservas")
      .select("estado")
      .eq("id", pendiente.id)
      .single();
    expect(vencida.estado).toBe("vencida");

    // El horario quedó libre: la misma franja vuelve a entrar.
    const { error } = await adminUser.rpc("crear_reserva", {
      sala: salaId,
      plan: planId,
      dia: FECHA,
      inicio: 15,
      duracion: 1,
      cliente: null,
    });
    expect(error).toBeNull();
  });

  it("una reserva vencida no acepta pago", async () => {
    const { data: vencida } = await admin
      .from("reservas")
      .select("id, costo")
      .eq("sala_id", salaId)
      .eq("estado", "vencida")
      .limit(1)
      .single();

    const { error } = await adminUser.rpc("registrar_pago_reserva", {
      reserva: vencida.id,
      monto: Number(vencida.costo),
      metodo: "transferencia",
      comprobante: null,
      nota: "",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("venció");
  });
});
