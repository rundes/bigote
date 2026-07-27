create extension if not exists btree_gist;

create table perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null default '',
  email text not null,
  created_at timestamptz not null default now()
);

create table super_admins (
  perfil_id uuid primary key references perfiles (id) on delete cascade
);

create table organizaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null default 'empresa' check (tipo in ('empresa', 'asociacion_civil', 'otro')),
  created_at timestamptz not null default now()
);

create table roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizaciones (id) on delete cascade,
  nombre text not null,
  permisos jsonb not null default '{"proyectos":false,"equipo":false,"finanzas":false,"espacios":false,"admin":false}',
  unique (org_id, nombre)
);

create table membresias (
  org_id uuid not null references organizaciones (id) on delete cascade,
  perfil_id uuid not null references perfiles (id) on delete cascade,
  rol_id uuid not null references roles (id),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (org_id, perfil_id)
);

create table proyectos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizaciones (id) on delete cascade,
  nombre text not null,
  estado text not null default 'activo' check (estado in ('activo', 'archivado')),
  creado_por uuid references perfiles (id),
  created_at timestamptz not null default now()
);

create table proyecto_miembros (
  proyecto_id uuid not null references proyectos (id) on delete cascade,
  perfil_id uuid not null references perfiles (id) on delete cascade,
  primary key (proyecto_id, perfil_id)
);

create table tareas (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos (id) on delete cascade,
  titulo text not null,
  descripcion text not null default '',
  dificultad int not null check (dificultad between 1 and 5),
  asignado_a uuid references perfiles (id),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'hecha')),
  completada_por uuid references perfiles (id),
  completada_at timestamptz,
  created_at timestamptz not null default now()
);

create table clientes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizaciones (id) on delete cascade,
  nombre text not null,
  contacto text,
  created_at timestamptz not null default now()
);

create table edificios (
  id uuid primary key default gen_random_uuid(),
  org_propietaria_id uuid not null references organizaciones (id) on delete cascade,
  org_gestora_id uuid references organizaciones (id),
  nombre text not null,
  direccion text not null default '',
  descripcion text not null default '',
  destino_ingresos text not null default 'propietaria'
    check (destino_ingresos in ('propietaria', 'gestora', 'reparto')),
  porcentaje_propietaria numeric,
  created_at timestamptz not null default now(),
  check (destino_ingresos <> 'reparto' or (porcentaje_propietaria is not null and porcentaje_propietaria between 0 and 100)),
  check (destino_ingresos = 'propietaria' or org_gestora_id is not null)
);

create table salas (
  id uuid primary key default gen_random_uuid(),
  edificio_id uuid not null references edificios (id) on delete cascade,
  nombre text not null,
  tipo text not null default 'publica' check (tipo in ('publica', 'privada')),
  descripcion text not null default '',
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

create table espacio_media (
  id uuid primary key default gen_random_uuid(),
  edificio_id uuid references edificios (id) on delete cascade,
  sala_id uuid references salas (id) on delete cascade,
  tipo text not null check (tipo in ('foto', 'video')),
  storage_path text not null,
  orden int not null default 0,
  check ((edificio_id is null) <> (sala_id is null))
);

create table planes_reserva (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizaciones (id) on delete cascade,
  nombre text not null,
  gratuito boolean not null default false,
  precio_hora numeric not null default 0,
  horas_gratis_mes int,
  solo_salas_publicas boolean not null default false
);

create table reservas (
  id uuid primary key default gen_random_uuid(),
  sala_id uuid not null references salas (id),
  plan_id uuid not null references planes_reserva (id),
  cliente_id uuid references clientes (id),
  para_perfil_id uuid references perfiles (id),
  fecha date not null,
  hora_inicio int not null check (hora_inicio between 8 and 21),
  horas int not null check (horas between 1 and 14),
  costo numeric not null default 0,
  estado text not null default 'confirmada' check (estado in ('confirmada', 'cancelada')),
  motivo_cancelacion text,
  creada_por uuid not null references perfiles (id),
  created_at timestamptz not null default now(),
  check ((cliente_id is null) <> (para_perfil_id is null)),
  constraint reservas_sin_solape exclude using gist (
    sala_id with =,
    fecha with =,
    int4range(hora_inicio, hora_inicio + horas) with &&
  ) where (estado = 'confirmada')
);

create table movimientos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizaciones (id) on delete cascade,
  edificio_id uuid references edificios (id),
  tipo text not null check (tipo in ('ingreso', 'egreso')),
  categoria text not null default 'general',
  monto numeric not null check (monto > 0),
  detalle text not null default '',
  fecha date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  origen text not null default 'manual' check (origen in ('manual', 'reserva')),
  reserva_id uuid references reservas (id),
  creado_por uuid references perfiles (id)
);

create or replace function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''), new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger crear_perfil_trigger
  after insert on auth.users
  for each row execute function public.crear_perfil();
