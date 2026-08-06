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
