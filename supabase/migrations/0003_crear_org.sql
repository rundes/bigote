-- Panel de plataforma (super-admin): crea una organización nueva con sus
-- 3 roles semilla. La membresía del primer admin la crea la server action
-- (necesita invitar/ubicar al usuario primero), por eso este RPC recibe
-- email_admin pero no lo usa todavía: se mantiene en la firma para que la
-- server action pueda llamarlo con todos los datos del form de una vez.
create or replace function public.crear_organizacion(nombre text, tipo text, email_admin text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  nueva_org_id uuid;
begin
  if not es_super_admin() then
    raise exception 'Solo plataforma';
  end if;

  insert into organizaciones (nombre, tipo) values (nombre, tipo)
  returning id into nueva_org_id;

  insert into roles (org_id, nombre, permisos) values
    (nueva_org_id, 'Administración', '{"proyectos":true,"equipo":true,"finanzas":true,"espacios":true,"admin":true}'),
    (nueva_org_id, 'Coordinación', '{"proyectos":true,"equipo":true,"finanzas":false,"espacios":false,"admin":false}'),
    (nueva_org_id, 'Operaciones', '{"proyectos":true,"equipo":false,"finanzas":false,"espacios":true,"admin":false}');

  return nueva_org_id;
end;
$$;
