/**
 * Cascarón HTML de los mails.
 *
 * Todo va con estilos inline y tablas: Gmail y Outlook descartan `<style>` y
 * no aplican flex ni grid de forma confiable. Los colores van en hex porque
 * oklch no está soportado en clientes de mail, así que se replican a mano los
 * tokens de DESIGN.md (si cambian allá, hay que actualizarlos acá).
 */

const C = {
  marca: "#B44200",
  fondo: "#FBF4EF",
  superficie: "#FFFBF8",
  linea: "#E0D5CD",
  tinta: "#2C211B",
  tintaSuave: "#78645A",
  acento: "#BD4600",
  acentoTinta: "#FEF7F0",
} as const;

const FUENTE =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export type Detalle = { etiqueta: string; valor: string; destacado?: boolean };

export type Contenido = {
  /** Va en la banda superior. Es el edificio o el proyecto, no la app. */
  encabezado: string;
  titulo: string;
  /** Párrafos del cuerpo. */
  parrafos?: string[];
  /** Pares etiqueta/valor: fecha, sala, monto. */
  detalles?: Detalle[];
  cta?: { texto: string; url: string };
  /** Renglón al pie, para aclaraciones o instrucciones libres. */
  nota?: string;
};

function escapar(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function filaDetalle(d: Detalle): string {
  return `<tr>
    <td style="padding:6px 0;font:400 13px/1.4 ${FUENTE};color:${C.tintaSuave};white-space:nowrap;vertical-align:top">${escapar(d.etiqueta)}</td>
    <td style="padding:6px 0 6px 16px;font:${d.destacado ? "600 16px" : "400 14px"}/1.4 ${FUENTE};color:${C.tinta};text-align:right">${escapar(d.valor)}</td>
  </tr>`;
}

export function envolver(c: Contenido): string {
  const detalles = c.detalles?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="margin:20px 0;border-top:1px solid ${C.linea};border-bottom:1px solid ${C.linea}">
         ${c.detalles.map(filaDetalle).join("")}
       </table>`
    : "";

  const parrafos = (c.parrafos ?? [])
    .map(
      (p) =>
        `<p style="margin:0 0 12px;font:400 15px/1.6 ${FUENTE};color:${C.tinta}">${escapar(p)}</p>`
    )
    .join("");

  const cta = c.cta
    ? `<a href="${escapar(c.cta.url)}"
         style="display:inline-block;margin-top:8px;padding:12px 20px;border-radius:8px;
                background:${C.acento};color:${C.acentoTinta};text-decoration:none;
                font:600 15px/1 ${FUENTE}">${escapar(c.cta.texto)}</a>`
    : "";

  const nota = c.nota
    ? `<p style="margin:20px 0 0;font:400 13px/1.5 ${FUENTE};color:${C.tintaSuave}">${escapar(c.nota)}</p>`
    : "";

  return `<!doctype html>
<html lang="es-AR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapar(c.titulo)}</title></head>
<body style="margin:0;padding:0;background:${C.fondo}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.fondo}">
<tr><td align="center" style="padding:24px 12px">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="max-width:560px;border:1px solid ${C.linea};border-radius:12px;overflow:hidden;background:${C.superficie}">

    <tr><td style="background:${C.marca};padding:18px 24px">
      <span style="font:700 15px/1.2 ${FUENTE};color:${C.acentoTinta};letter-spacing:.01em">
        ${escapar(c.encabezado)}
      </span>
    </td></tr>

    <tr><td style="padding:24px">
      <h1 style="margin:0 0 14px;font:600 21px/1.3 ${FUENTE};color:${C.tinta}">${escapar(c.titulo)}</h1>
      ${parrafos}
      ${detalles}
      ${cta}
      ${nota}
    </td></tr>

  </table>

  <p style="margin:16px 0 0;font:400 12px/1.4 ${FUENTE};color:${C.tintaSuave}">
    Te llega porque tenés avisos activados en bigote.
  </p>

</td></tr>
</table>
</body></html>`;
}

/**
 * Versión de texto plano, para clientes que no muestran HTML.
 *
 * Arranca con el encabezado: en el HTML es la banda superior, y sin él el texto
 * perdería el contexto (de qué edificio o proyecto habla el aviso).
 */
export function aTexto(c: Contenido): string {
  const partes = [c.encabezado, "", c.titulo, ""];
  if (c.parrafos?.length) partes.push(...c.parrafos, "");
  if (c.detalles?.length) {
    partes.push(...c.detalles.map((d) => `${d.etiqueta}: ${d.valor}`), "");
  }
  if (c.cta) partes.push(`${c.cta.texto}: ${c.cta.url}`, "");
  if (c.nota) partes.push(c.nota);
  return partes.join("\n").trim();
}
