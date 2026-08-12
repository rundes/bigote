-- El aviso de "esperando pago" no sirve sin los datos de la cuenta. Se agregan
-- al payload en el momento de encolar y no se leen al renderizar: así quedan
-- congelados, y si mañana cambia el alias el mail ya enviado sigue coincidiendo
-- con lo que la persona vio.

create or replace function public.notificar_reserva_pendiente_pago()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_sala text;
  v_edificio text;
  v_cfg cobros_config%rowtype;
begin
  if new.para_perfil_id is null then
    return new;  -- cliente externo: el mail lo manda la app, no tiene perfil
  end if;

  select e.org_propietaria_id, s.nombre, e.nombre
    into v_org, v_sala, v_edificio
  from salas s join edificios e on e.id = s.edificio_id
  where s.id = new.sala_id;

  select * into v_cfg from cobros_config where org_id = v_org;

  perform encolar_notificacion(
    new.para_perfil_id, v_org, 'reserva_esperando_pago',
    jsonb_build_object(
      'reserva_id', new.id,
      'sala', v_sala,
      'edificio', v_edificio,
      'fecha', new.fecha,
      'hora_inicio', new.hora_inicio,
      'horas', new.horas,
      'costo', new.costo,
      'vence_at', new.vence_at,
      'alias', coalesce(v_cfg.alias, ''),
      'cbu', coalesce(v_cfg.cbu, ''),
      'titular', coalesce(v_cfg.titular, ''),
      'banco', coalesce(v_cfg.banco, ''),
      'instrucciones', coalesce(v_cfg.instrucciones, '')
    )
  );
  return new;
end $$;

create or replace function public.notificar_reserva_vencida()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_sala text;
  v_edificio text;
begin
  if new.para_perfil_id is null then
    return new;
  end if;

  select e.org_propietaria_id, s.nombre, e.nombre
    into v_org, v_sala, v_edificio
  from salas s join edificios e on e.id = s.edificio_id
  where s.id = new.sala_id;

  perform encolar_notificacion(
    new.para_perfil_id, v_org, 'reserva_vencida',
    jsonb_build_object('reserva_id', new.id, 'sala', v_sala, 'edificio', v_edificio,
                       'fecha', new.fecha, 'hora_inicio', new.hora_inicio)
  );
  return new;
end $$;
