-- Pago previo a la reserva: cobro por transferencia a alias/CBU antes de
-- confirmar, con el horario retenido y vencimiento automático.
-- Spec: docs/superpowers/specs/2026-08-11-pago-previo-reserva-design.md

-- ------------------------------------------------- estados de la reserva

-- El check de estado se declaró inline en 0001, así que Postgres lo nombró
-- solo. Se busca por definición en vez de asumir el nombre.
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'reservas'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%confirmada%'
      and pg_get_constraintdef(oid) like '%estado%'
  loop
    execute format('alter table reservas drop constraint %I', r.conname);
  end loop;
end $$;

alter table reservas add constraint reservas_estado_check
  check (estado in ('confirmada', 'cancelada', 'esperando_pago', 'vencida'));

alter table reservas add column vence_at timestamptz;
alter table reservas add constraint reservas_vence_at_check
  check (estado <> 'esperando_pago' or vence_at is not null);

-- EL CAMBIO CRÍTICO. La constraint de exclusión que impide el solape estaba
-- filtrada por `where (estado = 'confirmada')`. Una reserva esperando pago
-- quedaría fuera de ese predicado y NO bloquearía el horario, que es
-- exactamente el doble-booking que la retención busca evitar.
alter table reservas drop constraint reservas_sin_solape;
alter table reservas add constraint reservas_sin_solape exclude using gist (
  sala_id with =,
  fecha with =,
  int4range(hora_inicio, hora_inicio + horas) with &&
) where (estado in ('confirmada', 'esperando_pago'));

alter table planes_reserva
  add column requiere_pago_previo boolean not null default false;

-- `contacto` es texto libre y podría ser un teléfono: no sirve para mandar mail.
alter table clientes add column email text;

-- ------------------------------------------------------- tablas nuevas

create table cobros_config (
  org_id uuid primary key references organizaciones (id) on delete cascade,
  alias text not null default '',
  cbu text not null default '',
  titular text not null default '',
  cuit text not null default '',
  banco text not null default '',
  instrucciones text not null default '',
  plazo_horas int not null default 48 check (plazo_horas between 1 and 720),
  activo boolean not null default false,
  check (not activo or btrim(alias) <> '' or btrim(cbu) <> '')
);

create table pagos_reserva (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizaciones (id) on delete cascade,
  reserva_id uuid not null references reservas (id) on delete cascade,
  metodo text not null default 'transferencia'
    check (metodo in ('transferencia', 'pasarela', 'efectivo')),
  proveedor text,
  referencia_externa text,
  monto numeric not null check (monto > 0),
  comprobante_path text,
  registrado_por uuid references perfiles (id),
  registrado_at timestamptz not null default now(),
  nota text not null default ''
);

create index pagos_reserva_reserva_idx on pagos_reserva (reserva_id);

alter table cobros_config enable row level security;
alter table pagos_reserva enable row level security;

create policy cobros_config_select on cobros_config for select
  using (es_miembro(org_id));
create policy cobros_config_write on cobros_config for all
  using (tiene_permiso(org_id, 'finanzas'));

create policy pagos_reserva_select on pagos_reserva for select
  using (es_miembro(org_id));
-- Escritura solo por RPC (security definer): nadie marca un pago desde el cliente.

-- --------------------------------------- cuándo nace el ingreso en finanzas

-- 0007 asentaba el ingreso `after insert`. Con pago previo eso registraría
-- plata que nadie pagó: ahora dispara en la transición a confirmada.
drop trigger if exists generar_movimientos_reserva_trigger on reservas;

create trigger generar_movimientos_reserva_insert
  after insert on reservas
  for each row when (new.estado = 'confirmada')
  execute function public.generar_movimientos_reserva();

create trigger generar_movimientos_reserva_pago
  after update of estado on reservas
  for each row when (old.estado = 'esperando_pago' and new.estado = 'confirmada')
  execute function public.generar_movimientos_reserva();

-- revertir_movimientos_reserva ya condiciona a `old.estado = 'confirmada' and
-- new.estado = 'cancelada'`, así que cancelar desde esperando_pago no intenta
-- borrar movimientos que nunca existieron. Se deja como está a propósito.

-- --------------------------------------------------------- notificaciones

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'notificaciones'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%reserva_recordatorio%'
  loop
    execute format('alter table notificaciones drop constraint %I', r.conname);
  end loop;
end $$;

alter table notificaciones add constraint notificaciones_evento_check
  check (evento in (
    'reserva_confirmada', 'reserva_recordatorio', 'reserva_cancelada',
    'invitacion', 'tarea_asignada', 'tarea_hecha',
    'reserva_esperando_pago', 'reserva_vencida', 'pago_registrado'
  ));

-- La confirmación y el recordatorio de 24 h se emitían `after insert`. Una
-- reserva que nace esperando pago no está confirmada todavía.
drop trigger if exists reservas_notificar_creada on reservas;

create trigger reservas_notificar_creada
  after insert on reservas
  for each row when (new.estado = 'confirmada')
  execute function public.notificar_reserva_creada();

-- Al confirmarse tras el pago se reusa la misma función: manda la confirmación
-- y programa el recordatorio, que de otro modo nunca se agendaría.
create trigger reservas_notificar_confirmada_tras_pago
  after update of estado on reservas
  for each row when (old.estado = 'esperando_pago' and new.estado = 'confirmada')
  execute function public.notificar_reserva_creada();

create or replace function public.notificar_reserva_pendiente_pago()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_sala text;
begin
  if new.para_perfil_id is null then
    return new;  -- cliente externo: el mail lo manda la app, no tiene perfil
  end if;

  select e.org_propietaria_id, s.nombre into v_org, v_sala
  from salas s join edificios e on e.id = s.edificio_id
  where s.id = new.sala_id;

  perform encolar_notificacion(
    new.para_perfil_id, v_org, 'reserva_esperando_pago',
    jsonb_build_object(
      'reserva_id', new.id, 'sala', v_sala, 'fecha', new.fecha,
      'hora_inicio', new.hora_inicio, 'horas', new.horas,
      'costo', new.costo, 'vence_at', new.vence_at)
  );
  return new;
end $$;

create trigger reservas_notificar_pendiente_pago
  after insert on reservas
  for each row when (new.estado = 'esperando_pago')
  execute function public.notificar_reserva_pendiente_pago();

create or replace function public.notificar_reserva_vencida()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_sala text;
begin
  if new.para_perfil_id is null then
    return new;
  end if;

  select e.org_propietaria_id, s.nombre into v_org, v_sala
  from salas s join edificios e on e.id = s.edificio_id
  where s.id = new.sala_id;

  perform encolar_notificacion(
    new.para_perfil_id, v_org, 'reserva_vencida',
    jsonb_build_object('reserva_id', new.id, 'sala', v_sala,
                       'fecha', new.fecha, 'hora_inicio', new.hora_inicio)
  );
  return new;
end $$;

create trigger reservas_notificar_vencida
  after update of estado on reservas
  for each row when (old.estado = 'esperando_pago' and new.estado = 'vencida')
  execute function public.notificar_reserva_vencida();

-- ------------------------------------------------------------------ RPC

-- Reemplaza la de 0005: si el plan exige pago previo y la reserva tiene costo,
-- nace en esperando_pago con vencimiento en vez de confirmada.
create or replace function public.crear_reserva(
  sala uuid, plan uuid, dia date, inicio int, duracion int, cliente uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_sala salas%rowtype;
  v_plan planes_reserva%rowtype;
  v_org_propietaria uuid;
  v_costo numeric;
  v_id uuid;
  v_cfg cobros_config%rowtype;
  v_estado text := 'confirmada';
  v_vence timestamptz := null;
begin
  select * into v_sala from salas where id = sala;
  if v_sala.id is null or not v_sala.activa then
    raise exception 'La sala no está disponible';
  end if;

  if not opera_edificio(v_sala.edificio_id) then
    raise exception 'No podés reservar en este edificio';
  end if;

  if dia < (now() at time zone 'America/Argentina/Buenos_Aires')::date then
    raise exception 'Esa fecha ya pasó';
  end if;

  select org_propietaria_id into v_org_propietaria
  from edificios where id = v_sala.edificio_id;

  select * into v_plan from planes_reserva where id = plan;
  if v_plan.id is null or v_plan.org_id <> v_org_propietaria then
    raise exception 'Ese plan no aplica acá';
  end if;

  if v_plan.solo_salas_publicas and v_sala.tipo = 'privada' then
    raise exception 'Ese plan es solo para salas públicas';
  end if;

  if cliente is not null then
    if not exists (select 1 from clientes c where c.id = cliente and c.org_id = v_org_propietaria) then
      raise exception 'Ese cliente no es de la organización';
    end if;
  end if;

  v_costo := case when v_plan.gratuito then 0 else v_plan.precio_hora * duracion end;

  select * into v_cfg from cobros_config where org_id = v_org_propietaria;
  if v_plan.requiere_pago_previo and v_costo > 0
     and v_cfg.org_id is not null and v_cfg.activo then
    if cliente is not null
       and not exists (select 1 from clientes c
                       where c.id = cliente and coalesce(btrim(c.email), '') <> '') then
      raise exception 'Cargá el email del cliente para poder mandarle los datos de pago';
    end if;
    v_estado := 'esperando_pago';
    v_vence := now() + make_interval(hours => v_cfg.plazo_horas);
  end if;

  begin
    insert into reservas (sala_id, plan_id, cliente_id, para_perfil_id,
                          fecha, hora_inicio, horas, costo, creada_por,
                          estado, vence_at)
    values (sala, plan, cliente,
            case when cliente is null then auth.uid() end,
            dia, inicio, duracion, v_costo, auth.uid(),
            v_estado, v_vence)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'Ese horario ya está reservado';
  end;

  return v_id;
end $$;

-- Reemplaza la de 0005: también se puede cancelar mientras espera el pago.
create or replace function public.cancelar_reserva(reserva uuid, motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_reserva reservas%rowtype;
  v_edificio uuid;
begin
  select * into v_reserva from reservas where id = reserva;
  if v_reserva.id is null
     or v_reserva.estado not in ('confirmada', 'esperando_pago') then
    raise exception 'La reserva no existe o ya está cancelada';
  end if;

  if motivo is null or btrim(motivo) = '' then
    raise exception 'Contanos el motivo';
  end if;

  select edificio_id into v_edificio from salas where id = v_reserva.sala_id;
  if not (v_reserva.creada_por = auth.uid() or administra_edificio(v_edificio)) then
    raise exception 'Solo quien la creó (o con permiso de espacios) puede cancelarla';
  end if;

  update reservas
  set estado = 'cancelada', motivo_cancelacion = btrim(motivo)
  where id = reserva;
end $$;

-- Registra el pago y confirma. `for update` dentro de la transacción para que
-- el vencimiento por cron y el registro del pago no compitan.
create or replace function public.registrar_pago_reserva(
  reserva uuid, monto numeric, metodo text default 'transferencia',
  comprobante text default null, nota text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_reserva reservas%rowtype;
  v_org uuid;
begin
  select * into v_reserva from reservas where id = reserva for update;
  if v_reserva.id is null then
    raise exception 'Esa reserva no existe';
  end if;

  select e.org_propietaria_id into v_org
  from salas s join edificios e on e.id = s.edificio_id
  where s.id = v_reserva.sala_id;

  if not tiene_permiso(v_org, 'finanzas') then
    raise exception 'No tenés permiso para registrar pagos';
  end if;

  if v_reserva.estado = 'vencida' then
    raise exception 'Esa reserva venció y el horario pudo haberse ocupado: creá una nueva';
  end if;
  if v_reserva.estado <> 'esperando_pago' then
    raise exception 'Esa reserva no está esperando pago';
  end if;
  if monto <> v_reserva.costo then
    raise exception 'El monto tiene que ser igual al costo de la reserva';
  end if;

  insert into pagos_reserva
    (org_id, reserva_id, metodo, monto, comprobante_path, registrado_por, nota)
  values (v_org, reserva, metodo, monto, comprobante,
          auth.uid(), coalesce(btrim(nota), ''));

  update reservas set estado = 'confirmada', vence_at = null where id = reserva;
end $$;

-- --------------------------------------------------- vencimiento por cron

-- Al pasar a vencida sale del predicado de la constraint de exclusión y el
-- horario se libera solo.
create or replace function public.vencer_reservas_impagas()
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  with vencidas as (
    update reservas set estado = 'vencida'
    where estado = 'esperando_pago' and vence_at <= now()
    returning 1
  )
  select count(*) into v_n from vencidas;
  return v_n;
end $$;

select cron.schedule(
  'vencer-reservas-impagas',
  '*/5 * * * *',
  $$ select public.vencer_reservas_impagas(); $$
);
