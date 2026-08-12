import type { CSSProperties } from "react";

/*
  Logo de Centro Nueva Tierra.

  El isotipo (casa, árbol, libro, gente) es una ilustración: no se puede
  redibujar fielmente a vectores a mano, así que se usa el PNG oficial
  descargado de nuevatierra.org.ar. El archivo es monocromo con canal alfa
  (se verificó: un solo color en los píxeles opacos), lo que permite usarlo
  como máscara CSS y pintarlo con `currentColor` en vez de quedar clavado al
  amarillo original. Así el mismo asset sirve sobre el chrome naranja y sobre
  fondos claros.

  El PNG trae el lockup completo (isotipo + wordmark) en 512x283. El isotipo
  ocupa x 0-184; el wordmark arranca en x 205. La máscara se recorta al
  isotipo escalando el ancho a 512/185 y anclando a la izquierda.

  El wordmark no se toma del PNG: se compone como texto real en Figtree 800,
  así queda nítido a cualquier tamaño, lo lee un screen reader y se recolorea
  solo. Las proporciones salen de medir el PNG píxel a píxel:
    - líneas del wordmark en y 88-149, 156-216, 223-282
    - altura de mayúscula 61px, paso entre líneas 67.5px
    - isotipo 185x283px, separación con el wordmark 20px
  Con altura de mayúscula ~0.71em en Figtree, 61px => 1em = 86px. De ahí:
    - leading  = 67.5/86 = 0.79
    - isotipo  = 283/86 x 185/86 = 3.3em x 2.16em
    - gap      = 20/86 = 0.23em
  Con leading 0.79 la última línea base cae a ras del borde inferior de la
  caja, así que `items-end` alinea el pie del isotipo con la base de TIERRA,
  igual que en el original.
*/

const RECORTE_ISOTIPO: CSSProperties = {
  maskImage: "url(/logo-nueva-tierra.png)",
  maskSize: "276.757% 100%",
  maskPosition: "0% 0%",
  maskRepeat: "no-repeat",
  WebkitMaskImage: "url(/logo-nueva-tierra.png)",
  WebkitMaskSize: "276.757% 100%",
  WebkitMaskPosition: "0% 0%",
  WebkitMaskRepeat: "no-repeat",
};

/** Solo el isotipo. Toma el color de `currentColor`. */
export function Isotipo({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      style={RECORTE_ISOTIPO}
      className={`inline-block h-[3.3em] w-[2.16em] shrink-0 bg-current ${className}`}
    />
  );
}

/**
 * Lockup completo: isotipo + "CENTRO NUEVA TIERRA".
 * El tamaño se controla con la font-size del contenedor (`text-[13px]`, etc.).
 * El color sale de `currentColor`, así que se ajusta con `text-*`.
 */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-end gap-[0.23em] text-[11px] ${className}`}>
      <Isotipo />
      <span className="font-extrabold uppercase leading-[0.79] tracking-[-0.025em]">
        <span className="block">Centro</span>
        <span className="block">Nueva</span>
        <span className="block">Tierra</span>
      </span>
    </span>
  );
}
