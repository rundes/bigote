-- Fase 4: movimientos automáticos por reserva paga, según destino_ingresos
-- del edificio (spec §3). En la base, no en la app: cualquier vía que
-- confirme o cancele una reserva los produce/revierte igual.

-- Genera los ingresos de una reserva confirmada paga. Reparto: la parte de
-- la gestora se trunca a centavos y la propietaria se lleva el resto, así
-- los montos suman el costo exacto (redondeo a favor de la propietaria).
create or replace function public.generar_movimientos_reserva()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_edificio edificios%rowtype;
  v_sala_nombre text;
  v_sala_edificio uuid;
  v_detalle text;
  v_monto_gestora numeric;
  v_monto_prop numeric;
begin
  if new.estado <> 'confirmada' or new.costo <= 0 then
    return new;
  end if;

  select nombre, edificio_id into v_sala_nombre, v_sala_edificio from salas where id = new.sala_id;
  select * into v_edificio from edificios where id = v_sala_edificio;

  v_detalle := 'Sala · ' || v_sala_nombre || ' · ' || new.horas || ' h';

  if v_edificio.destino_ingresos = 'propietaria' then
    insert into movimientos (org_id, edificio_id, tipo, categoria, monto, detalle,
                             fecha, origen, reserva_id, creado_por)
    values (v_edificio.org_propietaria_id, v_edificio.id, 'ingreso', 'reservas',
            new.costo, v_detalle, new.fecha, 'reserva', new.id, new.creada_por);

  elsif v_edificio.destino_ingresos = 'gestora' then
    insert into movimientos (org_id, edificio_id, tipo, categoria, monto, detalle,
                             fecha, origen, reserva_id, creado_por)
    values (v_edificio.org_gestora_id, v_edificio.id, 'ingreso', 'reservas',
            new.costo, v_detalle, new.fecha, 'reserva', new.id, new.creada_por);

  else -- reparto
    v_monto_gestora := trunc(new.costo * (100 - v_edificio.porcentaje_propietaria) / 100, 2);
    v_monto_prop := new.costo - v_monto_gestora;

    if v_monto_prop > 0 then
      insert into movimientos (org_id, edificio_id, tipo, categoria, monto, detalle,
                               fecha, origen, reserva_id, creado_por)
      values (v_edificio.org_propietaria_id, v_edificio.id, 'ingreso', 'reservas',
              v_monto_prop, v_detalle || ' · ' || v_edificio.porcentaje_propietaria || '%',
              new.fecha, 'reserva', new.id, new.creada_por);
    end if;
    if v_monto_gestora > 0 then
      insert into movimientos (org_id, edificio_id, tipo, categoria, monto, detalle,
                               fecha, origen, reserva_id, creado_por)
      values (v_edificio.org_gestora_id, v_edificio.id, 'ingreso', 'reservas',
              v_monto_gestora, v_detalle || ' · ' || (100 - v_edificio.porcentaje_propietaria) || '%',
              new.fecha, 'reserva', new.id, new.creada_por);
    end if;
  end if;

  return new;
end $$;

-- Cancelar revierte: se borran los movimientos de la reserva. La traza de la
-- cancelación queda en la reserva misma (estado + motivo_cancelacion).
create or replace function public.revertir_movimientos_reserva()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.estado = 'confirmada' and new.estado = 'cancelada' then
    delete from movimientos where reserva_id = new.id and origen = 'reserva';
  end if;
  return new;
end $$;

create trigger generar_movimientos_reserva_trigger
  after insert on reservas
  for each row execute function public.generar_movimientos_reserva();

create trigger revertir_movimientos_reserva_trigger
  after update of estado on reservas
  for each row execute function public.revertir_movimientos_reserva();

-- Backfill: reservas confirmadas pagas anteriores a este trigger (la reserva
-- demo del seed de fase 3) generan sus movimientos con el mismo cálculo.
do $$
declare
  r reservas%rowtype;
  v_edificio edificios%rowtype;
  v_sala_nombre text;
  v_sala_edificio uuid;
  v_detalle text;
  v_monto_gestora numeric;
  v_monto_prop numeric;
begin
  for r in
    select * from reservas res
    where res.estado = 'confirmada' and res.costo > 0
      and not exists (select 1 from movimientos m where m.reserva_id = res.id)
  loop
    select nombre, edificio_id into v_sala_nombre, v_sala_edificio from salas where id = r.sala_id;
    select * into v_edificio from edificios where id = v_sala_edificio;

    v_detalle := 'Sala · ' || v_sala_nombre || ' · ' || r.horas || ' h';

    if v_edificio.destino_ingresos = 'propietaria' then
      insert into movimientos (org_id, edificio_id, tipo, categoria, monto, detalle,
                               fecha, origen, reserva_id, creado_por)
      values (v_edificio.org_propietaria_id, v_edificio.id, 'ingreso', 'reservas',
              r.costo, v_detalle, r.fecha, 'reserva', r.id, r.creada_por);
    elsif v_edificio.destino_ingresos = 'gestora' then
      insert into movimientos (org_id, edificio_id, tipo, categoria, monto, detalle,
                               fecha, origen, reserva_id, creado_por)
      values (v_edificio.org_gestora_id, v_edificio.id, 'ingreso', 'reservas',
              r.costo, v_detalle, r.fecha, 'reserva', r.id, r.creada_por);
    else
      v_monto_gestora := trunc(r.costo * (100 - v_edificio.porcentaje_propietaria) / 100, 2);
      v_monto_prop := r.costo - v_monto_gestora;
      if v_monto_prop > 0 then
        insert into movimientos (org_id, edificio_id, tipo, categoria, monto, detalle,
                                 fecha, origen, reserva_id, creado_por)
        values (v_edificio.org_propietaria_id, v_edificio.id, 'ingreso', 'reservas',
                v_monto_prop, v_detalle || ' · ' || v_edificio.porcentaje_propietaria || '%',
                r.fecha, 'reserva', r.id, r.creada_por);
      end if;
      if v_monto_gestora > 0 then
        insert into movimientos (org_id, edificio_id, tipo, categoria, monto, detalle,
                                 fecha, origen, reserva_id, creado_por)
        values (v_edificio.org_gestora_id, v_edificio.id, 'ingreso', 'reservas',
                v_monto_gestora, v_detalle || ' · ' || (100 - v_edificio.porcentaje_propietaria) || '%',
                r.fecha, 'reserva', r.id, r.creada_por);
      end if;
    end if;
  end loop;
end $$;
