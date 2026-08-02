# Fase 3 — Espacios: edificios, salas, planes y reservas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Módulo completo de espacios (spec §5.3): disponibilidad por día (mobile chips + columna, desktop grilla), reservas para mí o para terceros con costo calculado **en el servidor** (RPC `crear_reserva`), cancelación con motivo (RPC `cancelar_reserva`), administración de edificios/salas/planes/media (Supabase Storage) con permiso `espacios`, todo funcionando igual para la org gestora en edificios co-gestionados.

**Architecture:** Las reservas dejan de escribirse por insert/update directo: se eliminan esas políticas RLS y toda mutación pasa por RPCs `security definer` que validan sala activa, plan de la org **propietaria** del edificio, `solo_salas_publicas`, cliente de la org propietaria y calculan `costo` server-side (precondición del trigger de finanzas de fase 4). La media va a un bucket público `espacios` (`<edificio_id>/...`), subida directa del cliente vía signed upload URL emitida por server action con guard de permiso; el registro en `espacio_media` lo hace otra action. UI server-first con server actions, mismo patrón de sheets/toast de fase 2.

**Tech Stack:** El existente (Next 16 App Router, TS estricto, Tailwind v4 tokens, Supabase hosted `olmjkuapainklekdzntk` vía MCP para migraciones, Vitest contra hosted).

## Global Constraints

- TypeScript estricto; ESLint sin errores; `npm run build && npm run lint && npm test` verdes al cierre de cada task que toque código.
- UI español rioplatense voseo: "Reservá", "Elegí un horario", "Cancelala", "Contanos por qué la cancelás".
- Tokens DESIGN.md únicamente; chips píldora 32px (fondo `bg-acento/10 text-acento` seleccionada); targets táctiles ≥44px; sheets inferiores mobile / panel lateral desktop; montos `tabular-nums` formato `es-AR`.
- Franjas horarias 8–22 (hora_inicio 8–21); fechas en `America/Argentina/Buenos_Aires`.
- `costo` jamás viaja del cliente: la RPC lo calcula; el preview de la UI es informativo.
- Fotos hasta 10 MB, video hasta 200 MB (límite de bucket 200 MB; el de fotos se valida en la action).
- Secret key solo server-side. Migraciones: archivo local en `supabase/migrations/` + `apply_migration` vía MCP (project_id `olmjkuapainklekdzntk`).
- Commits en español, body termina: Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
- Interfaces existentes: `obtenerContextoOrg`/`listarMisOrgs` (lib/org.ts), helpers SQL `es_miembro`, `tiene_permiso`, `opera_edificio`, patrón `mensajeLegible` de acciones de tareas, `ProveedorToast`/`useToast`.

---

### Task 1: Migración 0005 — RPCs de reservas, endurecimiento y bucket de media

**Files:**
- Create: `supabase/migrations/0005_reservas_rpc.sql`

**Interfaces:**
- Produces: helper `administra_edificio(edificio uuid)` (permiso `espacios` en propietaria o gestora); RPCs `crear_reserva(sala uuid, plan uuid, dia date, inicio int, duracion int, cliente uuid default null) returns uuid` y `cancelar_reserva(reserva uuid, motivo text) returns void` (raise exception con mensajes en español); políticas `reservas_insert`/`reservas_update` **eliminadas** (mutación solo vía RPC); bucket `espacios` público con políticas de escritura por `administra_edificio` sobre el primer segmento del path.

- [ ] **Step 1: Escribir la migración** con exactamente:
  - `administra_edificio(edificio uuid)`: `security definer`, true si `tiene_permiso(org_propietaria_id,'espacios')` o (gestora no nula y `tiene_permiso(org_gestora_id,'espacios')`).
  - `crear_reserva`: valida en orden — sala existe y `activa` (si no: `'La sala no está disponible'`); `opera_edificio` (si no: `'No podés reservar en este edificio'`); `dia >= (now() at time zone 'America/Argentina/Buenos_Aires')::date` (si no: `'Esa fecha ya pasó'`); plan pertenece a la **org propietaria** del edificio (si no: `'Ese plan no aplica acá'`); plan `solo_salas_publicas` y sala `privada` → `'Ese plan es solo para salas públicas'`; `cliente` no nulo → debe ser de la org propietaria (si no: `'Ese cliente no es de la organización'`). `costo := case when plan.gratuito then 0 else plan.precio_hora * duracion end`. Insert con `para_perfil_id = auth.uid()` si `cliente is null`, `creada_por = auth.uid()`. Capturar `exclusion_violation` → `raise exception 'Ese horario ya está reservado'`. Devuelve el id.
  - `cancelar_reserva`: reserva existe y `estado='confirmada'` (si no: `'La reserva no existe o ya está cancelada'`); `motivo` no vacío (`'Contanos el motivo'`); permitido si `creada_por = auth.uid()` **o** `administra_edificio(...)` de la sala (si no: `'Solo quien la creó (o con permiso de espacios) puede cancelarla'`). Update a `cancelada` + `motivo_cancelacion`.
  - `drop policy reservas_insert on reservas; drop policy reservas_update on reservas;`
  - Bucket: `insert into storage.buckets (id, name, public, file_size_limit) values ('espacios','espacios',true,209715200) on conflict (id) do nothing;` + políticas sobre `storage.objects` (insert/update/delete) para `bucket_id='espacios' and administra_edificio((split_part(name,'/',1))::uuid)`.
  - `revoke execute ... from anon` para las 3 funciones nuevas.
- [ ] **Step 2: Aplicar a hosted** — MCP `apply_migration` (name `reservas_rpc`). Verificar con `execute_sql`: funciones presentes; `select polname from pg_policy where polrelid='reservas'::regclass` → solo `reservas_select`; bucket `espacios` existe.
- [ ] **Step 3: Commit** — `git add supabase && git commit -m "feat: migración 0005, RPCs de reservas, endurecimiento y bucket de media"`

---

### Task 2: Seed de fase 3

**Files:**
- Modify: `scripts/seed.mjs`

- [ ] **Step 1:** Agregar (idempotente por claves naturales):
  - Plan de Fundación Delta: `"Comunidad"` (`gratuito: true, precio_hora: 0, solo_salas_publicas: true`).
  - Plan de Gestora Sur: `"Pago Sur"` (`gratuito: false, precio_hora: 5000`) — existe solo para testear que un plan de la gestora **no** aplica en Casa Delta.
  - Descripciones y dirección de Casa Delta y de las 3 salas (update si están vacías): dirección "Av. Rivadavia 1234, CABA", textos cortos reales.
  - 2 reservas demo confirmadas en fechas fijas futuras (claves naturales sala+fecha+hora): Sala Norte 2026-12-15 10:00 2h plan "Pago por hora" para el cliente "Estudio Sur"; Sala Sur 2026-12-15 14:00 1h plan "Gratuito" `para_perfil_id` ope. Insertadas con el cliente admin (service role bypassa RLS; `creada_por` admin) y `costo` coherente (16000 / 0).
- [ ] **Step 2:** `npm run seed` dos veces — counts estables (planes 4, reservas estables).
- [ ] **Step 3: Commit** — `"feat: seed de fase 3 con planes, textos de espacios y reservas demo"`

---

### Task 3: Datos y acciones de espacios

**Files:**
- Create: `lib/espacios.ts`, `app/(app)/o/[orgId]/espacios/acciones.ts`

**Interfaces:**
- Produces (lib/espacios.ts, server-side, cliente de sesión):
  - `type Sala = { id: string; nombre: string; tipo: "publica" | "privada"; descripcion: string; activa: boolean }`
  - `type Edificio = { id: string; nombre: string; direccion: string; descripcion: string; org_propietaria_id: string; org_gestora_id: string | null; destino_ingresos: "propietaria" | "gestora" | "reparto"; porcentaje_propietaria: number | null }`
  - `type Media = { id: string; tipo: "foto" | "video"; url: string; orden: number }`
  - `type Plan = { id: string; nombre: string; gratuito: boolean; precio_hora: number; solo_salas_publicas: boolean }`
  - `type ReservaDia = { id: string; sala_id: string; hora_inicio: number; horas: number; titular: string; creada_por: string }` (titular = nombre del cliente o del perfil)
  - `type MiReserva = { id: string; fecha: string; hora_inicio: number; horas: number; costo: number; sala: string; edificio: string; titular: string | null }`
  - `listarEdificios(orgId)` → edificios donde la org es propietaria **o** gestora, con conteo de salas activas; `obtenerEdificio(edificioId)` → Edificio + salas + media por sala y del edificio (URLs públicas de Storage) + `planes` de la org propietaria + `esAdmin` (`administra` según permisos del contexto se resuelve en la página, no acá); `reservasDelDia(edificioId, fecha)` → ReservaDia[] confirmadas; `misReservas(perfilId)` → próximas (fecha >= hoy BA) ordenadas; `listarClientes(orgId)` → para autocompletar.
- Produces (acciones.ts, "use server", devuelven `{ error?: string }` o `{ error?: string; id?: string }`, revalidatePath de `/o/[orgId]/espacios` y detalle):
  - `crearEdificio(orgId, formData)` (nombre, direccion, descripcion; propietaria = org activa; guard permiso `espacios`), `editarEdificio(edificioId, formData)` (direccion, descripcion, destino_ingresos, porcentaje_propietaria, org_gestora_id opcional entre `listarMisOrgs`), `crearSala(edificioId, formData)`, `editarSala(salaId, formData)` (incluye `activa`), `crearPlan(orgId, formData)`, `editarPlan(planId, formData)` — guards con `administra` (permiso `espacios` vía RLS: el update/insert directo ya lo recorta la política; el guard JS da mensaje legible).
  - `crearReserva(orgId, formData)` → `rpc("crear_reserva", ...)`; `cancelarReserva(orgId, reservaId, motivo)` → `rpc("cancelar_reserva", ...)`; errores con `mensajeLegible`.
  - `crearClienteRapido(orgId, nombre, contacto)` → inserta y devuelve id.
  - `pedirSubidaMedia(edificioId, salaId | null, tipo, extension)` → guard `administra_edificio` (query a edificios con cliente de sesión) + `clienteAdmin().storage.from("espacios").createSignedUploadUrl("<edificioId>/<crypto.randomUUID()>.<ext>")` → `{ path, token }`; `registrarMedia(edificioId, salaId | null, tipo, path)` → insert en `espacio_media` (RLS valida); `borrarMedia(mediaId)` → borra fila y objeto (admin client tras verificar permiso).
- [ ] **Step 1:** Implementar ambos archivos siguiendo los patrones de `lib/proyectos.ts` (normalizador `primero`, `.returns<>()`) y `tareas/acciones.ts`.
- [ ] **Step 2:** `npm run build && npm run lint` limpios.
- [ ] **Step 3: Commit** — `"feat: datos y acciones de espacios"`

---

### Task 4: UI de disponibilidad y reservas

**Files:**
- Modify: `app/(app)/o/[orgId]/espacios/page.tsx` (deja de ser placeholder)
- Create: `componentes/espacios/SelectorDia.tsx`, `componentes/espacios/GrillaDia.tsx`, `componentes/espacios/SheetReserva.tsx`, `componentes/espacios/TusReservas.tsx`, `componentes/espacios/SheetCancelar.tsx`

**Interfaces:**
- Consumes: todo Task 3.
- Produces: `/espacios?edificio=<id>&fecha=YYYY-MM-DD` (defaults: primer edificio, hoy BA).

- [ ] **Step 1: `/espacios`** — server page: chips de edificio (si hay >1), `SelectorDia` (‹ ayer/mañana ›, `<input type="date">` estilizado, "Hoy"), `GrillaDia`, sección **"Tus reservas"** (`TusReservas` con `misReservas`), y con permiso `espacios` link "Administrá el espacio" → `/espacios/[edificioId]`. Vacíos: sin edificios → "Todavía no hay espacios. " + (con permiso) "Creá el primero." / (sin) "Pedile a quien administra que cargue uno."
- [ ] **Step 2: `GrillaDia`** (client) — mobile: chips de sala arriba + una columna vertical de franjas 8–22 de la sala elegida; desktop (lg+): grilla salas (columnas) × horas (filas). Franja ocupada: bloque con titular en `text-tinta-suave` (y quién, si es mía, borde acento); franja libre: botón ≥44px "Reservá" discreto al hover/siempre en mobile → abre `SheetReserva` con sala+hora prefijadas. Salas inactivas no aparecen.
- [ ] **Step 3: `SheetReserva`** (client, mismo patrón sheet fase 2) — campos: sala (fija, título), fecha (fija), hora inicio (select 8–21 con la elegida), duración (select 1–4h + "más" hasta cierre 22), plan (select de planes aplicables: filtra `solo_salas_publicas` si la sala es privada), "Para mí" | "Para otra persona" (toggle segmentado; otra persona → input autocompletar sobre `listarClientes` en memoria + "Agregá a <texto>" que llama `crearClienteRapido`), **costo estimado** visible y actualizado (`precio_hora × duración`, `$ 16.000` es-AR, "Gratis" si 0) con leyenda "El costo final lo calcula el sistema al confirmar". Submit → `crearReserva`; error → texto en el sheet (p. ej. "Ese horario ya está reservado"); éxito → cerrar + toast "Reservaste <sala> · <fecha> <hora> h" + `router.refresh()`.
- [ ] **Step 4: `TusReservas` + `SheetCancelar`** — filas: fecha corta ("mar 15 dic"), hora–hora, sala · edificio, titular si es para un tercero, costo. Botón "Cancelala" → `SheetCancelar` (textarea motivo obligatorio + confirmar en `text-peligro`); éxito → toast "Reserva cancelada." Vacío: "No tenés reservas próximas."
- [ ] **Step 5:** Build + lint + prueba manual (`npm run dev`: reservar como ope para sí y para un cliente nuevo, ver conflicto reservando la misma franja en dos pestañas). **Commit** — `"feat: disponibilidad por día y reservas con costo server-side"`

---

### Task 5: UI de administración del espacio

**Files:**
- Create: `app/(app)/o/[orgId]/espacios/[edificioId]/page.tsx`, `componentes/espacios/SheetEdificio.tsx`, `componentes/espacios/SheetSala.tsx`, `componentes/espacios/SheetPlan.tsx`, `componentes/espacios/GaleriaMedia.tsx`, `componentes/espacios/SubirMedia.tsx`

**Interfaces:**
- Consumes: `obtenerEdificio`, acciones de Task 3.

- [ ] **Step 1: `/espacios/[edificioId]`** — server page, `notFound()` si no visible. Cabecera: nombre, dirección, descripción, `GaleriaMedia` del edificio. Lista de salas (nombre, tipo "Pública"/"Privada", activa/inactiva atenuada, descripción, galería propia). Sección "Planes" (de la org propietaria): nombre, "Gratis"/"$ N/h", "solo salas públicas" como nota. Sin permiso `espacios`: todo solo lectura (sin botones). Con permiso: "Editá el edificio" (`SheetEdificio`), "Agregá una sala" / editar por sala (`SheetSala`), "Agregá un plan" / editar (`SheetPlan`), `SubirMedia` en edificio y en cada sala.
- [ ] **Step 2: `SheetEdificio`** — direccion, descripcion, destino_ingresos (radio 3 opciones con copy claro: "Todo para la propietaria" / "Todo para la gestora" / "Reparto"), porcentaje_propietaria (input numérico visible solo con reparto, sufijo "% para la propietaria"), org gestora (select de `listarMisOrgs` excluyendo la propietaria + "Sin co-gestión") — el botón de crear edificio (en `/espacios` vacío o lista) reusa el sheet en modo alta con nombre.
- [ ] **Step 3: `SheetSala` y `SheetPlan`** — sala: nombre, tipo (segmentado Pública/Privada), descripcion, activa (toggle "Se puede reservar"). Plan: nombre, gratuito (toggle; apaga precio), precio_hora, solo_salas_publicas (toggle "Solo salas públicas").
- [ ] **Step 4: `GaleriaMedia` + `SubirMedia`** — galería: fila horizontal scrolleable de fotos (`<img>` object-cover rounded-lg) y videos (`<video controls preload="metadata">`). `SubirMedia` (client): `<input type="file" accept="image/*,video/*">`; valida 10 MB foto / 200 MB video con copy claro; flujo `pedirSubidaMedia` → `uploadToSignedUrl` (cliente browser de `lib/supabase/client`) → `registrarMedia` → refresh; progreso simple ("Subiendo…"); borrar con permiso (× sobre el thumb + confirmación).
- [ ] **Step 5:** Build + lint + prueba manual (subir foto a Casa Delta, crear sala, editar plan, ver todo como coordi sin botones). **Commit** — `"feat: administración de edificios, salas, planes y media"`

---

### Task 6: Tests de fase 3

**Files:**
- Create: `tests/rls/crear-reserva.test.ts`
- Modify: `tests/rls/reservas.test.ts` (los inserts directos ya no pasan: migrarlos a la RPC)

- [ ] **Step 1: Migrar `reservas.test.ts`** — (a) y (c) usan `rpc("crear_reserva", ...)`; (b) espera el mensaje `'Ese horario ya está reservado'` (ya no code 23P01 crudo); (c) el update ajeno directo ahora falla para **todos** (políticas de escritura eliminadas): reformular como "update directo → 0 filas incluso para quien creó la reserva"; (d) se elimina (la RPC no permite ambos: cliente XOR perfil es implícito) y en su lugar: insert directo → error/0 filas (sin política de insert).
- [ ] **Step 2: `crear-reserva.test.ts`** (fechas en septiembre 2027, limpieza admin beforeAll+afterAll):
  1. ope crea con plan "Pago por hora" 2h → OK y `costo` en DB = 16000 (la RPC no acepta costo: server-side por diseño).
  2. Plan "Pago Sur" (de Gestora Sur) en Sala Norte → error "Ese plan no aplica acá".
  3. Plan "Comunidad" (`solo_salas_publicas`) en "Estudio" (privada) → error "Ese plan es solo para salas públicas".
  4. Fecha pasada → error "Esa fecha ya pasó".
  5. `cancelar_reserva` de reserva de ope por coordi (sin espacios, no creadora) → error; por ope (creadora) sin motivo → error; con motivo → OK y estado `cancelada`.
  6. gestora (org Gestora Sur, permiso espacios) cancela una reserva ajena de Casa Delta → OK (co-gestión).
  7. Franja liberada por cancelación se puede volver a reservar → OK.
- [ ] **Step 3:** `npm test` dos veces — todo verde. Gap real de política/RPC → BLOCKED, no debilitar.
- [ ] **Step 4: Commit** — `"test: crear_reserva y cancelar_reserva con validaciones server-side"`

---

### Task 7: Verificación de fase y deploy

**Files:**
- Modify: `README.md` (fase 3 hecha), `docs/superpowers/specs/2026-07-27-gestion-v1-design.md` (tildar criterios §5.3 cumplidos)

- [ ] **Step 1:** `npm run build && npm run lint && npm run seed && npm test` — todo verde.
- [ ] **Step 2:** Tildar en spec §5.3: solapamiento en DB, `solo_salas_publicas`, co-gestión (test RLS), permisos de reserva/cancelación, y la precondición de fase 2 (plan/cliente de la org propietaria + costo server-side). **No** tildar "El costo mostrado coincide con la suma de movimientos" (eso se cierra en fase 4 con el trigger de finanzas). README: fase 3 completa.
- [ ] **Step 3: Commit + push + deploy** — push a main y `vercel deploy --prod --yes`.

---

## Self-review (hecho al escribir)

- **Cobertura spec §5.3:** edificios+config co-gestión/destino (T5), salas públicas/privadas con galería y límites de tamaño (T5), planes por org con precio por plan (T5), reserva fecha+inicio+duración para mí/tercero con alta de cliente al vuelo y costo visible (T4), disponibilidad mobile chips→columna / desktop grilla (T4), tus reservas + cancelación con motivo (T4), criterios testeados (T6).
- **Precondición fase 4 cerrada acá:** plan/cliente validados contra la org propietaria y costo calculado en el servidor (RPC, T1) — el trigger de movimientos de fase 4 se apoya en esto.
- **Riesgo conocido:** `reservas.test.ts` existente usa inserts directos que la migración rompe a propósito; T6 lo migra en la misma fase (T1 y T6 deben aterrizar antes de correr la suite completa en CI/local).
- **Sin placeholders:** mensajes de error literales compartidos entre migración y tests; claves naturales del seed definidas.
