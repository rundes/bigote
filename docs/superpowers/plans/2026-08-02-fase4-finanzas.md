# Fase 4 — Finanzas: ámbitos, integración con reservas y resumen mensual

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Módulo completo de finanzas (spec §5.4): alta manual de ingresos/egresos con ámbito (Entidad o edificio), resumen del mes + acumulado con chips de ámbito, movimientos automáticos por reserva paga según `destino_ingresos` del edificio (propietaria/gestora/reparto con redondeo a favor de la propietaria), reversión al cancelar, export CSV del período. Cierra también el criterio pendiente de §5.3 (costo mostrado = suma de movimientos generados).

**Architecture:** La generación/reversión de movimientos de reserva vive en la **base** (triggers sobre `reservas`), no en la app: cualquier vía de confirmación/cancelación (RPC hoy, lo que sea mañana) los produce igual. Insert de reserva `confirmada` con `costo > 0` → 1 o 2 ingresos según destino; update a `cancelada` → borra sus movimientos (la traza queda en la reserva: estado + `motivo_cancelacion`). Reparto: la parte de la gestora se trunca a centavos y la propietaria se lleva el resto (suman exacto, redondeo a favor de la propietaria). El resumen se computa en JS sobre las filas del período (volumen chico, sin depender de aggregates de PostgREST). CSV vía route handler autenticado.

**Tech Stack:** El existente (Next 16 App Router, TS estricto, Tailwind v4 tokens, Supabase hosted `olmjkuapainklekdzntk` vía MCP para migraciones, Vitest contra hosted).

## Global Constraints

- TypeScript estricto; ESLint sin errores; `npm run build && npm run lint && npm test` verdes al cierre de cada task que toque código.
- UI español rioplatense voseo: "Cargá un movimiento", "Todavía no hay movimientos este mes."
- Tokens DESIGN.md: balance del mes 29px semibold `tabular-nums`; ingresos `--ok`, egresos `--danger`; chips píldora 32px; filas con separadores, no cards.
- Moneda ARS formato `es-AR`; fechas en `America/Argentina/Buenos_Aires`.
- Movimientos `origen='reserva'` intocables desde la UI y desde la API (políticas existentes ya lo hacen: insert/update solo `origen='manual'`).
- Secret key solo server-side. Migraciones: archivo local + `apply_migration` vía MCP (project_id `olmjkuapainklekdzntk`).
- Commits en español, body termina: Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
- Interfaces existentes: `obtenerContextoOrg`, `listarEdificios` (lib/espacios.ts), `hoyEnBuenosAires`, patrón sheets/toast, RPCs `crear_reserva`/`cancelar_reserva` (los triggers se cuelgan de la tabla, no de las RPCs).

---

### Task 1: Migración 0007 — triggers de movimientos por reserva + backfill

**Files:**
- Create: `supabase/migrations/0007_movimientos_reserva.sql`

**Interfaces:**
- Produces: función `generar_movimientos_reserva()` (trigger after insert on reservas), `revertir_movimientos_reserva()` (trigger after update on reservas), backfill de reservas confirmadas pagas preexistentes sin movimientos.

- [ ] **Step 1: Escribir la migración**:
  - `generar_movimientos_reserva()`: si `new.estado='confirmada'` y `new.costo > 0` → busca sala→edificio (org propietaria, gestora, destino, porcentaje) y nombre de sala. `detalle := 'Sala · <nombre> · <horas> h'` (+ `' · <pct>%'` en cada pata si reparto). Inserta con `fecha = new.fecha`, `categoria = 'reservas'`, `origen = 'reserva'`, `reserva_id = new.id`, `creado_por = new.creada_por`, `edificio_id` del edificio:
    - `propietaria` → 1 ingreso a la org propietaria por `new.costo`.
    - `gestora` → 1 ingreso a la org gestora por `new.costo`.
    - `reparto` → `monto_gestora := trunc(new.costo * (100 - pct) / 100, 2)`; `monto_prop := new.costo - monto_gestora` (suman exacto; el redondeo favorece a la propietaria). Cada pata se inserta solo si su monto > 0 (check `monto > 0` de la tabla).
  - `revertir_movimientos_reserva()`: si `old.estado='confirmada'` y `new.estado='cancelada'` → `delete from movimientos where reserva_id = new.id and origen = 'reserva'` (la traza de la cancelación es la reserva misma).
  - Triggers `after insert` / `after update of estado` sobre `reservas`.
  - Backfill: para cada reserva `confirmada` con `costo > 0` sin movimientos (`not exists`), generar los mismos inserts (mismo cálculo) — cubre la reserva demo del seed de fase 3.
- [ ] **Step 2: Aplicar a hosted** — MCP `apply_migration` (name `movimientos_reserva`). Verificar con `execute_sql`: los 2 triggers existen sobre `reservas`; la reserva demo paga (2026-12-15, costo 16000, Casa Delta reparto 60%) tiene 2 movimientos que suman 16000 (9600 propietaria / 6400 gestora).
- [ ] **Step 3: Commit** — `"feat: migración 0007, movimientos automáticos por reserva con reparto y backfill"`

---

### Task 2: Datos y acciones de finanzas

**Files:**
- Create: `lib/finanzas.ts`, `app/(app)/o/[orgId]/finanzas/acciones.ts`

**Interfaces:**
- Produces (lib/finanzas.ts, server-side, cliente de sesión — la RLS ya recorta por permiso `finanzas`):
  - `type Movimiento = { id: string; tipo: "ingreso" | "egreso"; categoria: string; monto: number; detalle: string; fecha: string; edificio_id: string | null; origen: "manual" | "reserva"; reserva_id: string | null }`
  - `type Ambito = "todo" | "entidad" | string` (string = edificio id)
  - `listarMovimientosDelMes(orgId, mes /* "YYYY-MM" */, ambito): Promise<Movimiento[]>` (orden fecha desc)
  - `resumenDelMes(movimientos): { ingresos: number; egresos: number; balance: number }` (pura, en JS)
  - `acumuladoHasta(orgId, mes, ambito): Promise<number>` (balance histórico hasta el fin del mes elegido; query liviana `select tipo, monto` filtrada y suma en JS)
  - `mesActualBA(): string` ("YYYY-MM" en Buenos Aires)
- Produces (acciones.ts, "use server"):
  - `crearMovimiento(orgId, formData): Promise<{ error?: string }>` — guard permiso `finanzas`; campos: tipo (ingreso|egreso), monto (> 0), categoria (texto, default "general"), detalle, fecha (default hoy BA), ambito ("" = entidad, sino edificio id validado contra `listarEdificios`); `origen='manual'`, `creado_por` = usuario; revalida `/o/[orgId]/finanzas`.
- [ ] **Step 1:** Implementar ambos archivos (patrones de lib/espacios.ts).
- [ ] **Step 2:** `npm run build && npm run lint` limpios.
- [ ] **Step 3: Commit** — `"feat: datos y acciones de finanzas"`

---

### Task 3: UI de finanzas + export CSV

**Files:**
- Modify: `app/(app)/o/[orgId]/finanzas/page.tsx` (deja de ser placeholder)
- Create: `componentes/finanzas/SelectorMes.tsx`, `componentes/finanzas/ChipsAmbito.tsx`, `componentes/finanzas/SheetMovimiento.tsx`, `componentes/finanzas/FilaMovimiento.tsx`, `app/(app)/o/[orgId]/finanzas/csv/route.ts`

**Interfaces:**
- Produces: `/finanzas?mes=YYYY-MM&ambito=todo|entidad|<edificioId>` (defaults: mes actual BA, "todo"); `/finanzas/csv?mes=&ambito=` (text/csv; sin permiso `finanzas` → 403).

- [ ] **Step 1: `/finanzas`** — guard: sin permiso `finanzas` → mensaje "No tenés permiso para ver las finanzas." (sin datos). Con permiso: `SelectorMes` (‹ mes anterior · "agosto 2026" · mes siguiente ›), `ChipsAmbito` (Todo · Entidad · un chip por edificio de `listarEdificios`; server links con searchParams), resumen del mes (balance 29px semibold con signo y color `--ok`/`--danger`, debajo "Ingresos $X · Egresos $Y" y "Acumulado $Z" en `text-tinta-suave`, todo `tabular-nums`), lista de movimientos (`FilaMovimiento`), botón "Cargá un movimiento" → `SheetMovimiento`, link "Descargá el CSV" → `/finanzas/csv?...`. Vacío: "Todavía no hay movimientos este mes."
- [ ] **Step 2: `FilaMovimiento`** — fecha corta, categoría + detalle (detalle en `text-tinta-suave`), ámbito como nota si el chip activo es "Todo" (Entidad / nombre del edificio), monto alineado a la derecha (`+$ X` en ok / `−$ X` en peligro). Si `origen='reserva'`: sin acciones, badge discreto "Reserva" que linkea a `/espacios?edificio=<id>&fecha=<fecha>`.
- [ ] **Step 3: `SheetMovimiento`** — tipo segmentado (Ingreso/Egreso), monto (numérico, requerido), categoría (input con `datalist`: alquiler, servicios, sueldos, insumos, donaciones, eventos, general), detalle, fecha (`type="date"`, default hoy BA), ámbito (select: Entidad + edificios). Submit → `crearMovimiento`; éxito → cerrar + refresh.
- [ ] **Step 4: `csv/route.ts`** — GET con sesión; sin permiso → 403. Columnas: fecha, tipo, categoria, detalle, ambito, origen, monto. Separador `;` (Excel es-AR), BOM UTF-8, `Content-Disposition: attachment; filename="movimientos-<mes>.csv"`.
- [ ] **Step 5:** Build + lint + prueba manual (admin: cargar egreso de entidad y de edificio, navegar meses, chips, CSV). **Commit** — `"feat: finanzas con resumen mensual, ámbitos y export CSV"`

---

### Task 4: Seed de fase 4

**Files:**
- Modify: `scripts/seed.mjs`

- [ ] **Step 1:** Movimientos manuales demo (idempotentes por org + detalle + fecha, fechas fijas): en Fundación Delta — egreso "Expensas y luz Casa Delta" $180000 (2026-11-05, ámbito Casa Delta), egreso "Hosting del sitio" $30000 (2026-11-10, entidad), ingreso "Donación Colectivo Raíz" $250000 (2026-11-20, entidad); en Gestora Sur — egreso "Limpieza Casa Delta" $90000 (2026-11-12, ámbito Casa Delta). `creado_por` admin. Agregar `movimientos` al resumen de counts.
- [ ] **Step 2:** `npm run seed` dos veces — counts estables (los movimientos de reserva del backfill/trigger no se duplican: la reserva demo no se re-inserta).
- [ ] **Step 3: Commit** — `"feat: seed de fase 4 con movimientos manuales demo"`

---

### Task 5: Tests de fase 4

**Files:**
- Create: `tests/rls/movimientos.test.ts`

- [ ] **Step 1:** Con edificio efímero "Edificio Finanzas [test-f4]" (propietaria Fundación Delta, gestora Gestora Sur) + sala + plan pago efímero, todo creado por admin en beforeAll y borrado en afterAll (reservas de octubre 2027; limpiar movimientos por edificio efímero):
  1. **Modo reparto (60%)**: ope reserva 2h plan $8000 → 2 ingresos `origen='reserva'` que suman 16000 (9600 Delta / 6400 Sur), `edificio_id` correcto, categoria "reservas" — y **suma == costo de la reserva** (cierra el criterio pendiente de §5.3).
  2. **Redondeo a favor de la propietaria**: plan efímero de precio $33.33, 1h → propietaria 20.00, gestora 13.33 (suman 33.33).
  3. **Modo propietaria** y **modo gestora**: admin cambia `destino_ingresos` del edificio efímero entre reservas → 1 solo ingreso en el libro que corresponde.
  4. **Cancelar revierte**: cancelar la reserva del caso 1 vía RPC → 0 movimientos con ese `reserva_id`; la reserva queda `cancelada` con motivo.
  5. **Gratuita no genera**: reserva plan Gratuito → 0 movimientos.
  6. **RLS**: coordi (sin `finanzas`) lee `movimientos` de Fundación Delta → `[]`; admin (con `finanzas`) ve los del caso 1 antes de cancelar. (El caso "org B no ve el libro de A aunque co-gestionen" ya está verde en cogestion.test.ts.)
  7. **Insert manual con origen='reserva' → rechazado** (política `movimientos_insert` exige `origen='manual'`).
- [ ] **Step 2:** `npm test` dos veces — todo verde. Gap real → BLOCKED, no debilitar.
- [ ] **Step 3: Commit** — `"test: movimientos por reserva (tres destinos, redondeo, reversión) y RLS de finanzas"`

---

### Task 6: Verificación de fase y deploy

**Files:**
- Modify: `README.md` (fase 4 hecha), `docs/superpowers/specs/2026-07-27-gestion-v1-design.md` (tildar criterios §5.4 y el pendiente de §5.3)

- [ ] **Step 1:** `npm run build && npm run lint && npm run seed && npm test` — todo verde.
- [ ] **Step 2:** Tildar §5.4 completo (tres modos testeados, reversión, RLS finanzas, libro ajeno) y el criterio de §5.3 "costo mostrado = suma de movimientos". README: fase 4 completa.
- [ ] **Step 3: Commit + push + deploy** — push a main y `vercel deploy --prod --yes`.

---

## Self-review (hecho al escribir)

- **Cobertura spec §5.4:** alta manual con ámbito/categoría/detalle/fecha (T2/T3), resumen mes + acumulado + chips Todo/Entidad/edificio (T3), egresos de cada org en su libro con ámbito edificio (RLS existente + seed T4), `origen='reserva'` no editable con link a la reserva (T3, políticas de fase 1), CSV (T3), criterios testeados (T5).
- **En DB, no en UI:** triggers sobre `reservas` (spec §3 "Reglas de integridad… en DB, no solo en UI"); la RPC de fase 3 no se toca.
- **Reparto exacto:** gestora truncada a centavos, propietaria lleva el resto — spec §3 "los montos suman el costo exacto (redondeo a favor de la propietaria)".
- **Riesgo conocido:** tests mutan `destino_ingresos` — por eso edificio efímero propio del test, nunca Casa Delta (otros archivos de test corren en paralelo contra ella).
