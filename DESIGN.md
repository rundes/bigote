# Design

Seed pre-implementación (27-jul-2026). Regenerar con `/impeccable document` cuando exista código con tokens reales.

## Theme

Claro, cálido, alto contraste. Un solo tema en v1; respetar `prefers-reduced-motion`.

## Color

OKLCH. Neutros entintados hacia el ámbar (hue ~75), nunca #fff ni #000.

- `--bg`: oklch(0.97 0.008 75) — papel cálido, fondo general
- `--bg-panel`: oklch(0.94 0.01 75) — sidebar, barras, paneles (segunda capa neutra)
- `--surface`: oklch(0.99 0.005 75) — superficies elevadas (sheets, popovers)
- `--ink`: oklch(0.25 0.015 60) — texto principal
- `--ink-muted`: oklch(0.48 0.02 60) — texto secundario
- `--line`: oklch(0.88 0.012 75) — bordes 1px
- `--accent`: oklch(0.58 0.13 45) — terracota; acciones primarias, selección, foco. ≤10% de la superficie
- `--accent-ink`: oklch(0.99 0.005 75) — texto sobre accent
- `--ok`: oklch(0.55 0.12 150) — ingresos, éxito
- `--danger`: oklch(0.55 0.16 25) — egresos, errores, cancelar
- `--warn`: oklch(0.7 0.12 85) — avisos

Estados: hover = mezcla 6% de ink sobre el fondo; disabled = 45% de opacidad en contenido, nunca accent saturado en inactivos.

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

- Botón primario: fondo `--accent`, texto `--accent-ink`, 40 px alto (44 en flujos táctiles). Secundario: borde `--line`, fondo transparente. Todos con default/hover/focus/active/disabled/loading.
- Inputs: fondo `--surface`, borde `--line`, foco con anillo `--accent`. Labels arriba, 13 px `--ink-muted`.
- Chips (filtros de ámbito, período, edificio, sala): píldora 32 px, seleccionada con fondo accent al 12% + texto accent.
- Pips de dificultad: ●●●○○ en `--ink-muted`/`--accent`.
- Sheet inferior (mobile) para forms de reserva y movimiento; en desktop, panel lateral. Modales solo para confirmaciones destructivas.
- Skeletons con la forma del contenido. Toasts breves abajo con undo.
- Íconos: Lucide, 20 px, stroke 1.75.

## Motion

150–250 ms, ease-out-quart. Solo estado: aparecer, completar, undo, cambio de org. Sin animación de propiedades de layout; sin coreografías de carga.
