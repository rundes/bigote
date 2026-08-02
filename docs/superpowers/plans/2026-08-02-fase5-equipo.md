# Fase 5 — Equipo, roles y cierre de v1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar v1 (spec §5.5 + restos de §5.1 + §8): invitar miembros por email con rol, cambiar rol, desactivar/reactivar sin borrar historial, editor de roles y permisos (solo `admin`), estados de carga y error del shell, tests de RLS de equipo y aislamiento §5.1, y verificación final del Definition of done.

**Architecture:** La gestión de miembros reusa la infraestructura de invitación de `/plataforma` (`inviteUserByEmail` + fallback a usuario existente por email). Las mutaciones de `membresias`/`roles` van por server actions con guard `admin` en JS **y** las políticas RLS existentes (`membresias_admin`, `roles_admin`) como segunda línea. Guard anti-lockout en las actions: ninguna operación puede dejar a la org sin al menos un miembro activo con permiso `admin`. Desactivar = `activo=false` (la membresía y el historial quedan; `es_miembro` ya la excluye, así que el acceso muere solo).

**Tech Stack:** El existente. Sin migraciones nuevas (las políticas de fase 1 ya cubren membresias/roles).

## Global Constraints

- TypeScript estricto; ESLint sin errores; `npm run build && npm run lint && npm test` verdes al cierre de cada task que toque código.
- UI español rioplatense voseo: "Invitá a alguien", "Desactivala", "Sin acceso desde hoy; el historial queda".
- Tokens DESIGN.md; sheets mobile/panel desktop; filas con separadores; targets ≥44px; skeletons con la forma del contenido.
- Commits en español, body termina: Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
- Interfaces existentes: `obtenerContextoOrg`, `listarMiembrosOrg` (lib/proyectos.ts), patrón invite de `app/plataforma/acciones.ts`, `ProveedorToast`.

---

### Task 1: Datos y acciones de equipo y roles

**Files:**
- Create: `lib/equipo.ts`, `app/(app)/o/[orgId]/equipo/acciones.ts`

**Interfaces:**
- Produces (lib/equipo.ts, server-side):
  - `type Miembro = { perfil_id: string; nombre: string; email: string; activo: boolean; rol_id: string; rol_nombre: string; es_admin: boolean }`
  - `type Rol = { id: string; nombre: string; permisos: Permisos }`
  - `listarMiembros(orgId): Promise<Miembro[]>` (activos primero, después inactivos; join membresias + perfiles + roles)
  - `listarRoles(orgId): Promise<Rol[]>`
- Produces (acciones.ts, "use server", guard `permisos.admin`, revalidatePath `/o/[orgId]/equipo` y `/o/[orgId]/roles`):
  - `invitarMiembro(orgId, formData)` — email + rol_id (validado contra la org). `inviteUserByEmail` con redirect a `/auth/confirm`; si ya está registrado (422), lo ubica por email. Membresía: si no existe → insert activa; si existe inactiva → reactivar con ese rol; si existe activa → error "Ya es parte de la organización."
  - `cambiarRol(orgId, perfilId, rolId)` — con guard anti-lockout.
  - `desactivarMiembro(orgId, perfilId)` — `activo=false`, guard anti-lockout. `reactivarMiembro(orgId, perfilId)`.
  - Anti-lockout: contar miembros activos cuyo rol tiene `admin=true` **después** de la operación simulada; si queda 0 → error "La organización no puede quedar sin administración."
  - `crearRol(orgId, formData)` / `editarRol(orgId, rolId, formData)` — nombre + 5 checkboxes de permisos; editar un rol quitándole `admin` también pasa por el guard anti-lockout (si era el único rol admin con miembros activos).
- [ ] **Step 1:** Implementar ambos archivos.
- [ ] **Step 2:** `npm run build && npm run lint` limpios.
- [ ] **Step 3: Commit** — `"feat: datos y acciones de equipo y roles con guard anti-lockout"`

---

### Task 2: UI de miembros y editor de roles

**Files:**
- Modify: `app/(app)/o/[orgId]/equipo/page.tsx` (suma sección Miembros), `app/(app)/o/[orgId]/mas/page.tsx` (link Roles solo admin)
- Create: `app/(app)/o/[orgId]/roles/page.tsx`, `componentes/equipo/ListaMiembros.tsx`, `componentes/equipo/SheetInvitar.tsx`, `componentes/equipo/SheetRol.tsx`

- [ ] **Step 1: Sección "Miembros" en `/equipo`** — debajo del track record. Visible para todo miembro (la lista ya la expone `membresias_select`): filas nombre + email en `text-tinta-suave` + rol; inactivos al final, atenuados, con nota "Sin acceso". Con permiso `admin`: botón "Invitá a alguien" (`SheetInvitar`: email + select de rol), select de rol inline por fila (onChange → `cambiarRol` + toast), botón "Desactivala"/"Reactivala" (desactivar confirma en sheet chico con copy "Pierde el acceso; el historial queda."). Errores (anti-lockout, ya es parte) → toast.
- [ ] **Step 2: `/roles`** — solo `admin` (sin permiso → redirect `/o/[orgId]/sin-acceso`). Lista de roles: nombre + permisos activos como chips chicos ("proyectos · equipo · admin"). "Creá un rol" y editar por fila → `SheetRol`: nombre + 5 checkboxes con etiquetas claras (Proyectos y tareas / Equipo y track record / Finanzas / Espacios / Administración total). Nota fija: "Administración incluye gestionar miembros y roles."
- [ ] **Step 3: Más** — agregar link "Roles y permisos" (ícono `ShieldCheck`) visible solo con `admin`; sacar el "próximamente".
- [ ] **Step 4:** Build + lint + prueba manual (invitar email nuevo, cambiar rol, desactivar y verificar con ese usuario que pierde acceso, editar rol). **Commit** — `"feat: gestión de miembros y editor de roles"`

---

### Task 3: Estados de carga y error del shell

**Files:**
- Create: `app/(app)/o/[orgId]/loading.tsx`, `app/(app)/o/[orgId]/error.tsx`

- [ ] **Step 1: `loading.tsx`** — skeleton neutro con la forma del contenido (barra de título + 4-5 filas `animate-pulse` sobre `bg-panel` redondeadas). Se aplica a todas las rutas del shell que no definan uno propio.
- [ ] **Step 2: `error.tsx`** — client boundary: "Algo salió mal." + detalle genérico + botón "Probá de nuevo" (`reset()`), tokens DESIGN.
- [ ] **Step 3:** Build + lint. Revisión responsive 380px de las pantallas nuevas (miembros, roles) y de finanzas/espacios (chips wrap, sin overflow horizontal salvo la grilla que ya scrollea). **Commit** — `"feat: estados de carga y error del shell"`

---

### Task 4: Tests de fase 5

**Files:**
- Create: `tests/rls/equipo.test.ts`
- Modify: `tests/rls/tercera-org.test.ts` (criterio §5.1 completo)

- [ ] **Step 1: `equipo.test.ts`** — con org efímera "Org Equipo [test-f5]" + dos usuarios efímeros (admin propio y miembro raso, patrón de tercera-org):
  1. coordi de Fundación Delta (sin `admin`) intenta `update` de una membresía ajena y de un rol → 0 filas / error (políticas `membresias_admin`, `roles_admin`).
  2. Miembro raso de la org efímera ve la lista de miembros (select) pero no puede mutarla.
  3. Desactivación mata el acceso: admin (service role) pone `activo=false` al miembro raso → ese usuario deja de ver la org, sus proyectos y sus miembros (es_miembro excluye inactivos). Reactivar lo restituye.
- [ ] **Step 2: `tercera-org.test.ts`** — sumar test §5.1: el usuario de la org tercera no lee **nada** de Fundación Delta por API directa: `proyectos`, `tareas`, `clientes`, `movimientos`, `planes_reserva`, `roles` → todas vacías.
- [ ] **Step 3:** `npm test` dos veces — todo verde. **Commit** — `"test: RLS de equipo, desactivación y aislamiento completo entre orgs"`

---

### Task 5: Verificación final de v1 y deploy

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-07-27-gestion-v1-design.md`

- [ ] **Step 1:** `npm run build && npm run lint && npm run seed && npm test` — todo verde.
- [ ] **Step 2:** Spec: tildar en §5.1 el criterio de RLS (test de tercera org); dejar sin tildar switcher e identity linking con nota "(verificación manual: requiere Google OAuth configurado en el Dashboard)". §8 Definition of done: tildar lo cumplido (TS estricto, RLS testeada, solapamiento+reparto, estados, README, seed); responsive y los manuales quedan anotados. README: fase 5 completa, estructura actualizada (equipo/roles), sección de fases cerrada como v1.
- [ ] **Step 3: Commit + push + deploy** — push a main y `vercel deploy --prod --yes`.

---

## Self-review (hecho al escribir)

- **Cobertura §5.5:** invitar con rol (T1/T2), desactivar sin borrar historial (activo=false, T1/T4), editor de roles solo admin (T1/T2), panel plataforma ya existente de fase 1.
- **§5.1 restante:** el criterio testeable por API (aislamiento) se cierra en T4; los dos criterios interactivos (switcher, identity linking) dependen de la config manual de auth del Dashboard y quedan anotados como verificación manual.
- **Anti-lockout:** cubierto en cambiarRol, desactivar y editarRol — los tres caminos que pueden dejar a la org sin admin.
- **Sin migraciones:** membresias/roles ya tienen políticas correctas desde 0002; se verifica por test en vez de re-escribir.
