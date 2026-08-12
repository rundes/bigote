import {
  BANDERITA,
  FORMATOS,
  type EtiquetaRenderizada,
  type FormatoEtiqueta,
} from "@/lib/etiquetas-formatos";

/*
  Hoja A4 lista para imprimir. Sin librería de PDF: el navegador ya sabe paginar
  A4 con `@page`, muestra vista previa antes de gastar hoja y da "Guardar como
  PDF" gratis.

  Las medidas van en mm porque el resultado es físico: una etiqueta que en
  pantalla se ve bien pero mide 34 mm no envuelve el cable.
*/

function Qr({ svg, mm }: { svg: string; mm: number }) {
  return (
    <span
      aria-hidden="true"
      className="block shrink-0"
      style={{ width: `${mm}mm`, height: `${mm}mm` }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function Celda({
  etiqueta,
  formato,
}: {
  etiqueta: EtiquetaRenderizada;
  formato: FormatoEtiqueta;
}) {
  const spec = FORMATOS[formato];

  if (formato === "banderita") {
    return (
      <div
        className="flex items-stretch border border-dashed border-[#bbb]"
        style={{ width: `${spec.anchoCelda}mm`, height: `${spec.altoCelda}mm` }}
      >
        {/* Se envuelve alrededor del cable; va vacío para que el pegamento agarre */}
        <div
          className="flex items-center justify-center border-r border-dotted border-[#ccc]"
          style={{ width: `${BANDERITA.envolver}mm` }}
        >
          <span className="text-[4pt] tracking-widest text-[#999]">ENVOLVER</span>
        </div>
        {/* Cara visible: QR al costado del nombre, no debajo — la banderita es ancha y baja */}
        <div
          className="flex items-center gap-[1mm] px-[1mm]"
          style={{ width: `${BANDERITA.cara}mm` }}
        >
          <Qr svg={etiqueta.qrSvg} mm={spec.qrMm} />
          <span className="min-w-0 leading-[1.1]">
            <span className="block truncate text-[6pt] font-semibold">{etiqueta.nombre}</span>
            <span className="block font-mono text-[5pt] text-[#555]">{etiqueta.codigo}</span>
          </span>
        </div>
        <div
          className="border-l border-dotted border-[#ccc]"
          style={{ width: `${BANDERITA.reverso}mm` }}
        />
      </div>
    );
  }

  const esGrande = formato === "grande";
  return (
    <div
      className="flex flex-col items-center justify-center gap-[1.5mm] border border-dashed border-[#bbb] px-[2mm] text-center"
      style={{ width: `${spec.anchoCelda}mm`, height: `${spec.altoCelda}mm` }}
    >
      <Qr svg={etiqueta.qrSvg} mm={spec.qrMm} />
      <span className="w-full leading-[1.15]">
        <span
          className={`block font-semibold ${esGrande ? "text-[11pt]" : "text-[7pt]"}`}
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {etiqueta.nombre}
        </span>
        {esGrande && etiqueta.destinatario && (
          <span className="mt-[1mm] block text-[9pt]">→ {etiqueta.destinatario}</span>
        )}
        {esGrande && etiqueta.cantidad != null && (
          <span className="block text-[8pt] text-[#555]">
            {etiqueta.cantidad} {etiqueta.cantidad === 1 ? "unidad" : "unidades"}
          </span>
        )}
        <span className={`block font-mono text-[#555] ${esGrande ? "text-[8pt]" : "text-[5.5pt]"}`}>
          {etiqueta.codigo}
        </span>
      </span>
    </div>
  );
}

export function HojaEtiquetas({
  etiquetas,
  formato,
}: {
  etiquetas: EtiquetaRenderizada[];
  formato: FormatoEtiqueta;
}) {
  const spec = FORMATOS[formato];
  const porHoja = spec.porHoja;
  const hojas: EtiquetaRenderizada[][] = [];
  for (let i = 0; i < etiquetas.length; i += porHoja) {
    hojas.push(etiquetas.slice(i, i + porHoja));
  }

  return (
    <>
      <style>{`
        @page { size: A4; margin: 10mm; }
        @media print {
          .no-imprimir { display: none !important; }
          html, body { background: #fff; }
        }
        .hoja-etiquetas { break-after: page; }
        .hoja-etiquetas:last-child { break-after: auto; }
        .celda-etiqueta { break-inside: avoid; }
      `}</style>

      {hojas.map((hoja, i) => (
        <div
          key={i}
          className="hoja-etiquetas mx-auto grid bg-white text-black"
          style={{
            width: "190mm",
            gridTemplateColumns: `repeat(${spec.columnas}, ${spec.anchoCelda}mm)`,
          }}
        >
          {hoja.map((e) => (
            <div key={e.codigo} className="celda-etiqueta">
              <Celda etiqueta={e} formato={formato} />
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
