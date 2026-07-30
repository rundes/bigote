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
  if v_asignado is null or v_asignado <> auth.uid() then
    if not tiene_permiso(v_org, 'admin') then
      raise exception 'Solo la persona asignada (o admin) puede marcarla hecha';
    end if;
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
    and (desde is null or t.completada_at >= (desde::timestamp at time zone 'America/Argentina/Buenos_Aires'))
    and (hasta is null or t.completada_at < ((hasta + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires'))
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
-- Las funciones nacen con EXECUTE otorgado a PUBLIC (comportamiento default de
-- Postgres); `revoke ... from anon` por sí solo no alcanza porque el grant a
-- PUBLIC sigue vigente. Hay que revocar de PUBLIC (y anon, redundante pero
-- explícito) y re-otorgar solo a authenticated/service_role.
revoke execute on function public.org_del_proyecto(uuid) from public, anon;
grant execute on function public.org_del_proyecto(uuid) to authenticated, service_role;

revoke execute on function public.es_miembro_del_proyecto(uuid) from public, anon;
grant execute on function public.es_miembro_del_proyecto(uuid) to authenticated, service_role;

revoke execute on function public.tomar_tarea(uuid) from public, anon;
grant execute on function public.tomar_tarea(uuid) to authenticated, service_role;

revoke execute on function public.soltar_tarea(uuid) from public, anon;
grant execute on function public.soltar_tarea(uuid) to authenticated, service_role;

revoke execute on function public.completar_tarea(uuid) from public, anon;
grant execute on function public.completar_tarea(uuid) to authenticated, service_role;

revoke execute on function public.track_record(uuid, date, date, uuid) from public, anon;
grant execute on function public.track_record(uuid, date, date, uuid) to authenticated, service_role;
