/**
 * Formato de fechas para toda la app. Vive aparte porque tareas, finanzas y
 * espacios formateaban lo mismo de tres maneras distintas.
 *
 * Las fechas de la base son `date` (YYYY-MM-DD), sin hora. Construirlas con
 * `new Date("2026-08-12")` las interpreta en UTC y en Argentina (UTC-3) caen un
 * día antes; por eso todas se arman con hora del mediodía local.
 */

const TZ = "America/Argentina/Buenos_Aires";

export function fechaLocal(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

export function hoyISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** "12/08" o "12/08/26" si cae en otro año. */
export function fechaCorta(iso: string): string {
  const d = fechaLocal(iso);
  const esteAno = hoyISO().slice(0, 4);
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    ...(iso.slice(0, 4) === esteAno ? {} : { year: "2-digit" }),
  });
}

/** "mar 12/08" — el día de la semana ayuda a ubicarse en una agenda. */
export function fechaConDia(iso: string): string {
  return fechaLocal(iso).toLocaleDateString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

export type Urgencia = "vencida" | "hoy" | "manana" | "proxima" | "lejana";

/**
 * Distancia de una fecha estimada respecto de hoy. Se compara sobre strings
 * YYYY-MM-DD, que ordenan lexicográficamente igual que cronológicamente y
 * evitan cualquier aritmética de husos.
 */
export function urgenciaDe(iso: string | null): Urgencia | null {
  if (!iso) return null;
  const hoy = hoyISO();
  if (iso < hoy) return "vencida";
  if (iso === hoy) return "hoy";

  const manana = new Date(fechaLocal(hoy).getTime() + 86_400_000);
  const mananaISO = `${manana.getFullYear()}-${String(manana.getMonth() + 1).padStart(2, "0")}-${String(manana.getDate()).padStart(2, "0")}`;
  if (iso === mananaISO) return "manana";

  const dias = Math.round(
    (fechaLocal(iso).getTime() - fechaLocal(hoy).getTime()) / 86_400_000
  );
  return dias <= 7 ? "proxima" : "lejana";
}

export function etiquetaUrgencia(iso: string): string {
  switch (urgenciaDe(iso)) {
    case "vencida":
      return `Venció ${fechaCorta(iso)}`;
    case "hoy":
      return "Para hoy";
    case "manana":
      return "Para mañana";
    default:
      return `Para el ${fechaCorta(iso)}`;
  }
}

/** Clase de color según urgencia. Solo vencida y hoy se destacan. */
export function claseUrgencia(iso: string): string {
  switch (urgenciaDe(iso)) {
    case "vencida":
      return "text-peligro font-medium";
    case "hoy":
      return "text-acento font-medium";
    default:
      return "text-tinta-suave";
  }
}
