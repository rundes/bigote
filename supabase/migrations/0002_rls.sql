create or replace function public.es_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from super_admins where perfil_id = auth.uid());
$$;

create or replace function public.es_miembro(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from membresias
    where org_id = org and perfil_id = auth.uid() and activo
  );
$$;

create or replace function public.tiene_permiso(org uuid, permiso text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from membresias m join roles r on r.id = m.rol_id
    where m.org_id = org and m.perfil_id = auth.uid() and m.activo
      and coalesce((r.permisos ->> permiso)::boolean, false)
  );
$$;

create or replace function public.opera_edificio(edificio uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from edificios e
    where e.id = edificio
      and (es_miembro(e.org_propietaria_id)
           or (e.org_gestora_id is not null and es_miembro(e.org_gestora_id)))
  );
$$;

-- security definer para evitar recursión RLS: las policies de
-- proyectos/proyecto_miembros/tareas no deben consultarse unas a otras
-- directamente (eso genera "infinite recursion detected in policy").
create or replace function public.es_miembro_del_proyecto(proyecto uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from proyecto_miembros pm
    where pm.proyecto_id = proyecto and pm.perfil_id = auth.uid()
  );
$$;

create or replace function public.org_del_proyecto(proyecto uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select org_id from proyectos where id = proyecto;
$$;

alter table perfiles enable row level security;
alter table super_admins enable row level security;
alter table organizaciones enable row level security;
alter table roles enable row level security;
alter table membresias enable row level security;
alter table proyectos enable row level security;
alter table proyecto_miembros enable row level security;
alter table tareas enable row level security;
alter table clientes enable row level security;
alter table edificios enable row level security;
alter table salas enable row level security;
alter table espacio_media enable row level security;
alter table planes_reserva enable row level security;
alter table reservas enable row level security;
alter table movimientos enable row level security;

-- perfiles: el propio siempre; los de compañeros de alguna org compartida
create policy perfiles_select on perfiles for select using (
  id = auth.uid() or es_super_admin() or exists (
    select 1 from membresias m1
    join membresias m2 on m1.org_id = m2.org_id
    where m1.perfil_id = auth.uid() and m1.activo
      and m2.perfil_id = perfiles.id and m2.activo
  )
);
create policy perfiles_update on perfiles for update using (id = auth.uid());

create policy super_admins_select on super_admins for select using (perfil_id = auth.uid());

create policy organizaciones_select on organizaciones for select using (
  es_miembro(id) or es_super_admin()
  or exists (select 1 from edificios e where (e.org_propietaria_id = organizaciones.id or e.org_gestora_id = organizaciones.id) and opera_edificio(e.id))
);
create policy organizaciones_admin on organizaciones for update using (tiene_permiso(id, 'admin'));

create policy roles_select on roles for select using (es_miembro(org_id));
create policy roles_admin on roles for all using (tiene_permiso(org_id, 'admin'));

create policy membresias_select on membresias for select using (
  perfil_id = auth.uid() or es_miembro(org_id)
);
create policy membresias_admin on membresias for all using (tiene_permiso(org_id, 'admin'));

create policy proyectos_select on proyectos for select using (
  tiene_permiso(org_id, 'proyectos') or tiene_permiso(org_id, 'admin')
  or es_miembro_del_proyecto(id)
);
create policy proyectos_write on proyectos for all using (tiene_permiso(org_id, 'proyectos'));

create policy proyecto_miembros_select on proyecto_miembros for select using (
  es_miembro(org_del_proyecto(proyecto_id))
);
create policy proyecto_miembros_write on proyecto_miembros for all using (
  tiene_permiso(org_del_proyecto(proyecto_id), 'proyectos')
);

-- tareas: solo miembros del proyecto (spec §4); escritura fina (tomar/completar) se refina en fase 2
create policy tareas_select on tareas for select using (
  es_miembro_del_proyecto(proyecto_id) or tiene_permiso(org_del_proyecto(proyecto_id), 'admin')
);
create policy tareas_write on tareas for all using (
  es_miembro_del_proyecto(proyecto_id) or tiene_permiso(org_del_proyecto(proyecto_id), 'admin')
);

create policy clientes_select on clientes for select using (es_miembro(org_id));
create policy clientes_insert on clientes for insert with check (es_miembro(org_id));
create policy clientes_admin on clientes for update using (tiene_permiso(org_id, 'espacios'));

create policy edificios_select on edificios for select using (opera_edificio(id));
create policy edificios_write on edificios for all using (
  tiene_permiso(org_propietaria_id, 'espacios')
  or (org_gestora_id is not null and tiene_permiso(org_gestora_id, 'espacios'))
);

create policy salas_select on salas for select using (opera_edificio(edificio_id));
create policy salas_write on salas for all using (
  exists (select 1 from edificios e where e.id = salas.edificio_id
    and (tiene_permiso(e.org_propietaria_id, 'espacios')
         or (e.org_gestora_id is not null and tiene_permiso(e.org_gestora_id, 'espacios'))))
);

create policy espacio_media_select on espacio_media for select using (
  (edificio_id is not null and opera_edificio(edificio_id))
  or (sala_id is not null and exists (select 1 from salas s where s.id = sala_id and opera_edificio(s.edificio_id)))
);
create policy espacio_media_write on espacio_media for all using (
  (edificio_id is not null and exists (select 1 from edificios e where e.id = edificio_id
     and (tiene_permiso(e.org_propietaria_id, 'espacios') or (e.org_gestora_id is not null and tiene_permiso(e.org_gestora_id, 'espacios')))))
  or (sala_id is not null and exists (select 1 from salas s join edificios e on e.id = s.edificio_id where s.id = sala_id
     and (tiene_permiso(e.org_propietaria_id, 'espacios') or (e.org_gestora_id is not null and tiene_permiso(e.org_gestora_id, 'espacios')))))
);

create policy planes_select on planes_reserva for select using (
  es_miembro(org_id)
  or exists (select 1 from edificios e where e.org_propietaria_id = planes_reserva.org_id and e.org_gestora_id is not null and es_miembro(e.org_gestora_id))
);
create policy planes_write on planes_reserva for all using (tiene_permiso(org_id, 'espacios'));

-- reservas: ver y crear, cualquier miembro que opere el edificio; cancelar propia o con permiso espacios
create policy reservas_select on reservas for select using (
  exists (select 1 from salas s where s.id = reservas.sala_id and opera_edificio(s.edificio_id))
);
create policy reservas_insert on reservas for insert with check (
  creada_por = auth.uid()
  and exists (select 1 from salas s where s.id = sala_id and opera_edificio(s.edificio_id))
);
create policy reservas_update on reservas for update using (
  creada_por = auth.uid()
  or exists (select 1 from salas s join edificios e on e.id = s.edificio_id where s.id = reservas.sala_id
       and (tiene_permiso(e.org_propietaria_id, 'espacios')
            or (e.org_gestora_id is not null and tiene_permiso(e.org_gestora_id, 'espacios'))))
) with check (
  exists (select 1 from salas s where s.id = sala_id and opera_edificio(s.edificio_id))
);

create policy movimientos_select on movimientos for select using (tiene_permiso(org_id, 'finanzas'));
create policy movimientos_insert on movimientos for insert with check (
  tiene_permiso(org_id, 'finanzas') and origen = 'manual' and creado_por = auth.uid()
);
create policy movimientos_update on movimientos for update using (
  tiene_permiso(org_id, 'finanzas') and origen = 'manual'
);
