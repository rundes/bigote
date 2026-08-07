-- 0011: disparo del despacho cada 5 min (spec §6 enmendado: pg_cron en vez
-- de Vercel Cron — el plan hobby de Vercel solo permite frecuencia diaria).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- El secret vive en una tabla interna solo-service-role (no en el texto del
-- job, que es legible por cualquier rol con acceso a cron.job). Se crea
-- ANTES del cron.schedule porque el job la referencia en su query.
create table if not exists config_interna (
  clave text primary key,
  valor text not null
);
alter table config_interna enable row level security;  -- sin políticas: solo service role

select cron.schedule(
  'despachar-notificaciones',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://bigote-gilt.vercel.app/api/notificaciones/despachar',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select valor from public.config_interna where clave = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
