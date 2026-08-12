-- Inventario: existencias por cantidad (libros, gráficos) y activos únicos
-- (equipamiento, mobiliario, cables), con etiquetas QR y despacho a
-- destinatarios. Spec: docs/superpowers/specs/2026-08-11-inventario-qr-design.md
--
-- El stock es un libro de movimientos, no un contador mutable: un campo que se
-- pisa no dice a quién se le despacharon los ejemplares que faltan.

-- ---------------------------------------------------------------- tablas

create table inventario_ubicaciones (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizaciones (id) on delete cascade,
  nombre text not null,
  edificio_id uuid references edificios (id) on delete set null,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, nombre)
);

create table inventario_destinatarios (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizaciones (id) on delete cascade,
  nombre text not null,
  localidad text not null default '',
  provincia text not null default '',
  contacto_nombre text not null default '',
  email text,
  direccion text not null default '',
  cliente_id uuid references clientes (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, nombre)
);

create table inventario_articulos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizaciones (id) on delete cascade,
  codigo text not null unique,
  nombre text not null,
  descripcion text not null default '',
  categoria text not null check (categoria in
    ('libro', 'grafico', 'equipamiento', 'mobiliario', 'cable', 'otro')),
  naturaleza text not null check (naturaleza in ('existencia', 'activo')),
  ubicacion_id uuid references inventario_ubicaciones (id) on delete set null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create index inventario_articulos_org_idx on inventario_articulos (org_id);

create table inventario_paquetes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizaciones (id) on delete cascade,
  codigo text not null unique,
  destinatario_id uuid not null references inventario_destinatarios (id),
  estado text not null default 'abierto' check (estado in ('abierto', 'despachado')),
  nota text not null default '',
  despachado_at timestamptz,
  despachado_por uuid references perfiles (id),
  created_at timestamptz not null default now(),
  check (estado <> 'despachado' or despachado_at is not null)
);

create table inventario_paquete_items (
  paquete_id uuid not null references inventario_paquetes (id) on delete cascade,
  articulo_id uuid not null references inventario_articulos (id),
  cantidad int not null check (cantidad > 0),
  primary key (paquete_id, articulo_id)
);

-- cantidad positiva en alta y devolucion, negativa en prestamo, despacho y
-- baja. ajuste admite ambos signos. El stock es sum(cantidad).
create table inventario_movimientos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizaciones (id) on delete cascade,
  articulo_id uuid not null references inventario_articulos (id),
  paquete_id uuid references inventario_paquetes (id),
  tipo text not null check (tipo in
    ('alta', 'prestamo', 'devolucion', 'despacho', 'ajuste', 'baja')),
  cantidad int not null check (cantidad <> 0),
  destinatario_id uuid references inventario_destinatarios (id),
  perfil_id uuid references perfiles (id),
  devolucion_esperada date,
  nota text not null default '',
  creado_por uuid not null references perfiles (id),
  created_at timestamptz not null default now()
);

create index inventario_movimientos_articulo_idx
  on inventario_movimientos (articulo_id, created_at desc);

create view inventario_stock as
  select articulo_id, coalesce(sum(cantidad), 0)::int as stock
  from inventario_movimientos
  group by articulo_id;

-- ------------------------------------------------------------- helpers

create or replace function public.inv_prefijo(categoria text)
returns text language sql immutable as $$
  select case categoria
    when 'libro' then 'LB'
    when 'grafico' then 'GR'
    when 'equipamiento' then 'EQ'
    when 'mobiliario' then 'MB'
    when 'cable' then 'CB'
    else 'OT'
  end;
$$;

-- Crockford base32 sin I, L, O ni U: nadie confunde el código al tipearlo.
-- Aleatorio y no correlativo porque un correlativo por organización colisiona
-- entre organizaciones (el código resuelve su propia org en /q/<codigo>) y
-- además publicaría cuántas cosas tiene cada una.
create or replace function public.inv_generar_codigo(prefijo text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_alfabeto constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_codigo text;
  v_intentos int := 0;
begin
  loop
    v_codigo := prefijo || '-';
    for i in 1..6 loop
      v_codigo := v_codigo || substr(v_alfabeto, 1 + floor(random() * 32)::int, 1);
    end loop;

    exit when not exists (select 1 from inventario_articulos where codigo = v_codigo)
          and not exists (select 1 from inventario_paquetes where codigo = v_codigo);

    v_intentos := v_intentos + 1;
    if v_intentos > 20 then
      raise exception 'No se pudo generar un código único';
    end if;
  end loop;
  return v_codigo;
end $$;

create or replace function public.inv_stock_actual(articulo uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(cantidad), 0)::int
  from inventario_movimientos where articulo_id = articulo;
$$;

-- Estado de un activo = tipo del último movimiento. ajuste no aplica a activos
-- (una cantidad de 1 no se corrige, se da de baja) y las RPC lo rechazan.
create or replace function public.inv_estado_activo(articulo uuid)
returns text language sql stable security definer set search_path = public as $$
  select case (
    select tipo from inventario_movimientos
    where articulo_id = articulo
    order by created_at desc, id desc limit 1
  )
    when 'prestamo' then 'prestado'
    when 'despacho' then 'salido'
    when 'baja' then 'salido'
    else 'disponible'
  end;
$$;

create or replace function public.inv_org_del_articulo(articulo uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select org_id from inventario_articulos where id = articulo;
$$;

create or replace function public.inv_org_del_paquete(paquete uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select org_id from inventario_paquetes where id = paquete;
$$;

-- ------------------------------------------------------------------ RLS

alter table inventario_ubicaciones enable row level security;
alter table inventario_destinatarios enable row level security;
alter table inventario_articulos enable row level security;
alter table inventario_paquetes enable row level security;
alter table inventario_paquete_items enable row level security;
alter table inventario_movimientos enable row level security;

-- Leer lo puede cualquier miembro: escanear una etiqueta y ver qué es no
-- requiere administrar el inventario. Escribir sí exige el permiso.
create policy inv_ubicaciones_select on inventario_ubicaciones for select
  using (es_miembro(org_id));
create policy inv_ubicaciones_write on inventario_ubicaciones for all
  using (tiene_permiso(org_id, 'inventario'));

create policy inv_destinatarios_select on inventario_destinatarios for select
  using (es_miembro(org_id));
create policy inv_destinatarios_write on inventario_destinatarios for all
  using (tiene_permiso(org_id, 'inventario'));

create policy inv_articulos_select on inventario_articulos for select
  using (es_miembro(org_id));
create policy inv_articulos_write on inventario_articulos for all
  using (tiene_permiso(org_id, 'inventario'));

create policy inv_paquetes_select on inventario_paquetes for select
  using (es_miembro(org_id));
create policy inv_paquetes_write on inventario_paquetes for all
  using (tiene_permiso(org_id, 'inventario'));

create policy inv_paquete_items_select on inventario_paquete_items for select
  using (es_miembro(inv_org_del_paquete(paquete_id)));
create policy inv_paquete_items_write on inventario_paquete_items for all
  using (tiene_permiso(inv_org_del_paquete(paquete_id), 'inventario'));

-- Los movimientos se escriben solo por RPC (security definer): sin policy de
-- escritura, nadie puede falsear el libro desde el cliente.
create policy inv_movimientos_select on inventario_movimientos for select
  using (es_miembro(org_id));

-- ------------------------------------------------------------------ RPC

create or replace function public.inv_crear_articulo(
  org uuid, nombre text, descripcion text, categoria text,
  naturaleza text, ubicacion uuid default null, cantidad_inicial int default 1)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_codigo text;
begin
  if not tiene_permiso(org, 'inventario') then
    raise exception 'No tenés permiso para administrar el inventario';
  end if;
  if btrim(nombre) = '' then
    raise exception 'Poné un nombre';
  end if;
  if naturaleza = 'activo' and cantidad_inicial <> 1 then
    raise exception 'Un activo es una sola cosa: la cantidad tiene que ser 1';
  end if;
  if cantidad_inicial < 1 then
    raise exception 'La cantidad inicial no puede ser menor a 1';
  end if;
  if ubicacion is not null
     and not exists (select 1 from inventario_ubicaciones
                     where id = ubicacion and org_id = org) then
    raise exception 'Esa ubicación no es de la organización';
  end if;

  v_codigo := inv_generar_codigo(inv_prefijo(categoria));

  insert into inventario_articulos
    (org_id, codigo, nombre, descripcion, categoria, naturaleza, ubicacion_id)
  values (org, v_codigo, btrim(nombre), coalesce(btrim(descripcion), ''),
          categoria, naturaleza, ubicacion)
  returning id into v_id;

  insert into inventario_movimientos
    (org_id, articulo_id, tipo, cantidad, nota, creado_por)
  values (org, v_id, 'alta', cantidad_inicial, 'Alta inicial', auth.uid());

  return v_id;
end $$;

create or replace function public.inv_prestar(
  articulo uuid, a_perfil uuid, devolucion date default null, nota text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_art inventario_articulos%rowtype;
begin
  select * into v_art from inventario_articulos where id = articulo for update;
  if v_art.id is null then
    raise exception 'Ese artículo no existe';
  end if;
  if not tiene_permiso(v_art.org_id, 'inventario') then
    raise exception 'No tenés permiso para administrar el inventario';
  end if;
  if v_art.naturaleza = 'activo' and inv_estado_activo(articulo) <> 'disponible' then
    raise exception 'Ese activo no está disponible';
  end if;
  if v_art.naturaleza = 'existencia' and inv_stock_actual(articulo) < 1 then
    raise exception 'No queda stock para prestar';
  end if;
  if not exists (select 1 from membresias
                 where org_id = v_art.org_id and perfil_id = a_perfil and activo) then
    raise exception 'Esa persona no es miembro de la organización';
  end if;

  insert into inventario_movimientos
    (org_id, articulo_id, tipo, cantidad, perfil_id, devolucion_esperada, nota, creado_por)
  values (v_art.org_id, articulo, 'prestamo', -1, a_perfil, devolucion,
          coalesce(btrim(nota), ''), auth.uid());
end $$;

create or replace function public.inv_devolver(articulo uuid, nota text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_art inventario_articulos%rowtype;
begin
  select * into v_art from inventario_articulos where id = articulo for update;
  if v_art.id is null then
    raise exception 'Ese artículo no existe';
  end if;
  if not tiene_permiso(v_art.org_id, 'inventario') then
    raise exception 'No tenés permiso para administrar el inventario';
  end if;
  if v_art.naturaleza = 'activo' and inv_estado_activo(articulo) <> 'prestado' then
    raise exception 'Ese activo no está prestado';
  end if;

  insert into inventario_movimientos
    (org_id, articulo_id, tipo, cantidad, nota, creado_por)
  values (v_art.org_id, articulo, 'devolucion', 1, coalesce(btrim(nota), ''), auth.uid());
end $$;

create or replace function public.inv_ajustar(
  articulo uuid, delta int, nota text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_art inventario_articulos%rowtype;
begin
  select * into v_art from inventario_articulos where id = articulo for update;
  if v_art.id is null then
    raise exception 'Ese artículo no existe';
  end if;
  if not tiene_permiso(v_art.org_id, 'inventario') then
    raise exception 'No tenés permiso para administrar el inventario';
  end if;
  if v_art.naturaleza = 'activo' then
    raise exception 'Un activo no se ajusta por cantidad: dalo de baja';
  end if;
  if delta = 0 then
    raise exception 'El ajuste no puede ser cero';
  end if;
  if inv_stock_actual(articulo) + delta < 0 then
    raise exception 'El ajuste dejaría el stock en negativo';
  end if;

  insert into inventario_movimientos
    (org_id, articulo_id, tipo, cantidad, nota, creado_por)
  values (v_art.org_id, articulo, 'ajuste', delta, coalesce(btrim(nota), ''), auth.uid());
end $$;

create or replace function public.inv_crear_paquete(
  org uuid, destinatario uuid, nota text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not tiene_permiso(org, 'inventario') then
    raise exception 'No tenés permiso para administrar el inventario';
  end if;
  if not exists (select 1 from inventario_destinatarios
                 where id = destinatario and org_id = org) then
    raise exception 'Ese destinatario no es de la organización';
  end if;

  insert into inventario_paquetes (org_id, codigo, destinatario_id, nota)
  values (org, inv_generar_codigo('PK'), destinatario, coalesce(btrim(nota), ''))
  returning id into v_id;

  return v_id;
end $$;

create or replace function public.inv_agregar_a_paquete(
  paquete uuid, articulo uuid, cantidad int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_paq inventario_paquetes%rowtype;
  v_art inventario_articulos%rowtype;
begin
  select * into v_paq from inventario_paquetes where id = paquete for update;
  if v_paq.id is null then
    raise exception 'Ese paquete no existe';
  end if;
  if not tiene_permiso(v_paq.org_id, 'inventario') then
    raise exception 'No tenés permiso para administrar el inventario';
  end if;
  if v_paq.estado = 'despachado' then
    raise exception 'Ese paquete ya se despachó y no se puede modificar';
  end if;
  if cantidad < 1 then
    raise exception 'La cantidad tiene que ser al menos 1';
  end if;

  select * into v_art from inventario_articulos where id = articulo;
  if v_art.id is null or v_art.org_id <> v_paq.org_id then
    raise exception 'Ese artículo no es de la organización';
  end if;
  if v_art.naturaleza = 'activo' and cantidad <> 1 then
    raise exception 'Un activo entra de a uno';
  end if;

  insert into inventario_paquete_items (paquete_id, articulo_id, cantidad)
  values (paquete, articulo, cantidad)
  on conflict (paquete_id, articulo_id)
    do update set cantidad = inventario_paquete_items.cantidad + excluded.cantidad;
end $$;

-- Valida el stock de todos los ítems antes de escribir ninguno: o se despacha
-- el paquete entero o no se despacha nada.
create or replace function public.inv_despachar_paquete(paquete uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_paq inventario_paquetes%rowtype;
  v_item record;
begin
  select * into v_paq from inventario_paquetes where id = paquete for update;
  if v_paq.id is null then
    raise exception 'Ese paquete no existe';
  end if;
  if not tiene_permiso(v_paq.org_id, 'inventario') then
    raise exception 'No tenés permiso para administrar el inventario';
  end if;
  if v_paq.estado = 'despachado' then
    raise exception 'Ese paquete ya se despachó';
  end if;
  if not exists (select 1 from inventario_paquete_items where paquete_id = paquete) then
    raise exception 'El paquete está vacío';
  end if;

  for v_item in
    select pi.articulo_id, pi.cantidad, a.nombre, a.naturaleza
    from inventario_paquete_items pi
    join inventario_articulos a on a.id = pi.articulo_id
    where pi.paquete_id = paquete
  loop
    if v_item.naturaleza = 'activo' then
      if inv_estado_activo(v_item.articulo_id) <> 'disponible' then
        raise exception 'El activo "%" no está disponible', v_item.nombre;
      end if;
    elsif inv_stock_actual(v_item.articulo_id) < v_item.cantidad then
      raise exception 'No hay stock suficiente de "%"', v_item.nombre;
    end if;
  end loop;

  insert into inventario_movimientos
    (org_id, articulo_id, paquete_id, tipo, cantidad, destinatario_id, creado_por)
  select v_paq.org_id, pi.articulo_id, paquete, 'despacho', -pi.cantidad,
         v_paq.destinatario_id, auth.uid()
  from inventario_paquete_items pi
  where pi.paquete_id = paquete;

  update inventario_paquetes
  set estado = 'despachado', despachado_at = now(), despachado_por = auth.uid()
  where id = paquete;
end $$;

create or replace function public.inv_dar_de_baja(articulo uuid, nota text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_art inventario_articulos%rowtype;
  v_stock int;
begin
  select * into v_art from inventario_articulos where id = articulo for update;
  if v_art.id is null then
    raise exception 'Ese artículo no existe';
  end if;
  if not tiene_permiso(v_art.org_id, 'inventario') then
    raise exception 'No tenés permiso para administrar el inventario';
  end if;

  v_stock := inv_stock_actual(articulo);
  if v_stock < 1 then
    raise exception 'No queda nada para dar de baja';
  end if;

  insert into inventario_movimientos
    (org_id, articulo_id, tipo, cantidad, nota, creado_por)
  values (v_art.org_id, articulo, 'baja', -v_stock,
          coalesce(btrim(nota), ''), auth.uid());

  update inventario_articulos set activo = false where id = articulo;
end $$;

-- ---------------------------------------------------- permiso inventario

alter table roles alter column permisos set default
  '{"proyectos":false,"equipo":false,"finanzas":false,"espacios":false,"admin":false,"inventario":false}';

-- Filas existentes: agregar la clave, y darla por verdadera a quien ya
-- administra, para que no quede afuera de una sección nueva.
update roles
set permisos = permisos || jsonb_build_object(
  'inventario', coalesce((permisos ->> 'admin')::boolean, false))
where not (permisos ? 'inventario');
