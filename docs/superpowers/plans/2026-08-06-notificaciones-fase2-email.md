# Notificaciones v2 — Fase 2 (email) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El outbox de fase 1 empieza a enviar: dispatcher de emails vía Resend, disparado cada 5 min por pg_cron, con claim atómico, reintentos y re-chequeo de preferencias.

**Architecture:** Route handler en Next (`/api/notificaciones/despachar`, protegido por `CRON_SECRET`) procesa el outbox con service role: rescata filas colgadas, reclama un lote con `reclamar_notificaciones()` (SQL, `FOR UPDATE SKIP LOCKED`, estado nuevo `enviando`), re-chequea preferencias/vencimiento para filas programadas (spec §13), renderiza templates de texto y envía por la API HTTP de Resend (fetch directo, sin SDK). pg_cron + pg_net en Supabase disparan el endpoint cada 5 min (**enmienda a §6**: Vercel Cron del plan hobby solo permite frecuencia diaria). Migración 0009 agrupa además lo que §13 dejó listado: `reserva_id` como columna, firma de `encolar_notificacion` con filtro de canales, `ultimo_error`, y guard de `tareas.creada_por`.

**Tech Stack:** Next.js App Router + TS estricto; Supabase hosted (pg_cron, pg_net); Resend HTTP API; Vitest.

## Global Constraints

- Migraciones: archivos nuevos `0009_despacho.sql` y `0010_cron_despacho.sql`; **nunca editar 0001–0008**. `npx supabase db push` NO funciona en este repo: aplicar vía Management API (`POST https://api.supabase.com/v1/projects/olmjkuapainklekdzntk/database/query` con el SQL, + insert en `supabase_migrations.schema_migrations (version, name, statements)` con version timestamp `YYYYMMDDHHMMSS`, statements `array[$mig$...$mig$]`). Token del CLI ya logueado; si falta, pedirlo al usuario.
- RLS/SQL: `(select auth.uid())` en políticas; funciones `security definer` con `set search_path = ''`; revoke execute de funciones internas para `public, anon, authenticated`.
- Requisitos spec §13 (obligatorios): re-chequeo de preferencias (y teléfono para wa) antes de enviar filas con `programada_para` no nulo; claim atómico `UPDATE...RETURNING` (nunca SELECT+UPDATE); routing de `reserva_cancelada` sin depender de `org_id` (los emails de esta fase linkean a la raíz `https://bigote-gilt.vercel.app`, sin deep-link por org).
- Emails: texto plano, español rioplatense voseo, remitente `EMAIL_FROM` (env; arranca `bigote <onboarding@resend.dev>`, pasa a `bigote <avisos@tronador.net.ar>` al verificar dominio). Sin HTML elaborado en esta fase.
- Tests contra la DB hosted: secuenciales, sin dejar datos; timeout explícito 30000 en beforeAll/afterAll; flake "JWT issued at future" → reintentar. Fechas de reservas de test: **mes centinela noviembre 2027** (octubre lo usa notificaciones-reservas; agosto/septiembre otros).
- Un defecto encontrado en SQL ya aplicado → migración nueva, jamás editar la aplicada.
- Commits en español estilo repo. Deploy manual `npx vercel --prod`.

---

### Task 1: Migración `0009_despacho.sql`

**Files:**
- Create: `supabase/migrations/0009_despacho.sql`

**Interfaces:**
- Produces: columnas `notificaciones.reserva_id uuid`, `.ultimo_error text`, `.reclamada_en timestamptz`; estado nuevo `'enviando'`; función `reclamar_notificaciones(canales text[], maximo int) returns setof notificaciones`; función `rescatar_notificaciones_colgadas() returns int`; `encolar_notificacion` con 6º parámetro `canales text[] default null`; trigger `tareas_fijar_creada_por`. Tasks 2–4 dependen de esto.

- [ ] **Step 1: Escribir la migración**

```sql
-- 0009: despacho de notificaciones (spec §6 + §13)

-- reserva_id como columna real (§13): reemplaza el descarte por payload.
alter table notificaciones add column reserva_id uuid references reservas (id) on delete cascade;
create index notificaciones_reserva_idx on notificaciones (reserva_id) where reserva_id is not null;

-- Diagnóstico y claim (§13 / patrón outbox).
alter table notificaciones add column ultimo_error text;
alter table notificaciones add column reclamada_en timestamptz;
alter table notificaciones drop constraint notificaciones_estado_check;
alter table notificaciones add constraint notificaciones_estado_check
  check (estado in ('pendiente', 'enviando', 'enviada', 'fallida', 'descartada'));

-- encolar_notificacion con filtro de canales (§13): la vieja firma se va.
drop function public.encolar_notificacion(uuid, uuid, text, jsonb, timestamptz);

create or replace function public.encolar_notificacion(
  destinatario uuid,
  org uuid,
  evento text,
  carga jsonb,
  programada timestamptz default null,
  canales text[] default null,
  reserva uuid default null
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

  if pref.email and (canales is null or 'email' = any(canales)) then
    insert into public.notificaciones (org_id, usuario_id, evento, canal, payload, programada_para, reserva_id)
    values (org, destinatario, evento, 'email', coalesce(carga, '{}'::jsonb), programada, reserva);
  end if;
  if pref.wa and tel is not null and (canales is null or 'wa' = any(canales)) then
    insert into public.notificaciones (org_id, usuario_id, evento, canal, payload, programada_para, reserva_id)
    values (org, destinatario, evento, 'wa', coalesce(carga, '{}'::jsonb), programada, reserva);
  end if;
  if pref.push and (canales is null or 'push' = any(canales)) and exists (
    select 1 from public.push_suscripciones s where s.usuario_id = destinatario
  ) then
    insert into public.notificaciones (org_id, usuario_id, evento, canal, payload, programada_para, reserva_id)
    values (org, destinatario, evento, 'push', coalesce(carga, '{}'::jsonb), programada, reserva);
  end if;
end;
$$;

revoke execute on function public.encolar_notificacion(uuid, uuid, text, jsonb, timestamptz, text[], uuid)
  from public, anon, authenticated;

-- Triggers de reservas: pasan reserva_id por parámetro; el descarte del
-- recordatorio usa la columna (adiós cast del payload).
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
    return new;
  end if;

  select jsonb_build_object(
           'reserva_id', new.id, 'sala', s.nombre, 'edificio', e.nombre,
           'fecha', new.fecha, 'hora_inicio', new.hora_inicio, 'horas', new.horas
         ),
         e.org_propietaria_id
    into carga, org
    from public.salas s join public.edificios e on e.id = s.edificio_id
   where s.id = new.sala_id;

  perform public.encolar_notificacion(new.para_perfil_id, org, 'reserva_confirmada', carga, null, null, new.id);

  inicio := (new.fecha::timestamp + make_interval(hours => new.hora_inicio))
              at time zone 'America/Argentina/Buenos_Aires';
  if inicio - interval '24 hours' > now() then
    perform public.encolar_notificacion(
      new.para_perfil_id, org, 'reserva_recordatorio', carga, inicio - interval '24 hours', null, new.id
    );
  end if;
  return new;
end;
$$;

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
    perform public.encolar_notificacion(destinatario, org, 'reserva_cancelada', carga, null, null, new.id);
  end loop;

  update public.notificaciones
     set estado = 'descartada'
   where evento = 'reserva_recordatorio' and estado = 'pendiente'
     and reserva_id = new.id;
  return new;
end;
$$;

-- Invitaciones: con el filtro de canales desaparece el encolar-y-descartar.
create or replace function public.notificar_invitacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  carga jsonb;
begin
  if new.perfil_id = auth.uid() then
    return new;
  end if;
  select jsonb_build_object('org', o.nombre, 'rol', r.nombre)
    into carga
    from public.organizaciones o, public.roles r
   where o.id = new.org_id and r.id = new.rol_id;

  -- El email de invitación lo manda Supabase Auth; acá solo wa/push.
  perform public.encolar_notificacion(new.perfil_id, new.org_id, 'invitacion', carga, null, array['wa','push']);
  return new;
end;
$$;

-- tareas.creada_por: siempre el actor autenticado; inmutable después.
-- (El default auth.uid() sigue, esto cierra el spoofing por insert directo.)
create or replace function public.fijar_creada_por()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.creada_por := auth.uid();
    end if;
  elsif new.creada_por is distinct from old.creada_por then
    new.creada_por := old.creada_por;
  end if;
  return new;
end;
$$;

create trigger tareas_fijar_creada_por
  before insert or update on tareas
  for each row execute function public.fijar_creada_por();

-- Claim atómico (§13): pendiente→enviando con SKIP LOCKED. Solo service role.
create or replace function public.reclamar_notificaciones(canales text[], maximo int)
returns setof public.notificaciones
language sql
security definer
set search_path = ''
as $$
  update public.notificaciones n
     set estado = 'enviando', reclamada_en = now()
   where n.id in (
     select id from public.notificaciones
      where estado = 'pendiente'
        and canal = any(canales)
        and (programada_para is null or programada_para <= now())
      order by creada_en
      limit maximo
      for update skip locked
   )
  returning n.*;
$$;

revoke execute on function public.reclamar_notificaciones(text[], int)
  from public, anon, authenticated;

-- Rescate: un dispatcher muerto no puede dejar filas en enviando para siempre.
create or replace function public.rescatar_notificaciones_colgadas()
returns int
language sql
security definer
set search_path = ''
as $$
  with rescatadas as (
    update public.notificaciones
       set estado = 'pendiente', reclamada_en = null
     where estado = 'enviando' and reclamada_en < now() - interval '10 minutes'
    returning 1
  )
  select count(*)::int from rescatadas;
$$;

revoke execute on function public.rescatar_notificaciones_colgadas()
  from public, anon, authenticated;
```

- [ ] **Step 2: Aplicar vía Management API** (procedimiento de Global Constraints; versión timestamp nueva, name `0009_despacho`)

- [ ] **Step 3: Smoke check**

Vía Management API: `select estado from notificaciones limit 0` (columnas nuevas presentes: `select reserva_id, ultimo_error, reclamada_en from notificaciones limit 0`), `select proname from pg_proc where proname in ('reclamar_notificaciones','rescatar_notificaciones_colgadas')` → 2 filas, y `select tgname from pg_trigger where tgname='tareas_fijar_creada_por'` → 1 fila.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0009_despacho.sql
git commit -m "feat: claim atómico, canales filtrables y guard de creada_por para el despacho"
```

---

### Task 2: Tests SQL del despacho

**Files:**
- Create: `tests/rls/despacho.test.ts`

**Interfaces:**
- Consumes: `clienteAdmin()`, `clienteComo(email)` de `tests/rls/helpers.ts`; funciones de Task 1 (el admin client las llama con `.rpc()`; el service role bypasea el revoke).

- [ ] **Step 1: Escribir los tests**

Patrones de referencia: `tests/rls/notificaciones.test.ts` (inserts de outbox vía admin, cleanup). Timeouts 30000 en hooks. Contenido:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { clienteAdmin, clienteComo } from "./helpers";

// Funciones de despacho de 0009: claim atómico, rescate, filtro de canales
// y guard de creada_por.
describe("despacho de notificaciones", () => {
  const admin = clienteAdmin();
  let adminId: string;
  const creadas: string[] = [];

  async function encolarDirecto(extra: Record<string, unknown> = {}): Promise<string> {
    const { data, error } = await admin
      .from("notificaciones")
      .insert({
        usuario_id: adminId, evento: "tarea_asignada", canal: "email",
        payload: { t: "despacho-test" }, ...extra,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    creadas.push(data!.id);
    return data!.id;
  }

  beforeAll(async () => {
    const { data } = await admin
      .from("perfiles").select("id").eq("email", "admin@demo.test").single();
    adminId = data!.id;
    // limpieza defensiva de corridas abortadas
    await admin.from("notificaciones").delete().eq("payload->>t", "despacho-test");
  }, 30000);

  afterAll(async () => {
    await admin.from("notificaciones").delete().eq("payload->>t", "despacho-test");
  }, 30000);

  it("reclamar pasa pendiente→enviando y no entrega dos veces", async () => {
    const id = await encolarDirecto();
    const primera = await admin.rpc("reclamar_notificaciones", {
      canales: ["email"], maximo: 100,
    });
    expect(primera.error).toBeNull();
    const mias = (primera.data as { id: string; estado: string }[]).filter((n) => n.id === id);
    expect(mias).toHaveLength(1);
    expect(mias[0].estado).toBe("enviando");

    const segunda = await admin.rpc("reclamar_notificaciones", {
      canales: ["email"], maximo: 100,
    });
    expect((segunda.data as { id: string }[]).some((n) => n.id === id)).toBe(false);
  });

  it("reclamar respeta programada_para futura y canal", async () => {
    const futura = await encolarDirecto({
      programada_para: new Date(Date.now() + 3600_000).toISOString(),
    });
    const otroCanal = await encolarDirecto({ canal: "wa" });
    const { data } = await admin.rpc("reclamar_notificaciones", {
      canales: ["email"], maximo: 100,
    });
    const ids = (data as { id: string }[]).map((n) => n.id);
    expect(ids).not.toContain(futura);
    expect(ids).not.toContain(otroCanal);
  });

  it("rescatar devuelve a pendiente solo filas colgadas viejas", async () => {
    const id = await encolarDirecto();
    await admin.rpc("reclamar_notificaciones", { canales: ["email"], maximo: 100 });
    // recién reclamada: no debe rescatarse
    const { data: cero } = await admin.rpc("rescatar_notificaciones_colgadas");
    const { data: sigue } = await admin
      .from("notificaciones").select("estado").eq("id", id).single();
    expect(sigue!.estado).toBe("enviando");

    // se envejece a mano y ahí sí
    await admin.from("notificaciones")
      .update({ reclamada_en: new Date(Date.now() - 11 * 60_000).toISOString() })
      .eq("id", id);
    const { data: uno } = await admin.rpc("rescatar_notificaciones_colgadas");
    expect(uno).toBeGreaterThanOrEqual(1);
    const { data: rescatada } = await admin
      .from("notificaciones").select("estado, reclamada_en").eq("id", id).single();
    expect(rescatada!.estado).toBe("pendiente");
    void cero;
  });

  it("authenticated no puede ejecutar las funciones de despacho", async () => {
    const comoAdmin = await clienteComo("admin@demo.test");
    const claim = await comoAdmin.rpc("reclamar_notificaciones", {
      canales: ["email"], maximo: 1,
    });
    expect(claim.error).not.toBeNull();
    const rescate = await comoAdmin.rpc("rescatar_notificaciones_colgadas");
    expect(rescate.error).not.toBeNull();
  });

  it("creada_por no se puede falsificar por insert directo", async () => {
    const comoAdmin = await clienteComo("admin@demo.test");
    const { data: coordi } = await admin
      .from("perfiles").select("id").eq("email", "coordi@demo.test").single();
    const { data: pm } = await admin
      .from("proyecto_miembros").select("proyecto_id").eq("perfil_id", adminId).limit(1);
    const { data: tarea, error } = await comoAdmin
      .from("tareas")
      .insert({
        proyecto_id: pm![0].proyecto_id, titulo: "spoof test", dificultad: 1,
        creada_por: coordi!.id,
      })
      .select("id, creada_por")
      .single();
    expect(error).toBeNull();
    expect(tarea!.creada_por).toBe(adminId); // el trigger pisó el spoof
    await admin.from("notificaciones").delete().eq("payload->>tarea_id", tarea!.id);
    await admin.from("tareas").delete().eq("id", tarea!.id);
  });
});
```

- [ ] **Step 2: Correr** `npx vitest run tests/rls/despacho.test.ts` → 5 PASS. Defecto de SQL → migración 0010+ nueva.

- [ ] **Step 3: Regresión de triggers** — `npx vitest run tests/rls/notificaciones-reservas.test.ts tests/rls/notificaciones-tareas.test.ts tests/rls/notificaciones.test.ts` → todo verde (los triggers recreados en 0009 no deben romper fase 1; el test de invitación de tareas ya no verá fila email descartada — **ajustar ese assert**: ahora NO debe existir fila email para invitacion; hacerlo en este task, es consecuencia directa de 0009).

- [ ] **Step 4: Commit**

```bash
git add tests/rls/despacho.test.ts tests/rls/notificaciones-tareas.test.ts
git commit -m "test: claim atómico, rescate, guard de creada_por y canales de invitación"
```

---

### Task 3: Templates y decisiones puras (`lib/notificaciones/`)

**Files:**
- Create: `lib/notificaciones/emails.ts`
- Create: `tests/notificaciones/emails.test.ts`

**Interfaces:**
- Produces: `renderEmail(n: NotificacionEmail): { asunto: string; texto: string }` y `decidirEnvio(n, prefs, ahora): "enviar" | "descartar"` — consumidos por Task 4.
- `NotificacionEmail` = `{ evento: string; payload: Record<string, unknown>; programada_para: string | null }` (subset de la fila).

- [ ] **Step 1: Implementar**

```ts
// Templates de texto y decisiones de envío. Puro: sin red ni DB, para
// testear sin mocks. El dispatcher (route handler) orquesta alrededor.

const APP_URL = "https://bigote-gilt.vercel.app";

export type NotificacionEmail = {
  evento: string;
  payload: Record<string, unknown>;
  programada_para: string | null;
};

export type PrefsEmail = { email: boolean };

function fechaLegible(fecha: unknown, hora: unknown): string {
  const d = new Date(`${fecha}T00:00:00-03:00`);
  const dia = d.toLocaleDateString("es-AR", {
    weekday: "long", day: "numeric", month: "numeric", timeZone: "America/Argentina/Buenos_Aires",
  });
  return `${dia} a las ${hora}:00`;
}

export function renderEmail(n: NotificacionEmail): { asunto: string; texto: string } {
  const p = n.payload;
  switch (n.evento) {
    case "reserva_confirmada":
      return {
        asunto: `Reserva confirmada: ${p.sala}`,
        texto: `Reservaste ${p.sala} (${p.edificio}) el ${fechaLegible(p.fecha, p.hora_inicio)}, ${p.horas} h.\n\nVer tus reservas: ${APP_URL}`,
      };
    case "reserva_recordatorio":
      return {
        asunto: `Mañana: ${p.sala} a las ${p.hora_inicio}:00`,
        texto: `Te esperamos mañana en ${p.sala} (${p.edificio}) a las ${p.hora_inicio}:00, ${p.horas} h.\n\nSi no vas a ir, cancelá la reserva: ${APP_URL}`,
      };
    case "reserva_cancelada": {
      const motivo = p.motivo ? `\nMotivo: ${p.motivo}` : "";
      return {
        asunto: `Reserva cancelada: ${p.sala}`,
        texto: `Se canceló la reserva de ${p.sala} (${p.edificio}) del ${fechaLegible(p.fecha, p.hora_inicio)}.${motivo}\n\nVer disponibilidad: ${APP_URL}`,
      };
    }
    case "tarea_asignada":
      return {
        asunto: `Tarea nueva en ${p.proyecto}`,
        texto: `Te asignaron "${p.titulo}" en ${p.proyecto}.\n\nTomala o mirala: ${APP_URL}`,
      };
    case "tarea_hecha":
      return {
        asunto: `Hecha: ${p.titulo}`,
        texto: `"${p.titulo}" (${p.proyecto}) quedó marcada como hecha.\n\nVer el proyecto: ${APP_URL}`,
      };
    default:
      return {
        asunto: "Novedades en bigote",
        texto: `Tenés novedades en tu organización.\n\nEntrá: ${APP_URL}`,
      };
  }
}

// Spec §13: las preferencias se congelan al encolar; para filas programadas
// (recordatorios) hay que re-chequear antes de enviar. Además, un
// recordatorio cuyo turno ya empezó no se manda.
export function decidirEnvio(
  n: NotificacionEmail,
  prefs: PrefsEmail,
  ahora: Date
): "enviar" | "descartar" {
  if (n.programada_para !== null) {
    if (!prefs.email) return "descartar";
    if (n.evento === "reserva_recordatorio") {
      const p = n.payload;
      const inicio = new Date(`${p.fecha}T${String(p.hora_inicio).padStart(2, "0")}:00:00-03:00`);
      if (ahora >= inicio) return "descartar";
    }
  }
  return "enviar";
}
```

- [ ] **Step 2: Tests unit** (sin DB — carpeta nueva `tests/notificaciones/`, vitest la levanta igual con el include default):

```ts
import { describe, it, expect } from "vitest";
import { renderEmail, decidirEnvio } from "@/lib/notificaciones/emails";

const base = { programada_para: null };

describe("renderEmail", () => {
  it("reserva_confirmada arma asunto y texto con los datos", () => {
    const r = renderEmail({
      ...base, evento: "reserva_confirmada",
      payload: { sala: "Sala Norte", edificio: "Casa Delta", fecha: "2027-11-05", hora_inicio: 10, horas: 2 },
    });
    expect(r.asunto).toContain("Sala Norte");
    expect(r.texto).toContain("Casa Delta");
    expect(r.texto).toContain("10:00");
  });

  it("evento desconocido cae al genérico", () => {
    const r = renderEmail({ ...base, evento: "algo_nuevo", payload: {} });
    expect(r.asunto).toBe("Novedades en bigote");
  });
});

describe("decidirEnvio", () => {
  const recordatorio = {
    evento: "reserva_recordatorio",
    payload: { fecha: "2027-11-05", hora_inicio: 10 },
    programada_para: "2027-11-04T13:00:00Z",
  };

  it("inmediata se envía sin mirar prefs re-chequeadas", () => {
    expect(decidirEnvio({ evento: "tarea_asignada", payload: {}, programada_para: null }, { email: false }, new Date())).toBe("enviar");
  });

  it("programada con email off se descarta", () => {
    expect(decidirEnvio(recordatorio, { email: false }, new Date("2027-11-04T13:05:00Z"))).toBe("descartar");
  });

  it("recordatorio vencido se descarta aun con email on", () => {
    expect(decidirEnvio(recordatorio, { email: true }, new Date("2027-11-05T14:00:00Z"))).toBe("descartar");
  });

  it("recordatorio vigente con email on se envía", () => {
    expect(decidirEnvio(recordatorio, { email: true }, new Date("2027-11-04T13:05:00Z"))).toBe("enviar");
  });
});
```

- [ ] **Step 3: Correr** `npx vitest run tests/notificaciones/emails.test.ts` → 6 PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/notificaciones/emails.ts tests/notificaciones/emails.test.ts
git commit -m "feat: templates de email y decisiones de envío puras"
```

---

### Task 4: Dispatcher (`/api/notificaciones/despachar`)

**Files:**
- Create: `app/api/notificaciones/despachar/route.ts`
- Create: `lib/notificaciones/despachar.ts`
- Create: `tests/notificaciones/despachar.test.ts`

**Interfaces:**
- Consumes: `reclamar_notificaciones` / `rescatar_notificaciones_colgadas` (Task 1), `renderEmail` / `decidirEnvio` (Task 3), `crearClienteAdmin()` de `@/lib/supabase/admin`.
- Produces: `despachar(deps): Promise<Resumen>` con inyección de dependencias para test; route handler POST con Bearer `CRON_SECRET`.

- [ ] **Step 1: Lógica orquestadora con dependencias inyectables**

`lib/notificaciones/despachar.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderEmail, decidirEnvio } from "./emails";

export type EnviarEmail = (args: {
  from: string; to: string; subject: string; text: string;
}) => Promise<{ ok: boolean; error?: string }>;

export type Resumen = {
  rescatadas: number; enviadas: number; descartadas: number;
  reintentos: number; fallidas: number;
};

const LOTE = 50;
const MAX_INTENTOS = 3;

export async function despachar(
  admin: SupabaseClient,
  enviarEmail: EnviarEmail,
  from: string,
  ahora: () => Date = () => new Date()
): Promise<Resumen> {
  const resumen: Resumen = { rescatadas: 0, enviadas: 0, descartadas: 0, reintentos: 0, fallidas: 0 };

  const { data: rescatadas } = await admin.rpc("rescatar_notificaciones_colgadas");
  resumen.rescatadas = rescatadas ?? 0;

  const { data: lote, error: errorClaim } = await admin.rpc("reclamar_notificaciones", {
    canales: ["email"], maximo: LOTE,
  });
  if (errorClaim) throw new Error(`claim falló: ${errorClaim.message}`);

  for (const n of (lote ?? []) as {
    id: string; usuario_id: string; evento: string;
    payload: Record<string, unknown>; programada_para: string | null; intentos: number;
  }[]) {
    const { data: perfil } = await admin
      .from("perfiles").select("email").eq("id", n.usuario_id).single();
    const { data: prefs } = await admin
      .from("preferencias_notificaciones").select("email").eq("usuario_id", n.usuario_id).maybeSingle();

    const decision = perfil
      ? decidirEnvio(n, { email: prefs?.email ?? true }, ahora())
      : "descartar";
    if (decision === "descartar") {
      await admin.from("notificaciones")
        .update({ estado: "descartada" }).eq("id", n.id);
      resumen.descartadas++;
      continue;
    }

    const { asunto, texto } = renderEmail(n);
    const envio = await enviarEmail({ from, to: perfil!.email, subject: asunto, text: texto });

    if (envio.ok) {
      await admin.from("notificaciones")
        .update({ estado: "enviada", enviada_en: ahora().toISOString(), ultimo_error: null })
        .eq("id", n.id);
      resumen.enviadas++;
    } else {
      const intentos = n.intentos + 1;
      const agotado = intentos >= MAX_INTENTOS;
      await admin.from("notificaciones")
        .update({
          estado: agotado ? "fallida" : "pendiente",
          intentos,
          reclamada_en: null,
          ultimo_error: (envio.error ?? "error desconocido").slice(0, 500),
        })
        .eq("id", n.id);
      if (agotado) resumen.fallidas++; else resumen.reintentos++;
    }
  }
  return resumen;
}
```

`app/api/notificaciones/despachar/route.ts`:

```ts
import { NextResponse } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { despachar, type EnviarEmail } from "@/lib/notificaciones/despachar";

export const maxDuration = 60;

const enviarConResend: EnviarEmail = async ({ from, to, subject, text }) => {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, text }),
  });
  if (res.ok) return { ok: true };
  const cuerpo = await res.text();
  return { ok: false, error: `Resend ${res.status}: ${cuerpo.slice(0, 300)}` };
};

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }
  const from = process.env.EMAIL_FROM;
  if (!from) return NextResponse.json({ error: "falta EMAIL_FROM" }, { status: 500 });

  const resumen = await despachar(crearClienteAdmin(), enviarConResend, from);
  return NextResponse.json(resumen);
}
```

(Verificar el nombre real del export en `lib/supabase/admin.ts` — si es otro, usarlo.)

- [ ] **Step 2: Test de integración** (`tests/notificaciones/despachar.test.ts`): usa la DB hosted real (admin de `tests/rls/helpers.ts`) + `enviarEmail` FALSO inyectado — nunca Resend real en tests.

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { clienteAdmin } from "../rls/helpers";
import { despachar, type EnviarEmail } from "@/lib/notificaciones/despachar";

describe("despachar (integración con DB, envío falso)", () => {
  const admin = clienteAdmin();
  let adminId: string;
  const marca = { t: "despachar-test" };
  // despachar() reclama TODO el backlog email pendiente de la DB compartida:
  // snapshot de las filas ajenas para restaurarlas si el sender falso las toca.
  let ajenas: { id: string; estado: string; intentos: number }[] = [];

  async function encolar(extra: Record<string, unknown> = {}): Promise<string> {
    const { data } = await admin.from("notificaciones")
      .insert({ usuario_id: adminId, evento: "tarea_asignada", canal: "email", payload: marca, ...extra })
      .select("id").single();
    return data!.id;
  }

  beforeAll(async () => {
    const { data } = await admin.from("perfiles").select("id").eq("email", "admin@demo.test").single();
    adminId = data!.id;
    await admin.from("notificaciones").delete().eq("payload->>t", "despachar-test");
    const { data: pendientes } = await admin
      .from("notificaciones")
      .select("id, estado, intentos")
      .eq("canal", "email")
      .eq("estado", "pendiente")
      .neq("payload->>t", "despachar-test");
    ajenas = pendientes ?? [];
  }, 30000);

  afterAll(async () => {
    await admin.from("notificaciones").delete().eq("payload->>t", "despachar-test");
    for (const fila of ajenas) {
      await admin.from("notificaciones")
        .update({
          estado: fila.estado, intentos: fila.intentos,
          enviada_en: null, reclamada_en: null, ultimo_error: null,
        })
        .eq("id", fila.id);
    }
  }, 30000);

  it("envía pendientes, marca enviada y registra destinatario correcto", async () => {
    const id = await encolar();
    const enviados: { to: string; subject: string }[] = [];
    const falso: EnviarEmail = async (a) => { enviados.push(a); return { ok: true }; };

    const resumen = await despachar(admin, falso, "bigote <test@test>");
    expect(resumen.enviadas).toBeGreaterThanOrEqual(1);
    expect(enviados.some((e) => e.to === "admin@demo.test")).toBe(true);

    const { data } = await admin.from("notificaciones").select("estado, enviada_en").eq("id", id).single();
    expect(data!.estado).toBe("enviada");
    expect(data!.enviada_en).not.toBeNull();
  });

  it("fallo de envío reintenta y a la 3ª queda fallida con ultimo_error", async () => {
    const id = await encolar({ intentos: 2 });
    const falso: EnviarEmail = async () => ({ ok: false, error: "boom" });

    await despachar(admin, falso, "bigote <test@test>");
    const { data } = await admin.from("notificaciones").select("estado, intentos, ultimo_error").eq("id", id).single();
    expect(data!.estado).toBe("fallida");
    expect(data!.intentos).toBe(3);
    expect(data!.ultimo_error).toContain("boom");
  });

  it("programada con email off se descarta sin enviar", async () => {
    await admin.from("preferencias_notificaciones").upsert({ usuario_id: adminId, email: false });
    const id = await encolar({ programada_para: new Date(Date.now() - 1000).toISOString() });
    const llamadas: unknown[] = [];
    const falso: EnviarEmail = async (a) => { llamadas.push(a); return { ok: true }; };

    await despachar(admin, falso, "bigote <test@test>");
    const { data } = await admin.from("notificaciones").select("estado").eq("id", id).single();
    expect(data!.estado).toBe("descartada");
    await admin.from("preferencias_notificaciones").delete().eq("usuario_id", adminId);
  });
});
```

- [ ] **Step 3: Correr** `npx vitest run tests/notificaciones/despachar.test.ts` → 3 PASS. Después `npm run build` → verde (ruta `ƒ /api/notificaciones/despachar` listada).

- [ ] **Step 4: Commit**

```bash
git add lib/notificaciones/despachar.ts app/api/notificaciones/despachar tests/notificaciones/despachar.test.ts
git commit -m "feat: dispatcher de emails con claim atómico, reintentos y re-chequeo de preferencias"
```

---

### Task 5: Cron (pg_cron + pg_net), env vars y prueba end-to-end

**Files:**
- Create: `supabase/migrations/0010_cron_despacho.sql`

**Interfaces:**
- Consumes: endpoint de Task 4 deployado. Requiere `CRON_SECRET` y `EMAIL_FROM` en Vercel ANTES del cron.

- [ ] **Step 1: Generar y cargar env vars**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # CRON_SECRET
printf '<CRON_SECRET generado>' | npx vercel env add CRON_SECRET production
printf 'bigote <onboarding@resend.dev>' | npx vercel env add EMAIL_FROM production
```

(`RESEND_API_KEY` ya está en Vercel. `.env.local`: agregar `CRON_SECRET` y `EMAIL_FROM` también, para dev.)

- [ ] **Step 2: Deploy del endpoint** — `npx vercel --prod`, verificar Ready. Probar rechazo: `curl -s -o /dev/null -w '%{http_code}' -X POST https://bigote-gilt.vercel.app/api/notificaciones/despachar` → `401`. Probar con secret: `curl -s -X POST -H "Authorization: Bearer <CRON_SECRET>" https://bigote-gilt.vercel.app/api/notificaciones/despachar` → JSON con el resumen (probablemente todo en 0 si no hay pendientes).

- [ ] **Step 3: Migración del cron**

```sql
-- 0010: disparo del despacho cada 5 min (spec §6 enmendado: pg_cron en vez
-- de Vercel Cron — el plan hobby de Vercel solo permite frecuencia diaria).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'despachar-notificaciones',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://bigote-gilt.vercel.app/api/notificaciones/despachar',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select valor from public.config_interna where clave = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- El secret vive en una tabla interna solo-service-role (no en el texto del
-- job, que es legible por cualquier rol con acceso a cron.job).
create table if not exists config_interna (
  clave text primary key,
  valor text not null
);
alter table config_interna enable row level security;  -- sin políticas: solo service role
```

**Orden real de aplicación:** crear la tabla ANTES del `cron.schedule` (reordenar en el archivo: extensiones → tabla → schedule). Insertar el secret vía Management API (NO en la migración, para no commitear el secret): `insert into config_interna (clave, valor) values ('cron_secret', '<CRON_SECRET>') on conflict (clave) do update set valor = excluded.valor`.

- [ ] **Step 4: Aplicar 0010 vía Management API** (mismo procedimiento; name `0010_cron_despacho`) + insertar el secret + verificar: `select jobname, schedule, active from cron.job` → fila `despachar-notificaciones` activa.

- [ ] **Step 5: Prueba end-to-end real**

1. Encolar una notificación real: como el usuario de prueba con email real (sanjuan.ramiro@gmail.com es dueño de la cuenta Resend → `onboarding@resend.dev` puede mandarle), insertar vía Management API una fila `notificaciones` (usuario = perfil de sanjuan.ramiro@gmail.com, evento `tarea_asignada`, canal email, payload `{"titulo":"Prueba de fase 2","proyecto":"bigote"}`).
2. Esperar el próximo tick del cron (≤5 min) o dispararlo a mano con curl.
3. Verificar: fila en estado `enviada` con `enviada_en`, y el email llegó a la casilla (confirmación del usuario o del dashboard de Resend: `curl -s -H "Authorization: Bearer $RESEND_API_KEY" https://api.resend.com/emails` lista el envío).
4. Verificar `cron.job_run_details` (últimas corridas exitosas): `select status, return_message from cron.job_run_details order by start_time desc limit 3`.
5. **Comportamiento esperado del backlog de fase 1:** con `EMAIL_FROM=onboarding@resend.dev`, Resend solo entrega al dueño de la cuenta — los pendientes viejos de usuarios demo van a reintentar 3 veces y quedar `fallida` con `ultimo_error` (correcto y esperado; no es un bug). Cuando el dominio verifique y `EMAIL_FROM` cambie, los nuevos salen normales.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0010_cron_despacho.sql
git commit -m "feat: cron de despacho cada 5 min con pg_cron y secret en tabla interna"
```

---

### Task 6: Docs, dominio y cierre

**Files:**
- Modify: `docs/superpowers/specs/2026-08-05-notificaciones-v2-design.md` (§6 + §10 fase 2 tachada + §11 criterios)
- Modify: `README.md`, `package.json` (1.2.0)

- [ ] **Step 1: Enmendar spec §6** — reemplazar la línea del cron por: "Disparo: pg_cron + pg_net en Supabase cada 5 min contra `/api/notificaciones/despachar` (Bearer `CRON_SECRET` desde `config_interna`). *(Enmendado en fase 2: Vercel Cron del plan hobby solo permite frecuencia diaria.)*" y agregar al final de §6: "Claim atómico con estado `enviando` + `reclamada_en` + rescate a los 10 min; re-chequeo de preferencias y vencimiento para filas programadas (§13)."
- [ ] **Step 2: Spec §11** — tildar: "Apagar un canal en preferencias corta esos envíos" (cubierto por decidirEnvio + tests) y anotar en "Reservar una sala genera confirmación..." → "(email ✔ fase 2; wa/push pendientes)". §10: marcar fase 2 como hecha.
- [ ] **Step 3: README** — estado: "v2 fase 2 (email) completa: dispatcher Resend + pg_cron cada 5 min. Falta verificar dominio tronador.net.ar para pasar EMAIL_FROM a avisos@tronador.net.ar (hoy onboarding@resend.dev, solo llega al dueño de la cuenta Resend)." `package.json` → `1.2.0`.
- [ ] **Step 4: Verificación final** — `npm run build && npm test` → todo verde.
- [ ] **Step 5: Commit + push + deploy** — commit `docs: fase 2 de email cerrada — spec, README y v1.2.0`, `git push`, `npx vercel --prod`, verificar `v1.2.0` en `/ingresar`.

**Nota post-plan (no bloquea la fase):** cuando el DNS de `tronador.net.ar` verifique en Resend (chequear con `curl -s -H "Authorization: Bearer $RESEND_API_KEY" https://api.resend.com/domains/6ac11cd6-6565-4175-9a6c-5de12fb30003` → status `verified`; disparar verificación con POST a `.../verify`), cambiar `EMAIL_FROM` en Vercel a `bigote <avisos@tronador.net.ar>` y redeploy. Recién ahí los emails llegan a cualquier usuario.
