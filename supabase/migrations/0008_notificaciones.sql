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
