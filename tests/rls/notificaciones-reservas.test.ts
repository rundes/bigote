import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clienteAdmin, clienteComo } from "./helpers";

// Los triggers de 0008 encolan confirmación + recordatorio al reservar y
// avisos al cancelar, filtrando por preferencias/teléfono al encolar.
// Sala y plan salen del mismo seed que usa crear-reserva.test.ts (Casa
// Delta / Sala Norte / Pago por hora), así el costo da > 0 y el trigger de
// fase 4 genera movimientos que hay que limpiar antes de borrar la reserva.
// Rango de fechas relativas a "hoy" que usa esta suite (fechaFutura(7..10)).
// Se limpia por rango (sala + hora + fechas), no por ids en memoria, para
// que una corrida abortada (ctrl-C, kill, corte de red) no deje reservas
// huérfanas que choquen con reservas_sin_solape en la siguiente corrida.
function fechaFutura(dias: number): string {
  const d = new Date(Date.now() + dias * 86400000);
  return d.toISOString().slice(0, 10);
}
const HORA_RESERVA = 10;
const RANGO_DESDE = fechaFutura(0);
const RANGO_HASTA = fechaFutura(15); // margen sobre el 7..10 que usan los tests

async function limpiarReservasEnCurso(admin: SupabaseClient, salaId: string) {
  const { data: reservas } = await admin
    .from("reservas")
    .select("id")
    .eq("sala_id", salaId)
    .eq("hora_inicio", HORA_RESERVA)
    .gte("fecha", RANGO_DESDE)
    .lte("fecha", RANGO_HASTA);
  const ids = (reservas ?? []).map((r) => r.id);
  if (ids.length === 0) return;

  await admin.from("notificaciones").delete().in("payload->>reserva_id", ids);
  // Igual que crear-reserva.test.ts: primero los movimientos generados por
  // el trigger de fase 4 (FK a reservas, sin cascade), después las reservas.
  const { error: errorMovs } = await admin.from("movimientos").delete().in("reserva_id", ids);
  if (errorMovs) throw new Error(`No pude limpiar movimientos: ${errorMovs.message}`);
  const { error: errorReservas } = await admin.from("reservas").delete().in("id", ids);
  if (errorReservas) throw new Error(`No pude limpiar reservas: ${errorReservas.message}`);
}

describe("triggers de notificaciones: reservas", () => {
  const admin = clienteAdmin();
  let adminId: string;
  let salaNorteId: string;
  let planPagoId: string;

  beforeAll(async () => {
    const { data: perfil } = await admin
      .from("perfiles").select("id").eq("email", "admin@demo.test").single();
    adminId = perfil!.id;

    const { data: edificio } = await admin
      .from("edificios")
      .select("id, org_propietaria_id")
      .eq("nombre", "Casa Delta")
      .single();
    if (!edificio) throw new Error("No encontré el edificio Casa Delta");

    const { data: salas } = await admin
      .from("salas")
      .select("id, nombre")
      .eq("edificio_id", edificio.id);
    const salaNorte = salas?.find((s) => s.nombre === "Sala Norte");
    if (!salaNorte) throw new Error("Falta la sala del seed (Sala Norte)");
    salaNorteId = salaNorte.id;

    const { data: planes } = await admin
      .from("planes_reserva")
      .select("id, nombre, org_id");
    const planPago = planes?.find(
      (p) => p.nombre === "Pago por hora" && p.org_id === edificio.org_propietaria_id
    );
    if (!planPago) throw new Error("Falta el plan del seed (Pago por hora)");
    planPagoId = planPago.id;

    // Self-healing: si una corrida anterior quedó a medio limpiar, se borra
    // acá antes de crear nada nuevo.
    await limpiarReservasEnCurso(admin, salaNorteId);
  }, 30000);

  afterAll(async () => {
    await limpiarReservasEnCurso(admin, salaNorteId);
    await admin.from("preferencias_notificaciones").delete().eq("usuario_id", adminId);
    await admin.from("perfiles").update({ telefono: null }).eq("id", adminId);
  }, 30000);

  async function reservar(dia: string): Promise<string> {
    const comoAdmin = await clienteComo("admin@demo.test");
    const { data: reservaId, error } = await comoAdmin.rpc("crear_reserva", {
      sala: salaNorteId, plan: planPagoId, dia, inicio: HORA_RESERVA, duracion: 2, cliente: null,
    });
    expect(error).toBeNull();
    return reservaId as string;
  }

  it("reservar encola confirmación email + recordatorio 24 h antes", async () => {
    const reservaId = await reservar(fechaFutura(7));
    const { data: filas } = await admin
      .from("notificaciones")
      .select("evento, canal, estado, programada_para, payload")
      .eq("usuario_id", adminId)
      .eq("payload->>reserva_id", reservaId);

    const confirmada = filas!.find((f) => f.evento === "reserva_confirmada");
    expect(confirmada).toBeDefined();
    expect(confirmada!.canal).toBe("email"); // sin teléfono ni push: solo email
    expect(confirmada!.estado).toBe("pendiente");

    const recordatorio = filas!.find((f) => f.evento === "reserva_recordatorio");
    expect(recordatorio).toBeDefined();
    expect(new Date(recordatorio!.programada_para!).getTime()).toBeLessThan(
      Date.now() + 7 * 86400000
    );
  });

  it("con teléfono cargado también encola canal wa", async () => {
    await admin.from("perfiles").update({ telefono: "+5491155566677" }).eq("id", adminId);
    const reservaId = await reservar(fechaFutura(8));
    const { data: filas } = await admin
      .from("notificaciones")
      .select("canal")
      .eq("payload->>reserva_id", reservaId)
      .eq("evento", "reserva_confirmada");
    expect(filas!.map((f) => f.canal).sort()).toEqual(["email", "wa"]);
  });

  it("preferencia email off: no encola email", async () => {
    await admin.from("preferencias_notificaciones")
      .upsert({ usuario_id: adminId, email: false, wa: false });
    const reservaId = await reservar(fechaFutura(9));
    const { data: filas } = await admin
      .from("notificaciones").select("canal").eq("payload->>reserva_id", reservaId);
    expect(filas).toHaveLength(0);
    await admin.from("preferencias_notificaciones").delete().eq("usuario_id", adminId);
  });

  it("cancelar descarta el recordatorio y avisa sin incluir al autor", async () => {
    const reservaId = await reservar(fechaFutura(10));
    const comoAdmin = await clienteComo("admin@demo.test");
    const { error } = await comoAdmin.rpc("cancelar_reserva", {
      reserva: reservaId, motivo: "test triggers",
    });
    expect(error).toBeNull();

    const { data: recordatorios } = await admin
      .from("notificaciones")
      .select("estado")
      .eq("evento", "reserva_recordatorio")
      .eq("payload->>reserva_id", reservaId);
    expect(recordatorios!.every((r) => r.estado === "descartada")).toBe(true);

    // admin canceló su propia reserva: no se avisa a sí mismo
    const { data: canceladas } = await admin
      .from("notificaciones")
      .select("usuario_id")
      .eq("evento", "reserva_cancelada")
      .eq("payload->>reserva_id", reservaId);
    expect(canceladas!.every((c) => c.usuario_id !== adminId)).toBe(true);
  });
});
