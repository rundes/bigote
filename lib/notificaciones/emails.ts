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
