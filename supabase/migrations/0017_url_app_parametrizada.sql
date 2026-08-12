-- El job de despacho tenía la URL de producción hardcodeada (0011). Al cambiar
-- el dominio de Vercel el cron quedó posteando contra un 404 y las
-- notificaciones dejaron de salir, en silencio: pg_cron no avisa, y el único
-- rastro queda en cron.job_run_details.
--
-- La URL pasa a config_interna, como el secret: cambiar de dominio ahora es un
-- update de una fila, no una migración. Esto también resuelve la limitación
-- anotada en el README sobre aplicar 0011 a otro entorno.

insert into config_interna (clave, valor)
values ('app_url', 'https://nuevatierra.vercel.app')
on conflict (clave) do update set valor = excluded.valor;

select cron.unschedule('despachar-notificaciones');

select cron.schedule(
  'despachar-notificaciones',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select valor from public.config_interna where clave = 'app_url')
           || '/api/notificaciones/despachar',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select valor from public.config_interna where clave = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
