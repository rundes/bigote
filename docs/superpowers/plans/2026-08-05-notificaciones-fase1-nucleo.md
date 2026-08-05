# Notificaciones v2 — Fase 1 (núcleo) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Base de notificaciones: tablas outbox + preferencias + teléfono en perfil, generación transaccional de eventos (reservas, tareas, invitaciones) y página "Perfil y avisos".

**Architecture:** Patrón outbox en Postgres (spec `docs/superpowers/specs/2026-08-05-notificaciones-v2-design.md`). **Enmienda al spec §5:** los eventos se generan con **triggers** sobre `reservas`/`tareas`/`membresias` (no con un helper TS en las server actions): es transaccional (una reserva jamás queda sin su fila outbox), y en fase 5 el bot reutiliza los mismos RPCs, así que hereda la generación sin duplicar lógica. El filtrado por preferencias/canal se hace al encolar, en la función SQL `encolar_notificacion`. Nada envía todavía — enviar es fase 2+.

**Tech Stack:** Next.js App Router + TS estricto, Supabase hosted (ref `olmjkuapainklekdzntk`), migraciones SQL en `supabase/migrations/`, tests Vitest contra la DB hosted (secuenciales, sesiones cacheadas — ver `tests/rls/helpers.ts`).

## Global Constraints

- UI en español rioplatense voseo ("Cargá", "Guardá"); mensajes de error legibles.
- Migraciones: archivo nuevo `0008_notificaciones.sql`; **nunca editar migraciones ya aplicadas**. Aplicar con `npx supabase db push` (proyecto ya linkeado) o MCP de Supabase.
- RLS: `auth.uid()` siempre como `(select auth.uid())`; funciones `security definer` con `set search_path = ''`.
- Tests: `npm test` corre secuencial (`fileParallelism: false`); usuarios seed `admin@demo.test` / `coordi@demo.test` / `ope@demo.test` / `gestora@demo.test`, pass `demo1234`. Flake conocido "JWT issued at future": reintentar.
- Commits en español, estilo del repo (`feat:`, `test:`, `docs:`).
- Deploy: manual, `npx vercel --prod` (no hay integración GitHub).

---

### Task 1: Migración `0008_notificaciones.sql`

**Files:**
- Create: `supabase/migrations/0008_notificaciones.sql`

**Interfaces:**
- Produces: tablas `notificaciones`, `preferencias_notificaciones`, `push_suscripciones`, `wa_mensajes`; columnas `perfiles.telefono`, `tareas.creada_por`; función `encolar_notificacion(destinatario uuid, org uuid, evento text, carga jsonb, programada timestamptz)`; triggers de eventos. Tasks 2–4 testean esto; Task 5 lee/escribe `perfiles.telefono` y `preferencias_notificaciones`.

- [ ] **Step 1: Escribir la migración**

```sql
-- 0008: núcleo de notificaciones (spec 2026-08-05-notificaciones-v2-design.md)

-- Teléfono como identidad ante el bot de WhatsApp (E.164). Nullable; único.
alter table perfiles add column telefono text unique
  check (telefono is null or telefono ~ '^\+[1-9][0-9]{6,14}$');

-- Autor de la tarea, para notificar tarea_hecha. Default: quien inserta.
alter table tareas add column creada_por uuid references perfiles (id)
  default auth.uid();

create table notificaciones (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizaciones (id) on delete cascade,
  usuario_id uuid not null references perfiles (id) on delete cascade,
  evento text not null check (evento in (
    'reserva_confirmada', 'reserva_recordatorio', 'reserva_cancelada',
    'invitacion', 'tarea_asignada', 'tarea_hecha'
  )),
  canal text not null check (canal in ('wa', 'email', 'push')),
  payload jsonb not null default '{}',
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'enviada', 'fallida', 'descartada')),
  programada_para timestamptz,
  intentos int not null default 0,
  creada_en timestamptz not null default now(),
  enviada_en timestamptz
);

create index notificaciones_usuario_idx on notificaciones (usuario_id);
-- El dispatcher siempre busca pendientes por fecha: índice parcial.
create index notificaciones_pendientes_idx on notificaciones (programada_para)
  where estado = 'pendiente';

create table preferencias_notificaciones (
  usuario_id uuid primary key references perfiles (id) on delete cascade,
  wa boolean not null default true,
  email boolean not null default true,
  push boolean not null default true
);

create table push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references perfiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  creada_en timestamptz not null default now()
);

create index push_suscripciones_usuario_idx on push_suscripciones (usuario_id);

create table wa_mensajes (
  id uuid primary key default gen_random_uuid(),
  numero text not null,
  usuario_id uuid references perfiles (id) on delete set null,
  direccion text not null check (direccion in ('entrante', 'saliente')),
  texto text not null,
  creado_en timestamptz not null default now()
);

create index wa_mensajes_numero_idx on wa_mensajes (numero, creado_en desc);

-- RLS. wa_mensajes queda sin políticas: solo service role.
alter table notificaciones enable row level security;
alter table preferencias_notificaciones enable row level security;
alter table push_suscripciones enable row level security;
alter table wa_mensajes enable row level security;

create policy notificaciones_select on notificaciones for select
  using (usuario_id = (select auth.uid()));
-- Sin insert/update/delete para authenticated: el outbox lo escriben los
-- triggers (security definer) y lo procesa el dispatcher (service role).

create policy preferencias_propias on preferencias_notificaciones for all
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));

create policy push_suscripciones_propias on push_suscripciones for all
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));

-- Encola una notificación para un destinatario, una fila por canal activo.
-- Filtra al encolar (spec §4): preferencias (fila ausente = todo on),
-- wa solo con teléfono cargado, push solo con alguna suscripción.
create or replace function public.encolar_notificacion(
  destinatario uuid,
  org uuid,
  evento text,
  carga jsonb,
  programada timestamptz default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pref record;
  tel text;
begin
  select coalesce(p.wa, true) as wa, coalesce(p.email, true) as email,
         coalesce(p.push, true) as push
    into pref
    from (select 1) uno
    left join public.preferencias_notificaciones p on p.usuario_id = destinatario;

  select telefono into tel from public.perfiles where id = destinatario;

  if pref.email then
    insert into public.notificaciones (org_id, usuario_id, evento, canal, payload, programada_para)
    values (org, destinatario, evento, 'email', carga, programada);
  end if;
  if pref.wa and tel is not null then
    insert into public.notificaciones (org_id, usuario_id, evento, canal, payload, programada_para)
    values (org, destinatario, evento, 'wa', carga, programada);
  end if;
  if pref.push and exists (
    select 1 from public.push_suscripciones s where s.usuario_id = destinatario
  ) then
    insert into public.notificaciones (org_id, usuario_id, evento, canal, payload, programada_para)
    values (org, destinatario, evento, 'push', carga, programada);
  end if;
end;
$$;

revoke execute on function public.encolar_notificacion(uuid, uuid, text, jsonb, timestamptz)
  from public, anon, authenticated;

-- ── Reservas ──────────────────────────────────────────────────────────
-- Confirmación + recordatorio (24 h antes, solo si aún falta) al crear.
create or replace function public.notificar_reserva_creada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  carga jsonb;
  org uuid;
  inicio timestamptz;
begin
  if new.para_perfil_id is null then
    return new; -- reserva para cliente externo: no hay perfil que avisar
  end if;

  select jsonb_build_object(
           'reserva_id', new.id, 'sala', s.nombre, 'edificio', e.nombre,
           'fecha', new.fecha, 'hora_inicio', new.hora_inicio, 'horas', new.horas
         ),
         e.org_propietaria_id
    into carga, org
    from public.salas s join public.edificios e on e.id = s.edificio_id
   where s.id = new.sala_id;

  perform public.encolar_notificacion(new.para_perfil_id, org, 'reserva_confirmada', carga);

  inicio := (new.fecha::timestamp + make_interval(hours => new.hora_inicio))
              at time zone 'America/Argentina/Buenos_Aires';
  if inicio - interval '24 hours' > now() then
    perform public.encolar_notificacion(
      new.para_perfil_id, org, 'reserva_recordatorio', carga, inicio - interval '24 hours'
    );
  end if;
  return new;
end;
$$;

create trigger reservas_notificar_creada
  after insert on reservas
  for each row execute function public.notificar_reserva_creada();

-- Cancelación: avisa a quien reservó y a los miembros con permiso espacios
-- de la propietaria y la gestora del edificio. Nunca al autor de la acción.
create or replace function public.notificar_reserva_cancelada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  carga jsonb;
  org uuid;
  actor uuid := auth.uid();
  destinatario uuid;
begin
  select jsonb_build_object(
           'reserva_id', new.id, 'sala', s.nombre, 'edificio', e.nombre,
           'fecha', new.fecha, 'hora_inicio', new.hora_inicio, 'horas', new.horas,
           'motivo', coalesce(new.motivo_cancelacion, '')
         ),
         e.org_propietaria_id
    into carga, org
    from public.salas s join public.edificios e on e.id = s.edificio_id
   where s.id = new.sala_id;

  for destinatario in
    select distinct d from (
      select new.para_perfil_id as d where new.para_perfil_id is not null
      union
      select m.perfil_id
        from public.salas s
        join public.edificios e on e.id = s.edificio_id
        join public.membresias m
          on m.org_id in (e.org_propietaria_id, e.org_gestora_id) and m.activo
        join public.roles r on r.id = m.rol_id
       where s.id = new.sala_id and (r.permisos ->> 'espacios')::boolean
    ) todos where d is distinct from actor
  loop
    perform public.encolar_notificacion(destinatario, org, 'reserva_cancelada', carga);
  end loop;

  -- El recordatorio pendiente de una reserva cancelada no debe salir.
  update public.notificaciones
     set estado = 'descartada'
   where evento = 'reserva_recordatorio' and estado = 'pendiente'
     and (payload ->> 'reserva_id')::uuid = new.id;
  return new;
end;
$$;

create trigger reservas_notificar_cancelada
  after update of estado on reservas
  for each row
  when (old.estado = 'confirmada' and new.estado = 'cancelada')
  execute function public.notificar_reserva_cancelada();

-- ── Tareas ────────────────────────────────────────────────────────────
create or replace function public.notificar_tarea_asignada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  carga jsonb;
  org uuid;
begin
  if new.asignado_a is null or new.asignado_a = auth.uid() then
    return new; -- sin asignado, o se la asignó a sí mismo (tomar)
  end if;
  select jsonb_build_object('tarea_id', new.id, 'titulo', new.titulo, 'proyecto', p.nombre),
         p.org_id
    into carga, org
    from public.proyectos p where p.id = new.proyecto_id;
  perform public.encolar_notificacion(new.asignado_a, org, 'tarea_asignada', carga);
  return new;
end;
$$;

create trigger tareas_notificar_asignada_insert
  after insert on tareas
  for each row execute function public.notificar_tarea_asignada();

create trigger tareas_notificar_asignada_update
  after update of asignado_a on tareas
  for each row
  when (new.asignado_a is not null and new.asignado_a is distinct from old.asignado_a)
  execute function public.notificar_tarea_asignada();

create or replace function public.notificar_tarea_hecha()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  carga jsonb;
  org uuid;
begin
  if new.creada_por is null or new.creada_por = auth.uid()
     or new.creada_por = new.completada_por then
    return new;
  end if;
  select jsonb_build_object('tarea_id', new.id, 'titulo', new.titulo, 'proyecto', p.nombre),
         p.org_id
    into carga, org
    from public.proyectos p where p.id = new.proyecto_id;
  perform public.encolar_notificacion(new.creada_por, org, 'tarea_hecha', carga);
  return new;
end;
$$;

create trigger tareas_notificar_hecha
  after update of estado on tareas
  for each row
  when (old.estado <> 'hecha' and new.estado = 'hecha')
  execute function public.notificar_tarea_hecha();

-- ── Invitaciones ──────────────────────────────────────────────────────
-- El email de invitación lo manda Supabase Auth (flujo invite existente);
-- acá solo wa/push, que solo aplican si el invitado ya tiene perfil con
-- teléfono o suscripción (re-invitación a otra org).
create or replace function public.notificar_invitacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  carga jsonb;
  pref_email boolean;
begin
  if new.perfil_id = auth.uid() then
    return new;
  end if;
  select jsonb_build_object('org', o.nombre, 'rol', r.nombre)
    into carga
    from public.organizaciones o, public.roles r
   where o.id = new.org_id and r.id = new.rol_id;

  -- encolar_notificacion crearía también la fila email; acá no corresponde
  -- (el email ya sale por Supabase). Se encola y se descarta esa fila.
  perform public.encolar_notificacion(new.perfil_id, new.org_id, 'invitacion', carga);
  update public.notificaciones
     set estado = 'descartada'
   where usuario_id = new.perfil_id and evento = 'invitacion' and canal = 'email'
     and estado = 'pendiente' and payload = carga;
  return new;
end;
$$;

create trigger membresias_notificar_invitacion
  after insert on membresias
  for each row execute function public.notificar_invitacion();
```

- [ ] **Step 2: Aplicar contra la DB hosted**

Run: `npx supabase db push`
Expected: `Applying migration 0008_notificaciones.sql... Finished`. Si falla por sintaxis, corregir el archivo y reintentar (la migración no quedó aplicada).

- [ ] **Step 3: Smoke check del esquema**

Run (MCP Supabase `execute_sql` o `npx supabase db diff --linked`):
```sql
select count(*) from notificaciones;
select telefono from perfiles limit 1;
```
Expected: `0` y columna existente, sin errores.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0008_notificaciones.sql
git commit -m "feat: esquema de notificaciones — outbox, preferencias, teléfono y triggers de eventos"
```

---

### Task 2: Tests RLS de las tablas nuevas

**Files:**
- Create: `tests/rls/notificaciones.test.ts`

**Interfaces:**
- Consumes: `clienteAdmin()` y `clienteComo(email)` de `tests/rls/helpers.ts`; tablas de Task 1.

- [ ] **Step 1: Escribir los tests (fallan si la RLS está mal)**

Mirar `tests/rls/equipo.test.ts` para el estilo local (describe/beforeAll). Contenido:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { clienteAdmin, clienteComo } from "./helpers";

// RLS de notificaciones, preferencias y push: cada uno lo suyo, nada ajeno.
// wa_mensajes: invisible para authenticated (sin políticas).
describe("RLS notificaciones", () => {
  const admin = clienteAdmin();
  let adminId: string;
  let coordiId: string;
  let filaAdmin: string;

  beforeAll(async () => {
    const perfiles = await admin
      .from("perfiles")
      .select("id, email")
      .in("email", ["admin@demo.test", "coordi@demo.test"]);
    adminId = perfiles.data!.find((p) => p.email === "admin@demo.test")!.id;
    coordiId = perfiles.data!.find((p) => p.email === "coordi@demo.test")!.id;

    const { data } = await admin
      .from("notificaciones")
      .insert({ usuario_id: adminId, evento: "tarea_asignada", canal: "email", payload: { t: "rls" } })
      .select("id")
      .single();
    filaAdmin = data!.id;
  });

  afterAll(async () => {
    await admin.from("notificaciones").delete().eq("id", filaAdmin);
    await admin.from("preferencias_notificaciones").delete().in("usuario_id", [adminId, coordiId]);
  });

  it("cada usuario ve solo sus notificaciones", async () => {
    const comoAdmin = await clienteComo("admin@demo.test");
    const propias = await comoAdmin.from("notificaciones").select("id").eq("id", filaAdmin);
    expect(propias.data).toHaveLength(1);

    const comoCoordi = await clienteComo("coordi@demo.test");
    const ajenas = await comoCoordi.from("notificaciones").select("id").eq("id", filaAdmin);
    expect(ajenas.data).toHaveLength(0);
  });

  it("authenticated no puede insertar ni actualizar el outbox", async () => {
    const comoCoordi = await clienteComo("coordi@demo.test");
    const insercion = await comoCoordi
      .from("notificaciones")
      .insert({ usuario_id: coordiId, evento: "tarea_asignada", canal: "email" });
    expect(insercion.error).not.toBeNull();

    const cambio = await comoCoordi
      .from("notificaciones")
      .update({ estado: "enviada" })
      .eq("id", filaAdmin)
      .select();
    expect(cambio.data ?? []).toHaveLength(0);
  });

  it("preferencias: upsert propio sí, ajeno no", async () => {
    const comoAdmin = await clienteComo("admin@demo.test");
    const propio = await comoAdmin
      .from("preferencias_notificaciones")
      .upsert({ usuario_id: adminId, wa: false });
    expect(propio.error).toBeNull();

    const ajeno = await comoAdmin
      .from("preferencias_notificaciones")
      .upsert({ usuario_id: coordiId, wa: false });
    expect(ajeno.error).not.toBeNull();

    const comoCoordi = await clienteComo("coordi@demo.test");
    const lectura = await comoCoordi
      .from("preferencias_notificaciones")
      .select("usuario_id")
      .eq("usuario_id", adminId);
    expect(lectura.data).toHaveLength(0);
  });

  it("wa_mensajes es invisible para authenticated", async () => {
    await admin.from("wa_mensajes").insert({
      numero: "+5491100000000", direccion: "entrante", texto: "hola rls",
    });
    const comoAdmin = await clienteComo("admin@demo.test");
    const lectura = await comoAdmin.from("wa_mensajes").select("id");
    expect(lectura.data ?? []).toHaveLength(0);
    await admin.from("wa_mensajes").delete().eq("numero", "+5491100000000");
  });

  it("teléfono: el propio se edita, el formato inválido se rechaza", async () => {
    const comoAdmin = await clienteComo("admin@demo.test");
    const valido = await comoAdmin
      .from("perfiles")
      .update({ telefono: "+5491133344455" })
      .eq("id", adminId)
      .select("telefono");
    expect(valido.error).toBeNull();
    expect(valido.data![0].telefono).toBe("+5491133344455");

    const invalido = await comoAdmin
      .from("perfiles")
      .update({ telefono: "1133344455" })
      .eq("id", adminId);
    expect(invalido.error).not.toBeNull();

    await admin.from("perfiles").update({ telefono: null }).eq("id", adminId);
  });
});
```

- [ ] **Step 2: Correr y verificar verde**

Run: `npx vitest run tests/rls/notificaciones.test.ts`
Expected: 5 tests PASS. Si falla una política, el fix va en **migración nueva** `0009_fix_rls.sql`, nunca editando la 0008 aplicada.

- [ ] **Step 3: Commit**

```bash
git add tests/rls/notificaciones.test.ts
git commit -m "test: RLS de notificaciones, preferencias, push y wa_mensajes"
```

---

### Task 3: Tests de triggers — reservas

**Files:**
- Create: `tests/rls/notificaciones-reservas.test.ts`

**Interfaces:**
- Consumes: triggers de Task 1; RPCs existentes `crear_reserva(sala, plan, dia, inicio, duracion, cliente)` y `cancelar_reserva(reserva, motivo)`; patrón de setup de `tests/rls/crear-reserva.test.ts` (de ahí salen sala y plan del seed).

- [ ] **Step 1: Escribir los tests**

Antes de escribir, leer `tests/rls/crear-reserva.test.ts` y copiar su forma de elegir sala/plan del seed y de limpiar reservas creadas. Esqueleto (ajustar nombres de seed a lo que use ese archivo):

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { clienteAdmin, clienteComo } from "./helpers";

// Los triggers de 0008 encolan confirmación + recordatorio al reservar y
// avisos al cancelar, filtrando por preferencias/teléfono al encolar.
describe("triggers de notificaciones: reservas", () => {
  const admin = clienteAdmin();
  let adminId: string;
  let salaId: string;
  let planId: string;
  const reservasCreadas: string[] = [];

  beforeAll(async () => {
    const { data: perfil } = await admin
      .from("perfiles").select("id").eq("email", "admin@demo.test").single();
    adminId = perfil!.id;
    // Igual que en crear-reserva.test.ts: primera sala con su plan
    const { data: sala } = await admin
      .from("salas").select("id, edificio_id").limit(1).single();
    salaId = sala!.id;
    const { data: plan } = await admin
      .from("planes_reserva").select("id").limit(1).single();
    planId = plan!.id;
  });

  afterAll(async () => {
    for (const id of reservasCreadas) {
      await admin.from("notificaciones").delete().eq("payload->>reserva_id", id);
    }
    if (reservasCreadas.length) {
      await admin.from("reservas").delete().in("id", reservasCreadas);
    }
    await admin.from("preferencias_notificaciones").delete().eq("usuario_id", adminId);
    await admin.from("perfiles").update({ telefono: null }).eq("id", adminId);
  });

  async function reservar(dia: string): Promise<string> {
    const comoAdmin = await clienteComo("admin@demo.test");
    const { error } = await comoAdmin.rpc("crear_reserva", {
      sala: salaId, plan: planId, dia, inicio: 10, duracion: 2, cliente: null,
    });
    expect(error).toBeNull();
    const { data } = await admin
      .from("reservas").select("id").eq("sala_id", salaId).eq("fecha", dia).single();
    reservasCreadas.push(data!.id);
    return data!.id;
  }

  function fechaFutura(dias: number): string {
    const d = new Date(Date.now() + dias * 86400000);
    return d.toISOString().slice(0, 10);
  }

  it("reservar encola confirmación email + recordatorio 24 h antes", async () => {
    const reservaId = await reservar(fechaFutura(7));
    const { data: filas } = await admin
      .from("notificaciones")
      .select("evento, canal, estado, programada_para, payload")
      .eq("usuario_id", adminId)
      .eq("payload->>reserva_id", reservaId);

    const confirmada = filas!.find((f) => f.evento === "reserva_confirmada");
    expect(confirmada).toBeDefined();
    expect(confirmada!.canal).toBe("email"); // sin teléfono ni push: solo email
    expect(confirmada!.estado).toBe("pendiente");

    const recordatorio = filas!.find((f) => f.evento === "reserva_recordatorio");
    expect(recordatorio).toBeDefined();
    expect(new Date(recordatorio!.programada_para!).getTime()).toBeLessThan(
      Date.now() + 7 * 86400000
    );
  });

  it("con teléfono cargado también encola canal wa", async () => {
    await admin.from("perfiles").update({ telefono: "+5491155566677" }).eq("id", adminId);
    const reservaId = await reservar(fechaFutura(8));
    const { data: filas } = await admin
      .from("notificaciones")
      .select("canal")
      .eq("payload->>reserva_id", reservaId)
      .eq("evento", "reserva_confirmada");
    expect(filas!.map((f) => f.canal).sort()).toEqual(["email", "wa"]);
  });

  it("preferencia email off: no encola email", async () => {
    await admin.from("preferencias_notificaciones")
      .upsert({ usuario_id: adminId, email: false, wa: false });
    const reservaId = await reservar(fechaFutura(9));
    const { data: filas } = await admin
      .from("notificaciones").select("canal").eq("payload->>reserva_id", reservaId);
    expect(filas).toHaveLength(0);
    await admin.from("preferencias_notificaciones").delete().eq("usuario_id", adminId);
  });

  it("cancelar descarta el recordatorio y avisa sin incluir al autor", async () => {
    const reservaId = await reservar(fechaFutura(10));
    const comoAdmin = await clienteComo("admin@demo.test");
    const { error } = await comoAdmin.rpc("cancelar_reserva", {
      reserva: reservaId, motivo: "test triggers",
    });
    expect(error).toBeNull();

    const { data: recordatorios } = await admin
      .from("notificaciones")
      .select("estado")
      .eq("evento", "reserva_recordatorio")
      .eq("payload->>reserva_id", reservaId);
    expect(recordatorios!.every((r) => r.estado === "descartada")).toBe(true);

    // admin canceló su propia reserva: no se avisa a sí mismo
    const { data: canceladas } = await admin
      .from("notificaciones")
      .select("usuario_id")
      .eq("evento", "reserva_cancelada")
      .eq("payload->>reserva_id", reservaId);
    expect(canceladas!.every((c) => c.usuario_id !== adminId)).toBe(true);
  });
});
```

Nota de limpieza: el `afterAll` borra por `reserva_id` de payload; si `crear_reserva` generó movimientos, borrar como en `crear-reserva.test.ts` (mirar su afterAll y replicar).

- [ ] **Step 2: Correr y verificar verde**

Run: `npx vitest run tests/rls/notificaciones-reservas.test.ts`
Expected: 4 tests PASS. Un fix de trigger va en migración nueva `0009_...`.

- [ ] **Step 3: Commit**

```bash
git add tests/rls/notificaciones-reservas.test.ts
git commit -m "test: triggers de notificaciones de reservas"
```

---

### Task 4: Tests de triggers — tareas e invitaciones

**Files:**
- Create: `tests/rls/notificaciones-tareas.test.ts`

**Interfaces:**
- Consumes: triggers de Task 1; RPC `completar_tarea(tarea)`; seed: proyecto con admin y coordi como miembros (mirar `tests/rls/tareas.test.ts` para obtener proyecto y membresías del seed).

- [ ] **Step 1: Escribir los tests**

Leer primero `tests/rls/tareas.test.ts` para el setup del proyecto seed. Contenido:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { clienteAdmin, clienteComo } from "./helpers";

describe("triggers de notificaciones: tareas", () => {
  const admin = clienteAdmin();
  let adminId: string;
  let coordiId: string;
  let proyectoId: string;
  const tareasCreadas: string[] = [];

  beforeAll(async () => {
    const { data: perfiles } = await admin
      .from("perfiles").select("id, email")
      .in("email", ["admin@demo.test", "coordi@demo.test"]);
    adminId = perfiles!.find((p) => p.email === "admin@demo.test")!.id;
    coordiId = perfiles!.find((p) => p.email === "coordi@demo.test")!.id;
    // proyecto del seed donde ambos son miembros (mismo criterio que tareas.test.ts)
    const { data: pm } = await admin
      .from("proyecto_miembros").select("proyecto_id").eq("perfil_id", coordiId).limit(1);
    proyectoId = pm![0].proyecto_id;
  });

  afterAll(async () => {
    if (tareasCreadas.length) {
      for (const id of tareasCreadas) {
        await admin.from("notificaciones").delete().eq("payload->>tarea_id", id);
      }
      await admin.from("tareas").delete().in("id", tareasCreadas);
    }
  });

  async function crearTareaComo(email: string, asignado: string | null): Promise<string> {
    const cliente = await clienteComo(email);
    const { data, error } = await cliente
      .from("tareas")
      .insert({ proyecto_id: proyectoId, titulo: "test notif", dificultad: 1, asignado_a: asignado })
      .select("id, creada_por")
      .single();
    expect(error).toBeNull();
    tareasCreadas.push(data!.id);
    return data!.id;
  }

  it("asignar a otro encola tarea_asignada; creada_por queda seteado", async () => {
    const tareaId = await crearTareaComo("admin@demo.test", coordiId);
    const { data: tarea } = await admin
      .from("tareas").select("creada_por").eq("id", tareaId).single();
    expect(tarea!.creada_por).toBe(adminId);

    const { data: filas } = await admin
      .from("notificaciones")
      .select("usuario_id, evento")
      .eq("payload->>tarea_id", tareaId);
    expect(filas!.some((f) => f.evento === "tarea_asignada" && f.usuario_id === coordiId)).toBe(true);
  });

  it("tarea sin asignado no encola nada", async () => {
    const tareaId = await crearTareaComo("admin@demo.test", null);
    const { data: filas } = await admin
      .from("notificaciones").select("id").eq("payload->>tarea_id", tareaId);
    expect(filas).toHaveLength(0);
  });

  it("completar tarea ajena avisa al creador; completar propia no", async () => {
    const ajena = await crearTareaComo("admin@demo.test", coordiId);
    const comoCoordi = await clienteComo("coordi@demo.test");
    await comoCoordi.rpc("tomar_tarea", { tarea: ajena }).then(() => {});
    const { error } = await comoCoordi.rpc("completar_tarea", { tarea: ajena });
    expect(error).toBeNull();
    const { data: filas } = await admin
      .from("notificaciones")
      .select("usuario_id, evento")
      .eq("payload->>tarea_id", ajena)
      .eq("evento", "tarea_hecha");
    expect(filas!.some((f) => f.usuario_id === adminId)).toBe(true);

    const propia = await crearTareaComo("admin@demo.test", null);
    const comoAdmin = await clienteComo("admin@demo.test");
    await comoAdmin.rpc("tomar_tarea", { tarea: propia });
    await comoAdmin.rpc("completar_tarea", { tarea: propia });
    const { data: filasPropia } = await admin
      .from("notificaciones")
      .select("id").eq("payload->>tarea_id", propia).eq("evento", "tarea_hecha");
    expect(filasPropia).toHaveLength(0);
  });

  it("alta de membresía encola invitación wa (con teléfono) y descarta email", async () => {
    // org donde coordi todavía no es miembro (admin pertenece a las dos del seed)
    const { data: orgs } = await admin.from("organizaciones").select("id");
    const { data: mias } = await admin
      .from("membresias").select("org_id").eq("perfil_id", coordiId);
    const orgNueva = orgs!.find((o) => !mias!.some((m) => m.org_id === o.id))!.id;
    const { data: rol } = await admin
      .from("roles").select("id").eq("org_id", orgNueva).limit(1).single();

    await admin.from("perfiles").update({ telefono: "+5491177788899" }).eq("id", coordiId);
    const { error } = await admin
      .from("membresias")
      .insert({ org_id: orgNueva, perfil_id: coordiId, rol_id: rol!.id });
    expect(error).toBeNull();

    const { data: filas } = await admin
      .from("notificaciones")
      .select("canal, estado")
      .eq("usuario_id", coordiId)
      .eq("evento", "invitacion");
    expect(filas!.some((f) => f.canal === "wa" && f.estado === "pendiente")).toBe(true);
    expect(filas!.filter((f) => f.canal === "email").every((f) => f.estado === "descartada")).toBe(true);

    // limpieza
    await admin.from("membresias").delete()
      .eq("org_id", orgNueva).eq("perfil_id", coordiId);
    await admin.from("notificaciones").delete()
      .eq("usuario_id", coordiId).eq("evento", "invitacion");
    await admin.from("perfiles").update({ telefono: null }).eq("id", coordiId);
  });
});
```

Nota: si el RPC de tomar tarea tiene otro nombre o firma (verificar en `supabase/migrations/0004_tareas_rpc.sql`), ajustar la llamada `tomar_tarea`. Si el trigger de asignación también dispara al tomar (self-assign), el propio trigger lo filtra por `auth.uid()` — verificado por el test de "completar propia".

- [ ] **Step 2: Correr y verificar verde**

Run: `npx vitest run tests/rls/notificaciones-tareas.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 3: Correr la suite entera (regresiones)**

Run: `npm test`
Expected: todo verde (incluidos los 42 previos + nuevos). Flake "JWT issued at future": reintentar la corrida.

- [ ] **Step 4: Commit**

```bash
git add tests/rls/notificaciones-tareas.test.ts
git commit -m "test: triggers de notificaciones de tareas e invitaciones"
```

---

### Task 5: Página "Perfil y avisos"

**Files:**
- Create: `app/(app)/o/[orgId]/mas/perfil/page.tsx`
- Create: `app/(app)/o/[orgId]/mas/perfil/FormPerfil.tsx`
- Create: `app/(app)/o/[orgId]/mas/perfil/acciones.ts`
- Modify: `app/(app)/o/[orgId]/mas/page.tsx` (agregar link)

**Interfaces:**
- Consumes: `obtenerContextoOrg(orgId)` de `@/lib/org` (→ `{ org, permisos, perfilId }`); `crearClienteServidor()` de `@/lib/supabase/server`; tablas `perfiles` (update propio vía RLS) y `preferencias_notificaciones` (upsert propio vía RLS).
- Produces: acciones `guardarPerfil(orgId, formData)` y `guardarPreferencias(orgId, formData)`, ambas `Promise<{ error?: string }>`.

- [ ] **Step 1: Acciones**

`acciones.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";
import { obtenerContextoOrg } from "@/lib/org";

type Resultado = { error?: string };

export async function guardarPerfil(orgId: string, formData: FormData): Promise<Resultado> {
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto) return { error: "No tenés acceso." };

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { error: "El nombre es obligatorio." };

  const crudo = String(formData.get("telefono") ?? "").trim();
  const limpio = crudo.replace(/[\s\-()]/g, "");
  if (limpio && !/^\+[1-9][0-9]{6,14}$/.test(limpio)) {
    return { error: "El teléfono va con código de país, tipo +549115555555." };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("perfiles")
    .update({ nombre, telefono: limpio || null })
    .eq("id", contexto.perfilId);
  if (error) {
    if (error.code === "23505") return { error: "Ese teléfono ya está en otra cuenta." };
    return { error: error.message };
  }

  revalidatePath(`/o/${orgId}/mas/perfil`);
  return {};
}

export async function guardarPreferencias(orgId: string, formData: FormData): Promise<Resultado> {
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto) return { error: "No tenés acceso." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("preferencias_notificaciones").upsert({
    usuario_id: contexto.perfilId,
    wa: formData.get("wa") === "on",
    email: formData.get("email") === "on",
    push: formData.get("push") === "on",
  });
  if (error) return { error: error.message };

  revalidatePath(`/o/${orgId}/mas/perfil`);
  return {};
}
```

- [ ] **Step 2: Página (server component)**

`page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { obtenerContextoOrg } from "@/lib/org";
import { crearClienteServidor } from "@/lib/supabase/server";
import { FormPerfil } from "./FormPerfil";

export default async function PaginaPerfil({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto) redirect("/");

  const supabase = await crearClienteServidor();
  const [{ data: perfil }, { data: prefs }] = await Promise.all([
    supabase.from("perfiles").select("nombre, email, telefono").eq("id", contexto.perfilId).single(),
    supabase
      .from("preferencias_notificaciones")
      .select("wa, email, push")
      .eq("usuario_id", contexto.perfilId)
      .maybeSingle(),
  ]);
  if (!perfil) redirect("/");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-tinta">Perfil y avisos</h1>
      <FormPerfil
        orgId={orgId}
        perfil={perfil}
        preferencias={prefs ?? { wa: true, email: true, push: true }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Formulario (client component)**

`FormPerfil.tsx` — seguir el estilo de inputs/botones de `app/(auth)/ingresar/FormIngreso.tsx` (clases `text-tinta`, `text-tinta-suave`, mismos tokens de DESIGN.md):

```tsx
"use client";

import { useState, useTransition } from "react";
import { guardarPerfil, guardarPreferencias } from "./acciones";

type Props = {
  orgId: string;
  perfil: { nombre: string; email: string; telefono: string | null };
  preferencias: { wa: boolean; email: boolean; push: boolean };
};

const CANALES = [
  { clave: "wa", etiqueta: "WhatsApp" },
  { clave: "email", etiqueta: "Email" },
  { clave: "push", etiqueta: "Push en este dispositivo" },
] as const;

export function FormPerfil({ orgId, perfil, preferencias }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function enviar(accion: (o: string, f: FormData) => Promise<{ error?: string }>) {
    return (formData: FormData) =>
      startTransition(async () => {
        setError(null);
        setGuardado(null);
        const resultado = await accion(orgId, formData);
        if (resultado.error) setError(resultado.error);
        else setGuardado("Listo, guardado.");
      });
  }

  return (
    <div className="flex max-w-sm flex-col gap-8">
      <form action={enviar(guardarPerfil)} className="flex flex-col gap-3">
        <label className="text-sm font-medium text-tinta" htmlFor="nombre">Nombre</label>
        <input id="nombre" name="nombre" defaultValue={perfil.nombre} className="h-11 rounded-lg border border-borde bg-white px-3 text-sm" />
        <p className="text-xs text-tinta-suave">{perfil.email}</p>
        <label className="text-sm font-medium text-tinta" htmlFor="telefono">Teléfono (WhatsApp)</label>
        <input
          id="telefono" name="telefono" type="tel" inputMode="tel"
          defaultValue={perfil.telefono ?? ""} placeholder="+549115555555"
          className="h-11 rounded-lg border border-borde bg-white px-3 text-sm"
        />
        <p className="text-xs text-tinta-suave">
          Con código de país. Es el número desde el que vas a hablar con el bot.
        </p>
        <button disabled={pendiente} className="h-11 rounded-lg bg-acento text-sm font-semibold text-white">
          {pendiente ? "Guardando…" : "Guardá los cambios"}
        </button>
      </form>

      <form action={enviar(guardarPreferencias)} className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-tinta">Avisos</h2>
        {CANALES.map((canal) => (
          <label key={canal.clave} className="flex h-11 items-center justify-between text-sm text-tinta">
            {canal.etiqueta}
            <input
              type="checkbox" name={canal.clave}
              defaultChecked={preferencias[canal.clave]}
              className="h-5 w-5 accent-acento"
            />
          </label>
        ))}
        <p className="text-xs text-tinta-suave">
          Reservas, invitaciones y tareas. Los avisos empiezan a llegar en las
          próximas fases; tus preferencias ya quedan guardadas.
        </p>
        <button disabled={pendiente} className="h-11 rounded-lg bg-acento text-sm font-semibold text-white">
          {pendiente ? "Guardando…" : "Guardá los avisos"}
        </button>
      </form>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {guardado && !error && <p className="text-sm text-tinta-suave">{guardado}</p>}
    </div>
  );
}
```

Ajustar clases a los tokens reales del proyecto (revisar `tailwind.config` / `DESIGN.md`: `borde`, `acento`, etc. — usar los nombres que existan; si un token no existe, copiar las clases de un form existente como `FormIngreso.tsx`).

- [ ] **Step 4: Link en "Más"**

En `app/(app)/o/[orgId]/mas/page.tsx`, junto a los links existentes (mismo patrón `flex h-11 items-center gap-3`), primero de la lista:

```tsx
<Link
  href={`/o/${orgId}/mas/perfil`}
  className="flex h-11 items-center gap-3 text-sm font-medium text-tinta"
>
  <UserRound size={20} strokeWidth={1.75} />
  Perfil y avisos
</Link>
```

Import: agregar `UserRound` al import de `lucide-react`.

- [ ] **Step 5: Build + prueba manual**

Run: `npm run build`
Expected: build verde, ruta `ƒ /o/[orgId]/mas/perfil` listada.

Manual (`npm run dev`, `admin@demo.test` / `demo1234`): Más → Perfil y avisos; cargar teléfono `+549115555555` → "Listo, guardado."; teléfono `123` → error de formato; apagar WhatsApp y guardar → recargar y ver el toggle apagado. Viewport 380 px usable.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/o/[orgId]/mas/perfil" "app/(app)/o/[orgId]/mas/page.tsx"
git commit -m "feat: página de perfil y avisos — teléfono y preferencias de canales"
```

---

### Task 6: Enmienda del spec, README, versión y deploy

**Files:**
- Modify: `docs/superpowers/specs/2026-08-05-notificaciones-v2-design.md` (§5)
- Modify: `README.md` (sección de estado/fases)
- Modify: `package.json` (version)

- [ ] **Step 1: Enmendar spec §5**

Reemplazar el párrafo de §5 ("Generación de eventos") por:

```markdown
## 5. Generación de eventos

**(Enmendado en fase 1.)** Triggers en Postgres sobre `reservas` (insert → confirmada + recordatorio; estado → cancelada), `tareas` (insert/update de asignado → asignada; estado hecha → hecha) y `membresias` (insert → invitación), que llaman a `encolar_notificacion()`: resuelve preferencias, teléfono y suscripciones del destinatario e inserta las filas outbox en la misma transacción. Regla: nunca se notifica al autor de la acción (salvo confirmación y recordatorio de reserva propia, que son un comprobante). Motivo del cambio respecto del helper TS: transaccionalidad garantizada y reutilización directa por el bot de fase 5, que escribe por los mismos RPCs.
```

- [ ] **Step 2: README y versión**

- README: en la sección de estado, agregar línea "v2 en curso — fase 1 (núcleo de notificaciones) completa: outbox + triggers + perfil y avisos. Spec: `docs/superpowers/specs/2026-08-05-notificaciones-v2-design.md`."
- `package.json`: `"version": "1.1.0"` (la versión ya se muestra en login y Más vía `lib/version.ts`; no hay más nada que tocar).

- [ ] **Step 3: Verificación final completa**

Run: `npm run build && npm test`
Expected: build verde, suite entera verde.

- [ ] **Step 4: Commit + push + deploy**

```bash
git add -A
git commit -m "docs: fase 1 de notificaciones cerrada — spec enmendado, README y v1.1.0"
git push
npx vercel --prod
```

Expected: deploy Ready. Verificar `https://bigote-gilt.vercel.app` → login muestra `v1.1.0`.
