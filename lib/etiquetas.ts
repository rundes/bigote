import QRCode from "qrcode";
import type { DatosEtiqueta, EtiquetaRenderizada } from "@/lib/etiquetas-formatos";

// Las specs viven aparte para que el selector (componente cliente) no arrastre
// `qrcode` al bundle del navegador.
export * from "@/lib/etiquetas-formatos";

/**
 * El QR guarda solo `/q/<codigo>`. Corto importa: menos datos, módulos más
 * grandes, y una etiqueta de 20 mm arrugada sobre un cable se sigue leyendo.
 */
export function urlDeCodigo(codigo: string, base: string): string {
  return `${base.replace(/\/$/, "")}/q/${codigo}`;
}

export async function renderizarEtiquetas(
  datos: DatosEtiqueta[],
  base: string
): Promise<EtiquetaRenderizada[]> {
  return Promise.all(
    datos.map(async (d) => ({
      ...d,
      qrSvg: await QRCode.toString(urlDeCodigo(d.codigo, base), {
        type: "svg",
        margin: 0,
        // M tolera ~15% de daño: suficiente para una etiqueta pegada y rozada,
        // sin inflar la densidad como haría Q o H.
        errorCorrectionLevel: "M",
      }),
    }))
  );
}
