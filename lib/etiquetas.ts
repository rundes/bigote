import QRCode from "qrcode";

/**
 * Formatos de etiqueta sobre A4 (210 × 297 mm) con margen de 10 mm, útil
 * 190 × 277 mm. Papel común: se imprime, se corta y el pegamento lo pone quien
 * etiqueta. Medidas del spec 2026-08-11-inventario-qr-design.md §5.
 */
export type FormatoEtiqueta = "chica" | "mediana" | "grande" | "banderita";

export type SpecFormato = {
  id: FormatoEtiqueta;
  etiqueta: string;
  descripcion: string;
  columnas: number;
  filas: number;
  /** mm */
  anchoCelda: number;
  altoCelda: number;
  qrMm: number;
  porHoja: number;
};

export const FORMATOS: Record<FormatoEtiqueta, SpecFormato> = {
  chica: {
    id: "chica",
    etiqueta: "Chica",
    descripcion: "Libros y cosas chicas",
    columnas: 5,
    filas: 6,
    anchoCelda: 38,
    altoCelda: 46.16,
    qrMm: 25,
    porHoja: 30,
  },
  mediana: {
    id: "mediana",
    etiqueta: "Mediana",
    descripcion: "Equipamiento y mobiliario",
    columnas: 4,
    filas: 4,
    anchoCelda: 47.5,
    altoCelda: 69.25,
    qrMm: 35,
    porHoja: 16,
  },
  grande: {
    id: "grande",
    etiqueta: "Grande",
    descripcion: "Cajas y paquetes, con destinatario",
    columnas: 2,
    filas: 3,
    anchoCelda: 95,
    altoCelda: 92.33,
    qrMm: 60,
    porHoja: 6,
  },
  banderita: {
    id: "banderita",
    etiqueta: "Banderita",
    descripcion: "Cables: se envuelve y se pega sobre sí misma",
    columnas: 2,
    filas: 11,
    anchoCelda: 95,
    altoCelda: 25.18,
    qrMm: 20,
    porHoja: 22,
  },
};

/** Segmentos de la banderita, en mm. Suman el ancho de celda (95). */
export const BANDERITA = { envolver: 30, cara: 32.5, reverso: 32.5 };

export type DatosEtiqueta = {
  codigo: string;
  nombre: string;
  /** Solo en formato grande: a quién va el paquete. */
  destinatario?: string;
  /** Solo en formato grande: cuántas unidades lleva. */
  cantidad?: number;
};

export type EtiquetaRenderizada = DatosEtiqueta & { qrSvg: string };

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
