// Templates de texto y decisiones de envío. Puro: sin red ni DB, para
// testear sin mocks. El dispatcher (route handler) orquesta alrededor.

const APP_URL = "https://bigote-gilt.vercel.app";

export type NotificacionEmail = {
  evento: string;
  payload: Record<string, unknown>;
  programada_para: string | null;
};

export type PrefsEmail = { email: boolean };

function fechaLegible(fecha: unknown, hora: unknown): string {
  const d = new Date(`${fecha}T00:00:00-03:00`);
  const dia = d.toLocaleDateString("es-AR", {
    weekday: "long", day: "numeric", month: "numeric", timeZone: "America/Argentina/Buenos_Aires",
  });
  return `${dia} a las ${hora}:00`;
}

export function renderEmail(n: NotificacionEmail): { asunto: string; texto: string } {
  const p = n.payload;
  switch (n.evento) {
    case "reserva_confirmada":
      return {
        asunto: `Reserva confirmada: ${p.sala}`,
        texto: `Reservaste ${p.sala} (${p.edificio}) el ${fechaLegible(p.fecha, p.hora_inicio)}, ${p.horas} h.\n\nVer tus reservas: ${APP_URL}`,
      };
    case "reserva_recordatorio":
      return {
        asunto: `Mañana: ${p.sala} a las ${p.hora_inicio}:00`,
        texto: `Te esperamos mañana en ${p.sala} (${p.edificio}) a las ${p.hora_inicio}:00, ${p.horas} h.\n\nSi no vas a ir, cancelá la reserva: ${APP_URL}`,
      };
    case "reserva_cancelada": {
      const motivo = p.motivo ? `\nMotivo: ${p.motivo}` : "";
      return {
        asunto: `Reserva cancelada: ${p.sala}`,
        texto: `Se canceló la reserva de ${p.sala} (${p.edificio}) del ${fechaLegible(p.fecha, p.hora_inicio)}.${motivo}\n\nVer disponibilidad: ${APP_URL}`,
      };
    }
    case "tarea_asignada":
      return {
        asunto: `Tarea nueva en ${p.proyecto}`,
        texto: `Te asignaron "${p.titulo}" en ${p.proyecto}.\n\nTomala o mirala: ${APP_URL}`,
      };
    case "tarea_hecha":
      return {
        asunto: `Hecha: ${p.titulo}`,
        texto: `"${p.titulo}" (${p.proyecto}) quedó marcada como hecha.\n\nVer el proyecto: ${APP_URL}`,
      };
    case "reserva_esperando_pago": {
      // Los datos de la cuenta vienen congelados en el payload (migración 0014):
      // si mañana cambia el alias, este mail sigue coincidiendo con lo enviado.
      const cuenta = [
        p.alias ? `Alias: ${p.alias}` : "",
        p.cbu ? `CBU: ${p.cbu}` : "",
        p.titular ? `Titular: ${p.titular}` : "",
        p.banco ? `Banco: ${p.banco}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const vence = p.vence_at
        ? new Date(String(p.vence_at)).toLocaleString("es-AR", {
            timeZone: "America/Argentina/Buenos_Aires",
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })
        : null;
      const extra = p.instrucciones ? `\n\n${p.instrucciones}` : "";
      return {
        asunto: `Reservá con pago: ${p.sala}`,
        texto:
          `Guardamos ${p.sala} (${p.edificio}) para el ${fechaLegible(p.fecha, p.hora_inicio)}, ${p.horas} h.\n\n` +
          `Para confirmarla, transferí $${p.costo}:\n\n${cuenta}\n\n` +
          (vence ? `El horario queda reservado hasta el ${vence}. Pasado ese plazo se libera.` : "") +
          `${extra}\n\nVer la reserva: ${APP_URL}`,
      };
    }
    case "reserva_vencida":
      return {
        asunto: `Se liberó tu reserva: ${p.sala}`,
        texto: `No llegamos a registrar el pago, así que se liberó ${p.sala} (${p.edificio}) del ${fechaLegible(p.fecha, p.hora_inicio)}.\n\nSi todavía la querés, reservá de nuevo: ${APP_URL}`,
      };
    case "pago_registrado":
      return {
        asunto: `Pago registrado: ${p.sala}`,
        texto: `Recibimos el pago y tu reserva de ${p.sala} quedó confirmada.\n\nVer tus reservas: ${APP_URL}`,
      };
    default:
      return {
        asunto: "Novedades en bigote",
        texto: `Tenés novedades en tu organización.\n\nEntrá: ${APP_URL}`,
      };
  }
}

// Spec §13: las preferencias se congelan al encolar; para filas programadas
// (recordatorios) hay que re-chequear antes de enviar. Además, un
// recordatorio cuyo turno ya empezó no se manda.
export function decidirEnvio(
  n: NotificacionEmail,
  prefs: PrefsEmail,
  ahora: Date
): "enviar" | "descartar" {
  if (n.programada_para !== null) {
    if (!prefs.email) return "descartar";
    if (n.evento === "reserva_recordatorio") {
      const p = n.payload;
      const inicio = new Date(`${p.fecha}T${String(p.hora_inicio).padStart(2, "0")}:00:00-03:00`);
      if (ahora >= inicio) return "descartar";
    }
  }
  return "enviar";
}
