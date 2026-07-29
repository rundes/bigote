# Fase 2 — Proyectos, tareas y track record

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Módulo completo de proyectos y tareas (spec §5.2): CRUD de proyectos con equipo, tareas con pool y dificultad, tomar/completar atómico vía RPC, vista "Mis tareas", sección "Tus tareas" en Hoy, y track record por persona con filtros.

**Architecture:** Las transiciones de tareas (tomar/soltar/completar) van por funciones SQL `security definer` con validación atómica (la RLS de escritura directa queda solo para gestión con permiso `proyectos`/`admin`). El track record es una función SQL agregadora que aplica el permiso `equipo` adentro (propio siempre visible). UI server-first con server actions; optimismo solo en tomar/completar con undo.

**Tech Stack:** El existente (Next 16 App Router, TS estricto, Tailwind v4 tokens, Supabase hosted `olmjkuapainklekdzntk` vía MCP para migraciones, Vitest contra hosted).

## Global Constraints

- TypeScript estricto; ESLint sin errores; `npm run build && npm run lint && npm test` verdes al cierre de cada task que toque código.
- Toda la UI español rioplatense voseo: "Creá el primero", "Tomala", "Marcá hecha", "Alguien la tomó primero.", "La tomaste · Deshacer".
- Tokens DESIGN.md únicamente; pips de dificultad ●●●○○ (`text-acento` llenos, `text-tinta-suave` vacíos); targets táctiles ≥44px; sheets inferiores en mobile, no modales.
- Dificultad 1–5; pool = `asignado_a IS NULL`; track record se calcula sobre `completada_por`, nunca `asignado_a` (spec §5.2).
- Secret key solo server-side. Migraciones: archivo local en `supabase/migrations/` + aplicar a hosted vía MCP `apply_migration` (project_id `olmjkuapainklekdzntk`).
- Commits en español, body termina: Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
- Interfaces existentes: `obtenerContextoOrg(orgId)`/`listarMisOrgs()` en `lib/org.ts`; clientes en `lib/supabase/{client,server,admin}.ts`; helpers SQL `es_miembro`, `tiene_permiso`, `opera_edificio`, `es_miembro_del_proyecto`, `org_del_proyecto`.

---

### Task 1: Migración 0004 — RPCs de tareas, track record y endurecimiento

**Files:**
- Create: `supabase/migrations/0004_tareas_rpc.sql`
- Modify: `scripts/seed.mjs` (tareas hechas para demo del track record)

**Interfaces:**
- Produces: RPCs `tomar_tarea(tarea uuid)`, `soltar_tarea(tarea uuid)`, `completar_tarea(tarea uuid)` (void, raise exception con mensajes en español), `track_record(org uuid, desde date default null, hasta date default null, proyecto uuid default null)` → tabla `(perfil_id uuid, nombre text, completadas bigint, dificultad_total bigint, dificultad_promedio numeric)`. Política `tareas_write` reemplazada por `tareas_gestion` (solo permiso proyectos/admin).

- [ ] **Step 1: Escribir la migración**

```sql
create or replace function public.tomar_tarea(tarea uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_miembro_del_proyecto((select proyecto_id from tareas where id = tarea)) then
    raise exception 'No sos miembro de este proyecto';
  end if;
  update tareas set estado = 'en_curso', asignado_a = auth.uid()
  where id = tarea and estado = 'pendiente' and asignado_a is null;
  if not found then
    raise exception 'Alguien la tomó primero';
  end if;
end $$;

create or replace function public.soltar_tarea(tarea uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update tareas set estado = 'pendiente', asignado_a = null
  where id = tarea and estado = 'en_curso' and asignado_a = auth.uid();
  if not found then
    raise exception 'No la podés soltar';
  end if;
end $$;

create or replace function public.completar_tarea(tarea uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_asignado uuid;
begin
  select pr.org_id, t.asignado_a into v_org, v_asignado
  from tareas t join proyectos pr on pr.id = t.proyecto_id where t.id = tarea;
  if v_org is null then raise exception 'La tarea no existe'; end if;
  if not (v_asignado = auth.uid() or tiene_permiso(v_org, 'admin')) then
    raise exception 'Solo la persona asignada (o admin) puede marcarla hecha';
  end if;
  update tareas set estado = 'hecha', completada_por = auth.uid(), completada_at = now()
  where id = tarea and estado <> 'hecha';
  if not found then raise exception 'Ya estaba hecha'; end if;
end $$;

create or replace function public.track_record(
  org uuid, desde date default null, hasta date default null, proyecto uuid default null)
returns table (perfil_id uuid, nombre text, completadas bigint,
               dificultad_total bigint, dificultad_promedio numeric)
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre, count(*)::bigint, sum(t.dificultad)::bigint, round(avg(t.dificultad), 2)
  from tareas t
  join proyectos pr on pr.id = t.proyecto_id
  join perfiles p on p.id = t.completada_por
  where pr.org_id = track_record.org
    and t.estado = 'hecha' and t.completada_por is not null
    and (desde is null or t.completada_at >= desde)
    and (hasta is null or t.completada_at < hasta + 1)
    and (proyecto is null or t.proyecto_id = proyecto)
    and (tiene_permiso(track_record.org, 'equipo') or t.completada_por = auth.uid())
  group by p.id, p.nombre
  order by 3 desc;
$$;

-- Escritura directa de tareas: solo gestión (crear/editar/borrar con permiso).
-- Miembros comunes mutan únicamente vía RPCs de arriba.
drop policy tareas_write on tareas;
create policy tareas_gestion on tareas for all using (
  tiene_permiso(org_del_proyecto(proyecto_id), 'proyectos')
  or tiene_permiso(org_del_proyecto(proyecto_id), 'admin')
);

-- Endurecimiento diferido del review de fase 1
revoke execute on function public.org_del_proyecto(uuid) from anon;
revoke execute on function public.es_miembro_del_proyecto(uuid) from anon;
revoke execute on function public.tomar_tarea(uuid) from anon;
revoke execute on function public.soltar_tarea(uuid) from anon;
revoke execute on function public.completar_tarea(uuid) from anon;
revoke execute on function public.track_record(uuid, date, date, uuid) from anon;
```

- [ ] **Step 2: Aplicar a hosted** — MCP `apply_migration` (name "tareas_rpc"). Verificar con `execute_sql`: `select proname from pg_proc where pronamespace='public'::regnamespace and proname in ('tomar_tarea','soltar_tarea','completar_tarea','track_record');` → 4 filas; `select polname from pg_policy where polrelid='tareas'::regclass;` → `tareas_select`, `tareas_gestion`.

- [ ] **Step 3: Seed — historia para el track record.** En `scripts/seed.mjs`, además de las 5 tareas actuales, asegurar (idempotente, clave natural proyecto+titulo): 4 tareas `hecha` en "Sitio nuevo": 2 completadas por coordi (dificultades 3 y 5, `completada_at` hace 10 y 40 días), 2 por ope (dificultades 2 y 4, hace 5 y 70 días). `asignado_a = completada_por` en ellas. Correr `npm run seed` dos veces (counts estables: tareas 9).

- [ ] **Step 4: Commit**

```bash
git add supabase scripts && git commit -m "feat: migración 0004, RPCs de tareas y track record con seed histórico"
```

---

### Task 2: Datos y acciones de proyectos/tareas

**Files:**
- Create: `lib/proyectos.ts`, `app/(app)/o/[orgId]/tareas/acciones.ts`

**Interfaces:**
- Consumes: `crearClienteServidor`, `obtenerContextoOrg`, RPCs de Task 1.
- Produces (lib/proyectos.ts, todo server-side con el cliente de sesión):
  - `type TareaConProyecto = { id: string; titulo: string; descripcion: string; dificultad: number; estado: "pendiente" | "en_curso" | "hecha"; asignado_a: string | null; proyecto: { id: string; nombre: string } }`
  - `listarProyectos(orgId: string): Promise<{ id: string; nombre: string; estado: string; miembros: number; pendientes: number }[]>` (activos primero)
  - `obtenerProyecto(proyectoId: string): Promise<{ id: string; nombre: string; estado: string; org_id: string; miembros: { perfil_id: string; nombre: string }[]; pool: Tarea[]; asignadas: TareaAsignada[] } | null>` con `TareaAsignada = Tarea & { asignado_nombre: string }`; tareas hechas van aparte: `hechas: TareaAsignada[]` (últimas 10)
  - `misTareas(orgId: string, perfilId: string): Promise<{ asignadas: TareaConProyecto[]; pools: TareaConProyecto[] }>` — asignadas a mí (pendiente|en_curso) + tareas en pool de proyectos donde soy miembro, de la org activa
- Produces (acciones.ts, "use server", todas devuelven `{ error?: string }` y `revalidatePath` del detalle):
  - `crearProyecto(orgId, formData)` (nombre; crea y agrega al creador como miembro), `renombrarProyecto(proyectoId, formData)`, `archivarProyecto(proyectoId)` (estado='archivado'), `agregarMiembro(proyectoId, perfilId)`, `quitarMiembro(proyectoId, perfilId)`
  - `crearTarea(proyectoId, formData)` (titulo, descripcion opcional, dificultad 1-5, asignado_a opcional), `borrarTarea(tareaId)`
  - `tomarTarea(tareaId)`, `soltarTarea(tareaId)`, `completarTarea(tareaId)` → `rpc(...)`; el mensaje de la exception SQL se devuelve como `error` legible (extraer `error.message` sin el prefijo de Postgres)

- [ ] **Step 1: Implementar ambos archivos.** Guards en cada acción de gestión: `obtenerContextoOrg` + permiso `proyectos` (o `admin`); las de transición no chequean permiso en JS (la RPC valida). `listarMiembrosOrg(orgId)` auxiliar para el selector de asignación/equipo: perfiles con membresía activa en la org (select a `membresias` + `perfiles`).
- [ ] **Step 2: `npm run build && npm run lint`** limpios (los tipos se consumen en Task 3-5; export completo ya).
- [ ] **Step 3: Commit** — `git commit -m "feat: datos y acciones de proyectos y tareas"`

---

### Task 3: UI de proyectos y detalle

**Files:**
- Modify: `app/(app)/o/[orgId]/tareas/page.tsx` (deja de ser placeholder)
- Create: `app/(app)/o/[orgId]/tareas/[proyectoId]/page.tsx`, `componentes/tareas/FilaTarea.tsx`, `componentes/tareas/PipsDificultad.tsx`, `componentes/tareas/SheetNuevaTarea.tsx`, `componentes/proyectos/SheetNuevoProyecto.tsx`, `componentes/proyectos/EquipoProyecto.tsx`

**Interfaces:**
- Consumes: todo Task 2.
- Produces: `PipsDificultad({ valor })` (●●●○○ accesible: `aria-label="Dificultad 3 de 5"`); `FilaTarea({ tarea, accion })` fila 44px+: título, pips, botón derecho según contexto ("Tomala" | "Marcá hecha" | nada).

- [ ] **Step 1: `/tareas`** — página "Tareas" con dos secciones: **"Tus tareas"** (de `misTareas`: asignadas primero con "Marcá hecha", después "Del pool de tus proyectos" con "Tomala") y **"Proyectos"** (filas: nombre, `N pendientes · M personas`, tap → detalle; archivados colapsados al final). Botón "Creá un proyecto" (con permiso `proyectos`) abre `SheetNuevoProyecto` (un campo nombre + submit). Vacíos: "Todavía no hay proyectos. Creá el primero y sumá al equipo." / "No tenés tareas pendientes. 🎉" (sin emoji si rompe sobriedad: usar texto "Estás al día.").
- [ ] **Step 2: `/tareas/[proyectoId]`** — guard: `obtenerProyecto` null → `notFound()`. Secciones: **Pool** (FilaTarea con "Tomala"), **Asignadas** (nombre de la persona en `text-tinta-suave`; "Marcá hecha" solo si es mía o soy admin), **Hechas** (últimas 10, tachadas suaves con quién), **Equipo** (`EquipoProyecto`: avatares-iniciales + con permiso `proyectos` agregar/quitar de `listarMiembrosOrg`). Con permiso: "Agregá una tarea" → `SheetNuevaTarea` (titulo, descripcion, selector dificultad 1-5 como 5 pips tocables, asignar a (opcional, default pool)), renombrar y archivar en un menú discreto.
- [ ] **Step 3: Sheets** — mobile: panel fijo inferior (`fixed bottom-0`, `rounded-t-xl`, `bg-superficie`); desktop: panel lateral derecho. Sin dependencias nuevas: estado local + `<form action={...}>`.
- [ ] **Step 4: Build + lint + prueba manual** (`npm run dev`, admin: crear proyecto, crear tareas pool/asignadas, ver detalle). **Commit** — `"feat: UI de proyectos con pool, asignadas y equipo"`

---

### Task 4: Tomar / completar con optimismo y undo

**Files:**
- Create: `componentes/tareas/BotonTomar.tsx`, `componentes/tareas/BotonCompletar.tsx`, `componentes/ui/Toast.tsx`
- Modify: `componentes/tareas/FilaTarea.tsx` (usa los botones)

**Interfaces:**
- Consumes: acciones `tomarTarea`/`soltarTarea`/`completarTarea` (Task 2).
- Produces: `Toast` global simple (portal, abajo, 4s, botón opcional) reutilizable por fases siguientes.

- [ ] **Step 1: `BotonTomar`** (client) — `useTransition`; al tap desaparece la fila optimista (`useOptimistic` en la lista contenedora o estado local en FilaTarea con `hidden`), toast "La tomaste · **Deshacer**" (deshacer → `soltarTarea`, reaparece). Si la acción devuelve error ("Alguien la tomó primero"): toast con ese texto y `router.refresh()`.
- [ ] **Step 2: `BotonCompletar`** — tap → check + fade (150-250ms ease-out) → `completarTarea`; error → toast + refresh. Sin modal.
- [ ] **Step 3: Conflicto real probado** — con dos sesiones (admin y ope) tomar la misma tarea: la segunda ve "Alguien la tomó primero." y la fila sale del pool al refrescar. Documentar en el reporte cómo se probó.
- [ ] **Step 4: Build + lint. Commit** — `"feat: tomar y completar tareas con optimismo, undo y conflicto"`

---

### Task 5: Hoy + track record en Equipo

**Files:**
- Modify: `app/(app)/o/[orgId]/page.tsx` (Hoy: sección "Tus tareas" real), `app/(app)/o/[orgId]/mas/page.tsx` (link a Equipo)
- Create: `app/(app)/o/[orgId]/equipo/page.tsx`, `componentes/equipo/TarjetaPersona.tsx`, `componentes/equipo/FiltrosTrackRecord.tsx`

**Interfaces:**
- Consumes: `misTareas` (Task 2), RPC `track_record` (Task 1), `listarProyectos`.
- Produces: ruta `/o/[orgId]/equipo` con searchParams `?periodo=mes|trimestre|historico&proyecto=<id>`.

- [ ] **Step 1: Hoy** — reemplazar el placeholder de la sección tareas: hasta 5 de `misTareas` (asignadas primero) con sus botones, y link "Ver todas" → `/tareas`. Vacío: "Estás al día. No tenés tareas pendientes."
- [ ] **Step 2: `/equipo`** — sin permiso `equipo`: la RPC devuelve solo la fila propia → título "Tu track record"; con permiso: "Equipo". Chips período (Mes | Trimestre | Histórico; default Mes → `desde` = primer día del mes actual en TZ Buenos Aires; trimestre = 3 meses atrás) y chips de proyecto (de `listarProyectos`). Por persona: nombre, **completadas** (número grande `tabular-nums`), dificultad acumulada y promedio en `text-tinta-suave`. Filas, no grid de cards. Vacío: "Nada completado en este período."
- [ ] **Step 3: Más** — agregar link "Equipo" (ícono Lucide `Users`) siempre visible (la página se autoadapta al permiso).
- [ ] **Step 4: Build + lint + prueba manual con seed** (coordi ve todo con `equipo`; ope solo lo propio). **Commit** — `"feat: track record por persona y Hoy con tareas reales"`

---

### Task 6: Limpieza de shell diferida de fase 1

**Files:**
- Create: `lib/nav.ts`
- Modify: `lib/org.ts`, `componentes/shell/NavInferior.tsx`, `componentes/shell/SidebarEscritorio.tsx`, `componentes/shell/SwitcherOrg.tsx`

- [ ] **Step 1:** Envolver `obtenerContextoOrg` y `listarMisOrgs` en `React.cache()` (import de "react"; firma exportada intacta) — dedup de llamadas por request.
- [ ] **Step 2:** Extraer el array de navegación duplicado a `lib/nav.ts`: `export const ITEMS_NAV: { href: (orgId: string) => string; etiqueta: string; icono: LucideIcon; permiso: keyof Permisos | null }[]` y consumirlo en ambos componentes de nav.
- [ ] **Step 3:** Popover de `SwitcherOrg`: `rounded-lg` → `rounded-xl` (12px, DESIGN.md).
- [ ] **Step 4:** Build + lint + smoke por los 3 roles con `npm run dev` (nav idéntica a antes). **Commit** — `"refactor: nav unificada, contexto cacheado y radios según DESIGN"`

---

### Task 7: Tests de fase 2

**Files:**
- Create: `tests/rls/tareas.test.ts`, `tests/rls/track-record.test.ts`
- Modify: `tests/rls/helpers.ts` (si hace falta un helper de limpieza de tareas)

**Interfaces:**
- Consumes: seed (usuarios demo, proyectos "Sitio nuevo"/"Campaña socios"), RPCs Task 1.

- [ ] **Step 1: `tareas.test.ts`** — con limpieza beforeAll+afterAll vía `clienteAdmin()` de las tareas creadas por el test (titulo con prefijo `[test-f2]`):
  1. Admin (permiso proyectos) crea tarea en pool de "Sitio nuevo" → OK (insert directo pasa por `tareas_gestion`).
  2. Ope (miembro, sin permiso proyectos... ope TIENE proyectos=true; usar **gestora@demo.test**, que no es miembro de proyectos de Fundación Delta) — gestora intenta `insert` directo en ese proyecto → error/0 filas (política).
  3. Carrera de `tomar_tarea`: coordi y ope llaman a la RPC sobre la misma tarea pool — exactamente uno OK y el otro recibe error "Alguien la tomó primero" (usar `Promise.allSettled` y assert 1 éxito + 1 fallo; válido también si por orden secuencial el segundo falla).
  4. `completar_tarea` por alguien no asignado y no admin (coordi sobre tarea de ope) → error "Solo la persona asignada".
  5. `completar_tarea` por la persona asignada → OK y `completada_por` = ella.
- [ ] **Step 2: `track-record.test.ts`**:
  1. Coordi (permiso equipo) → `rpc("track_record", { org })` devuelve ≥2 personas (seed histórico).
  2. Ope (sin equipo) → solo su propia fila.
  3. Filtro `proyecto` con uuid de "Campaña socios" → no incluye completadas de "Sitio nuevo".
- [ ] **Step 3:** `npm test` dos veces — todo verde (12 previos + nuevos). Si un test revela gap real de política/RPC: BLOCKED al controlador, no debilitar.
- [ ] **Step 4: Commit** — `"test: transiciones de tareas y privacidad del track record"`

---

### Task 8: Verificación de fase y deploy

**Files:**
- Modify: `README.md` (sección Fases: fase 2 hecha), `docs/superpowers/specs/2026-07-27-gestion-v1-design.md` (tildar criterios §5.2 cumplidos)

- [ ] **Step 1:** `npm run build && npm run lint && npm run seed && npm test` — todo verde (seed idempotente).
- [ ] **Step 2:** Tildar en el spec los criterios de §5.2 que ahora se cumplen (los tres checkboxes) y anotar en README la fase 2 como completa.
- [ ] **Step 3: Commit + push + deploy** — el controlador hace merge y `vercel deploy --prod --yes` al cierre.

---

## Self-review (hecho al escribir)

- **Cobertura spec §5.2:** CRUD proyectos+equipo (T2/T3), tareas pool/asignadas + tomar + hecha (T1-T4), Mis tareas transversal (T2/T3 + Hoy en T5), track record con filtros sobre completada_por (T1/T5), criterios de aceptación testeados (T7: pool atómico, completada_por, privacidad equipo).
- **Sin placeholders:** SQL completo; contratos de tipos y firmas exactos; copy literal.
- **Consistencia:** nombres RPC/acciones/componentes usados igual entre tasks; `tareas_gestion` referenciada en T7; gestora@demo.test existe (seed fase 1 fix wave).
- **Nota:** el trigger de integridad de reservas (precondición fase 2 anotada en spec §5.3) pertenece a la fase de ESPACIOS/FINANZAS (3-4), no a esta: acá no se toca `reservas`.
