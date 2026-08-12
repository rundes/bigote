import { describe, it, expect } from "vitest";
import { renderEmail, decidirEnvio } from "@/lib/notificaciones/emails";

const base = { programada_para: null };

describe("renderEmail", () => {
  it("reserva_confirmada arma asunto y texto con los datos", () => {
    const r = renderEmail({
      ...base, evento: "reserva_confirmada",
      payload: { sala: "Sala Norte", edificio: "Casa Delta", fecha: "2027-11-05", hora_inicio: 10, horas: 2 },
    });
    expect(r.asunto).toContain("Sala Norte");
    expect(r.texto).toContain("Casa Delta");
    expect(r.texto).toContain("10:00");
  });

  it("evento desconocido cae al genérico", () => {
    const r = renderEmail({ ...base, evento: "algo_nuevo", payload: {} });
    expect(r.asunto).toBe("Novedades en bigote");
  });
});

describe("decidirEnvio", () => {
  const recordatorio = {
    evento: "reserva_recordatorio",
    payload: { fecha: "2027-11-05", hora_inicio: 10 },
    programada_para: "2027-11-04T13:00:00Z",
  };

  it("inmediata se envía sin mirar prefs re-chequeadas", () => {
    expect(decidirEnvio({ evento: "tarea_asignada", payload: {}, programada_para: null }, { email: false }, new Date())).toBe("enviar");
  });

  it("programada con email off se descarta", () => {
    expect(decidirEnvio(recordatorio, { email: false }, new Date("2027-11-04T13:05:00Z"))).toBe("descartar");
  });

  it("recordatorio vencido se descarta aun con email on", () => {
    expect(decidirEnvio(recordatorio, { email: true }, new Date("2027-11-05T14:00:00Z"))).toBe("descartar");
  });

  it("recordatorio vigente con email on se envía", () => {
    expect(decidirEnvio(recordatorio, { email: true }, new Date("2027-11-04T13:05:00Z"))).toBe("enviar");
  });
});

describe("encabezado del mail", () => {
  it("usa el edificio, no el nombre de la app", () => {
    const r = renderEmail({
      evento: "reserva_confirmada",
      programada_para: null,
      payload: { sala: "Sala Norte", edificio: "Casa Delta", fecha: "2026-08-20", hora_inicio: 10, horas: 2 },
    });
    // En la banda superior del HTML y en la primera línea del texto plano.
    expect(r.html).toContain("Casa Delta");
    expect(r.texto.split("\n")[0]).toBe("Casa Delta");
    expect(r.html).not.toContain(">bigote<");
  });

  it("cae al proyecto cuando el evento no tiene edificio", () => {
    const r = renderEmail({
      evento: "tarea_asignada",
      programada_para: null,
      payload: { titulo: "Cargar movimientos", proyecto: "Administración" },
    });
    expect(r.texto.split("\n")[0]).toBe("Administración");
  });

  it("el HTML no lleva estilos externos ni <style>", () => {
    const r = renderEmail({
      evento: "reserva_confirmada",
      programada_para: null,
      payload: { sala: "S", edificio: "E", fecha: "2026-08-20", hora_inicio: 10, horas: 1 },
    });
    // Gmail y Outlook los descartan: si aparecen, el mail se ve sin estilo.
    expect(r.html).not.toMatch(/<style|rel="stylesheet"/);
  });
});
