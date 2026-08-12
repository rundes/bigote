# Design

Alineado con los tokens reales de `app/globals.css` (11-ago-2026), tras adoptar
la identidad de Centro Nueva Tierra.

## Theme

Claro, cálido, alto contraste. Un solo tema en v1; respetar `prefers-reduced-motion`.

## Color

Derivada de la identidad de Centro Nueva Tierra (nuevatierra.org.ar). OKLCH,
nunca #fff ni #000. Los tokens viven en `app/globals.css` bajo `@theme`, así
que se consumen como clases Tailwind (`bg-fondo`, `text-tinta`, `bg-acento`).

Institucional crudo: naranja `#FF6000`, amarillo `#F1F205`, tinta `#333333`.
Ninguno se usa tal cual para texto o superficies: blanco sobre `#FF6000` da
3.03:1 y el amarillo sobre blanco 1.1:1, y este proyecto exige WCAG AA. El
naranja se oscurece para acción y chrome; el amarillo queda como señal de
estado y para el lockup, donde SC 1.4.11 exime a los logotipos.

Neutros (entintados hacia el naranja, hue 58):

- `--color-fondo`: oklch(0.97 0.01 58) — papel cálido, fondo general
- `--color-panel`: oklch(0.945 0.014 58) — segunda capa neutra
- `--color-superficie`: oklch(0.99 0.006 58) — sheets, popovers
- `--color-linea`: oklch(0.88 0.016 58) — bordes 1px
- `--color-tinta`: oklch(0.26 0.02 50) — texto principal
- `--color-tinta-suave`: oklch(0.52 0.03 50) — texto secundario

Acción:

- `--color-acento`: oklch(0.55 0.166 42) — naranja institucional oscurecido a AA; acciones primarias, selección, foco
- `--color-acento-tinta`: oklch(0.98 0.012 70) — texto sobre acento

Chrome de marca (sidebar, barra superior, nav inferior):

- `--color-marca`: oklch(0.53 0.16 42) — fondo del chrome
- `--color-marca-tinta`: oklch(0.98 0.012 70) — texto principal sobre chrome
- `--color-marca-suave`: oklch(0.94 0.044 70) — texto secundario e ítems inactivos
- `--color-marca-linea`: oklch(0.62 0.15 42) — divisor decorativo sobre chrome
- `--color-amarillo`: oklch(0.925 0.185 106) — amarillo institucional; **única** señal de ítem activo
- `--color-marca-pura`: oklch(0.66 0.21 42) — el `#FF6000` exacto; solo detrás del lockup

Semánticos:

- `--color-ok`: oklch(0.52 0.13 150) — ingresos, éxito
- `--color-peligro`: oklch(0.56 0.19 12) — egresos, errores, cancelar
- `--color-aviso`: oklch(0.54 0.112 80) — avisos

`peligro` se corrió a hue 12 (antes 25) para separarlo 30° del naranja de
acción: en finanzas un egreso en rojo aparece al lado de un botón primario y
no pueden leerse como el mismo color.

Contraste: los 17 pares en uso están verificados ≥ 4.7:1 y dentro de gamut
sRGB. Al tocar un token, revalidar antes de commitear — el script que hace la
conversión OKLCH→sRGB y el cálculo WCAG está en el historial de esta tarea.

Reparto: el chrome ocupa ~22% de la superficie (registro *committed* en una
sola superficie, que el registro `product` permite); el contenido se mantiene
neutro y el acento ahí no pasa del 10%.

Estados: hover sobre chrome = `marca-tinta` al 12%; hover en contenido =
mezcla 6% de tinta sobre el fondo; disabled = 45% de opacidad, nunca acento
saturado en inactivos.

## Marca

- Logo: `componentes/marca/Logo.tsx`, exporta `<Logo>` (lockup completo) e `<Isotipo>` (solo el ícono, para mobile).
- El isotipo es una ilustración: sale del PNG oficial (`public/logo-nueva-tierra.png`). Es monocromo con alfa, así que se aplica como máscara CSS y se pinta con `currentColor` — recolorea con `text-*` en vez de quedar clavado al amarillo.
- El wordmark **no** sale del PNG: es texto real en Figtree 800, versalitas, leading 0.79, tracking −0.025em. Nítido a cualquier tamaño y legible por screen reader.
- Tamaño por `font-size` del contenedor: `text-[11px]` en chrome, `text-[28px]` como encabezado del ingreso.
- Lockup canónico: amarillo sobre naranja. Sobre fondo claro, usar `text-marca`.

## Typography

- Familia única: Figtree (Google Fonts), fallback `system-ui, sans-serif`.
- Escala fija rem, ratio 1.2: 12 / 14 (base UI) / 17 / 20 / 24 / 29.
- Cuerpo de lectura 15–16 px, máx 70ch. Datos densos pueden ir a 13–14 px.
- Montos y horas: `font-variant-numeric: tabular-nums`. Balance del mes: 29 px semibold.
- Jerarquía por peso (400/500/650), no por mayúsculas. Nada de display fonts en labels.

## Spacing & Layout

- Escala 4px. Padding de pantalla: 16 mobile, 24 desktop. Secciones separadas por 32–40, no por cards.
- Contenido máx 1100 px en desktop. Sidebar 240 px.
- Bordes redondeados: 8 px controles, 12 px sheets/paneles. Sombras mínimas (solo superficies flotantes).
- Listas como filas con separadores `--line`, no grids de cards idénticas. Prohibido: side-stripe borders, gradient text, glassmorphism, hero-metrics.

## Components

- Chrome (sidebar, barra superior, nav inferior): fondo `--color-marca`. Ítem activo = amarillo institucional, siempre: píldora `bg-amarillo` con `text-tinta` donde hay lugar (sidebar), barra superior amarilla + ícono y label en amarillo donde no lo hay (nav inferior). Inactivo `--color-marca-suave`. Sin bordes: las capas se separan por color, no por línea.
- Botón primario: fondo `--color-acento`, texto `--color-acento-tinta`, 40 px alto (44 en flujos táctiles). Secundario: borde `--color-linea`, fondo transparente. Todos con default/hover/focus/active/disabled/loading.
- Inputs: fondo `--color-superficie`, borde `--color-linea`, foco con anillo `--color-acento`. Labels arriba, 13 px `--color-tinta-suave`.
- Chips (filtros de ámbito, período, edificio, sala): píldora 32 px, seleccionada con fondo acento al 12% + texto acento.
- Pips de dificultad: ●●●○○ en `--color-tinta-suave`/`--color-acento`.
- Ingreso: una sola tarjeta, con el lockup sobre `--color-marca-pura` como encabezado. `FormIngreso` no lleva tarjeta propia — anidar tarjetas está prohibido.
- Sheet inferior (mobile) para forms de reserva y movimiento; en desktop, panel lateral. Modales solo para confirmaciones destructivas.
- Skeletons con la forma del contenido. Toasts breves abajo con undo.
- Íconos: Lucide, 20 px, stroke 1.75.

## Motion

150–250 ms, ease-out-quart. Solo estado: aparecer, completar, undo, cambio de org. Sin animación de propiedades de layout; sin coreografías de carga.
