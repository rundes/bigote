import { envolver, aTexto, type Contenido, type Detalle } from "./plantilla";

// Templates y decisiones de envío. Puro: sin red ni DB, para
// testear sin mocks. El dispatcher (route handler) orquesta alrededor.

// Del entorno, no hardcodeada: la URL ya quedó obsoleta una vez al cambiar el
// dominio de Vercel, y los links de los mails apuntaron a un 404 sin que nada
// avisara. El default es solo para tests, donde no hay env.
const APP_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://nuevatierra.vercel.app";

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

export function renderEmail(
  n: NotificacionEmail
): { asunto: string; texto: string; html: string } {
  const c = contenidoDe(n);
  return { asunto: c.asunto, texto: aTexto(c.cuerpo), html: envolver(c.cuerpo) };
}

/**
 * El encabezado del mail es el contexto de la persona, no el nombre de la app:
 * quien recibe un aviso de reserva piensa en el edificio, y quien recibe uno de
 * tarea piensa en el proyecto. "bigote" solo aparece si no hay ninguno.
 */
function encabezadoDe(p: Record<string, unknown>): string {
  return String(p.edificio || p.proyecto || "bigote");
}

function contenidoDe(n: NotificacionEmail): { asunto: string; cuerpo: Contenido } {
  const p = n.payload;
  const cab = encabezadoDe(p);
  const sala = String(p.sala ?? "");
  const cuando = p.fecha ? fechaLegible(p.fecha, p.hora_inicio) : "";
  const horas = p.horas ? `${p.horas} h` : "";

  switch (n.evento) {
    case "reserva_confirmada":
      return {
        asunto: `Reserva confirmada: ${sala}`,
        cuerpo: {
          encabezado: cab,
          titulo: "Tu reserva está confirmada",
          detalles: [
            { etiqueta: "Sala", valor: sala },
            { etiqueta: "Cuándo", valor: cuando, destacado: true },
            { etiqueta: "Duración", valor: horas },
          ],
          cta: { texto: "Ver mis reservas", url: APP_URL },
        },
      };

    case "reserva_recordatorio":
      return {
        asunto: `Mañana: ${sala} a las ${p.hora_inicio}:00`,
        cuerpo: {
          encabezado: cab,
          titulo: `Mañana a las ${p.hora_inicio}:00`,
          parrafos: [`Te esperamos en ${sala}.`],
          detalles: [
            { etiqueta: "Sala", valor: sala },
            { etiqueta: "Duración", valor: horas },
          ],
          cta: { texto: "Ver la reserva", url: APP_URL },
          nota: "Si no vas a poder ir, cancelala así el horario queda libre para otra persona.",
        },
      };

    case "reserva_cancelada":
      return {
        asunto: `Reserva cancelada: ${sala}`,
        cuerpo: {
          encabezado: cab,
          titulo: "Se canceló una reserva",
          detalles: [
            { etiqueta: "Sala", valor: sala },
            { etiqueta: "Era", valor: cuando },
            ...(p.motivo ? [{ etiqueta: "Motivo", valor: String(p.motivo) }] : []),
          ],
          cta: { texto: "Ver disponibilidad", url: APP_URL },
        },
      };

    case "reserva_esperando_pago": {
      const cuenta: Detalle[] = [];
      if (p.alias) cuenta.push({ etiqueta: "Alias", valor: String(p.alias), destacado: true });
      if (p.cbu) cuenta.push({ etiqueta: "CBU", valor: String(p.cbu) });
      if (p.titular) cuenta.push({ etiqueta: "Titular", valor: String(p.titular) });
      if (p.banco) cuenta.push({ etiqueta: "Banco", valor: String(p.banco) });

      const vence = p.vence_at
        ? new Date(String(p.vence_at)).toLocaleString("es-AR", {
            timeZone: "America/Argentina/Buenos_Aires",
            day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
          })
        : null;

      return {
        asunto: `Falta el pago para confirmar: ${sala}`,
        cuerpo: {
          encabezado: cab,
          titulo: "Falta el pago para confirmar",
          parrafos: [
            `Guardamos ${sala} para el ${cuando}${horas ? `, ${horas}` : ""}.`,
            "Para confirmarla, transferí a esta cuenta:",
          ],
          detalles: [
            ...cuenta,
            { etiqueta: "Monto", valor: `$${p.costo}`, destacado: true },
          ],
          cta: { texto: "Ver la reserva", url: APP_URL },
          nota: [
            vence ? `El horario queda reservado hasta el ${vence}; pasado ese plazo se libera.` : "",
            String(p.instrucciones ?? ""),
          ].filter(Boolean).join(" "),
        },
      };
    }

    case "reserva_vencida":
      return {
        asunto: `Se liberó tu reserva: ${sala}`,
        cuerpo: {
          encabezado: cab,
          titulo: "Se liberó tu reserva",
          parrafos: [
            `No llegamos a registrar el pago, así que ${sala} volvió a quedar disponible.`,
          ],
          detalles: [{ etiqueta: "Era", valor: cuando }],
          cta: { texto: "Reservar de nuevo", url: APP_URL },
        },
      };

    case "pago_registrado":
      return {
        asunto: `Pago registrado: ${sala}`,
        cuerpo: {
          encabezado: cab,
          titulo: "Recibimos el pago",
          parrafos: [`Tu reserva de ${sala} quedó confirmada.`],
          detalles: [{ etiqueta: "Cuándo", valor: cuando, destacado: true }],
          cta: { texto: "Ver mis reservas", url: APP_URL },
        },
      };

    case "tarea_asignada":
      return {
        asunto: `Tarea nueva en ${p.proyecto}`,
        cuerpo: {
          encabezado: cab,
          titulo: "Te asignaron una tarea",
          detalles: [
            { etiqueta: "Tarea", valor: String(p.titulo), destacado: true },
            { etiqueta: "Proyecto", valor: String(p.proyecto) },
          ],
          cta: { texto: "Ver la tarea", url: APP_URL },
        },
      };

    case "tarea_hecha":
      return {
        asunto: `Hecha: ${p.titulo}`,
        cuerpo: {
          encabezado: cab,
          titulo: "Tarea completada",
          detalles: [
            { etiqueta: "Tarea", valor: String(p.titulo) },
            { etiqueta: "Proyecto", valor: String(p.proyecto) },
          ],
          cta: { texto: "Ver el proyecto", url: APP_URL },
        },
      };

    default:
      return {
        asunto: "Novedades en bigote",
        cuerpo: {
          encabezado: cab,
          titulo: "Tenés novedades",
          parrafos: ["Entrá a la app para verlas."],
          cta: { texto: "Abrir bigote", url: APP_URL },
        },
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
