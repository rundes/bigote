-- Fase 3: reservas por RPC (costo server-side), endurecimiento de políticas
-- y bucket de media para espacios.

create or replace function public.administra_edificio(edificio uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from edificios e
    where e.id = edificio
      and (tiene_permiso(e.org_propietaria_id, 'espacios')
           or (e.org_gestora_id is not null and tiene_permiso(e.org_gestora_id, 'espacios')))
  );
$$;

-- Crea una reserva validando todo en el servidor: sala activa, membresía,
-- fecha, plan de la org propietaria del edificio, restricción de salas
-- públicas y cliente de la org propietaria. El costo se calcula acá: nunca
-- viaja del cliente (precondición del trigger de finanzas de fase 4).
create or replace function public.crear_reserva(
  sala uuid, plan uuid, dia date, inicio int, duracion int, cliente uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_sala salas%rowtype;
  v_plan planes_reserva%rowtype;
  v_org_propietaria uuid;
  v_costo numeric;
  v_id uuid;
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

  begin
    insert into reservas (sala_id, plan_id, cliente_id, para_perfil_id,
                          fecha, hora_inicio, horas, costo, creada_por)
    values (sala, plan, cliente,
            case when cliente is null then auth.uid() end,
            dia, inicio, duracion, v_costo, auth.uid())
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'Ese horario ya está reservado';
  end;

  return v_id;
end $$;

create or replace function public.cancelar_reserva(reserva uuid, motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_reserva reservas%rowtype;
  v_edificio uuid;
begin
  select * into v_reserva from reservas where id = reserva;
  if v_reserva.id is null or v_reserva.estado <> 'confirmada' then
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

-- Toda mutación de reservas pasa por las RPCs de arriba: sin insert/update
-- directo (así el costo y las validaciones no se pueden saltear).
drop policy reservas_insert on reservas;
drop policy reservas_update on reservas;

-- Bucket público para fotos/videos de edificios y salas. Path convención:
-- <edificio_id>/<uuid>.<ext> — la escritura exige permiso `espacios` sobre
-- ese edificio (propietaria o gestora). Lectura pública (URLs públicas).
insert into storage.buckets (id, name, public, file_size_limit)
values ('espacios', 'espacios', true, 209715200)
on conflict (id) do nothing;

create policy espacios_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'espacios' and administra_edificio((split_part(name, '/', 1))::uuid));
create policy espacios_media_update on storage.objects for update to authenticated
  using (bucket_id = 'espacios' and administra_edificio((split_part(name, '/', 1))::uuid));
create policy espacios_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'espacios' and administra_edificio((split_part(name, '/', 1))::uuid));

revoke execute on function public.administra_edificio(uuid) from anon;
revoke execute on function public.crear_reserva(uuid, uuid, date, int, int, uuid) from anon;
revoke execute on function public.cancelar_reserva(uuid, text) from anon;
