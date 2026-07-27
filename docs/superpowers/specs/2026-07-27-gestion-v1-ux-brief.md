# Brief de UX — bigote v1

Confirmado el 27-jul-2026. Guía toda la implementación de UI. Complementa `PRODUCT.md` (estrategia) y `DESIGN.md` (tokens visuales).

## 1. Resumen

App de trabajo diaria para organizaciones de 3–10 personas: proyectos/tareas con track record, finanzas con ámbitos y reservas de salas en edificios (propios o co-gestionados). Un usuario puede pertenecer a varias organizaciones (switcher). Mobile-first real: los flujos críticos (tomar tarea, reservar sala, cargar gasto) se completan con una mano en 380 px.

## 2. Acción primaria por pantalla

| Pantalla | Acción primaria |
|---|---|
| Hoy (inicio) | Ver de un vistazo: mis tareas, mis reservas, reservas de hoy, balance del mes (según permisos) |
| Proyecto | Tomar tarea del pool ("Tomala") / marcar hecha |
| Mis tareas | Marcar hecha |
| Espacios | Reservar una franja libre |
| Detalle de sala | Ver galería/descripción y reservar |
| Finanzas | Cargar un movimiento |
| Equipo | Ver track record de una persona |

## 3. Dirección de diseño

- **Registro:** product. **Estrategia de color: Restrained cálido.** Neutros entintados al ámbar/terracota (fondo tipo papel cálido, nunca #fff ni gris puro), un acento terracota para acciones primarias y selección (≤10% de superficie). Verde/rojo semánticos solo para ingreso/egreso y estados. Nada de azul-admin por reflejo de categoría.
- **Escena → tema claro:** persona del equipo parada en la recepción del coworking a media mañana con luz natural, celular en mano, reservando una sala para alguien que espera enfrente.
- **Tipografía:** una sola familia humanista (Figtree o Instrument Sans, fallback system-ui), escala fija rem ratio 1.2, `tabular-nums` en montos y grilla horaria.
- **Anclas:** Basecamp (calidez y copy humano), Notion (superficie clara y tranquila), Linear (fluidez al tomar/completar tareas).
- **Anti-referencias:** planilla de Excel (tablas grises sin jerarquía); dashboard SaaS de template (cards idénticas, hero-metrics con gradiente).

## 4. Alcance

Production-ready, superficie completa (auth + shell + 4 módulos + plataforma), calidad de envío, por fases del spec.

## 5. Layout

**Shell**
- Mobile: barra inferior filtrada por permisos: Hoy · Tareas · Espacios · Finanzas · Más. Switcher de organización en la barra superior (nombre de la org, tap → lista).
- Desktop (≥1024): sidebar izquierda, switcher de org arriba; contenido máx ~1100 px.
- Cambiar de org recarga todo el contexto.

**Hoy:** secciones apiladas sin cards anidadas: "Tus tareas" (3–5 + link), "Tus reservas" (próximas propias), "Hoy en las salas" (lista horaria del día), "Este mes" (balance en línea tipográfica grande, solo con `finanzas`).

**Tareas/Proyectos:** lista de proyectos → detalle con "Pool" y "Asignadas". Fila de tarea: título, dificultad en pips (●●●○○), botón "Tomala" / "Marcá hecha". Sin kanban en v1.

**Espacios (el problema difícil en 380 px)**
- Mobile: chips de edificio (con foto de portada; badge sutil "co-gestión" en ajenos) → chips de sala → columna vertical de franjas 8–22: libre (tap → reservar) / ocupada (nombre, tap → detalle/cancelar).
- Desktop: grilla salas × horas del edificio elegido; tap en celda libre reserva.
- Detalle de sala: galería swipeable (fotos/video) + descripción.
- Form de reserva (sheet inferior en mobile, no modal): fecha/hora precargadas, toggle "Para mí / Para otra persona" (tercero → autocompletado de clientes, alta al vuelo), plan, duración, **costo visible antes de confirmar**.

**Finanzas:** navegación de mes ←/→, chips de ámbito (Todo · Entidad · [edificios]), tres números en línea (ingresos/egresos/balance, jerarquía por peso tipográfico), lista de movimientos por día. Movimientos de reserva: ícono distintivo, sin edición, link a la reserva. Botón fijo "Cargar movimiento".

**Track record:** en Equipo, por persona: completadas, dificultad acumulada, promedio; chips de período y proyecto. Solo con `equipo`.

**Plataforma** (super-admin): lista de orgs + "Creá una organización" (nombre, tipo, email del primer admin). Mínimo, sin diseño especial.

## 6. Estados clave

- Vacíos que enseñan: "Todavía no hay proyectos. Creá el primero y sumá al equipo." / "Ningún movimiento este mes. Cargá el primero." / "Sala libre todo el día." / "Todavía no te invitaron a ninguna organización. Pedile la invitación a quien administra la tuya."
- Carga: skeletons con la forma del contenido; nunca spinner centrado.
- Error: mensaje + reintento ("No pudimos guardar la reserva. Probá de nuevo.").
- Conflicto de reserva (constraint DB): "Esa franja se acaba de ocupar. Elegí otro horario." + grilla refrescada.
- Tarea ya tomada: "Alguien la tomó primero." y sale del pool.
- Sin permiso: módulo ausente de la navegación; URL directa → "No tenés acceso a esta sección" + link a Hoy.
- Subida de media: progreso visible, error con reintento, límites claros (fotos 10 MB, video 200 MB).

## 7. Interacción

- Tomar tarea: un tap, optimista, undo breve ("La tomaste · Deshacer").
- Marcar hecha: tap, check + fade, sin modal.
- Reservar: tap en franja → sheet inferior, pocos campos, confirmar.
- Cancelar reserva: motivo obligatorio; avisa que revierte el/los ingresos si era paga.
- Movimiento: form de una pantalla, fecha hoy por defecto, teclado numérico para monto.
- Switcher de org: tap → lista → cambio con transición corta; recuerda la última org.
- Motion: 150–250 ms ease-out, solo estado. Sin coreografías de carga. Respetar prefers-reduced-motion.

## 8. Contenido

Voseo directo: "Creá", "Tomala", "Marcá hecha", "Cargá", "Reservá", "Cancelá", "Continuá con Google". Montos `es-AR`. Fechas relativas cercanas ("hoy", "ayer", "lunes 3/8"). Detalle generado: "Sala Norte · Estudio Sur · 3 h" (+ "· 60%" si reparto). Íconos Lucide, un solo estilo. Media real de salas/edificios; sin ilustraciones decorativas.

## 9. Referencias impeccable para implementación

`interaction-design` (forms y flujos táctiles), `spatial-design` (grilla responsive de espacios), `clarify` al final para pulir copy.
