-- 0010: ajustes de despacho tras review de 0009 (grants, backfill, tope de rescate)

-- 1 (crítico): grant explícito a service_role. El revoke de 0009 dejó a
-- service_role con EXECUTE vía default privilege de la plataforma (verificado
-- con pg_proc.proacl), pero el patrón del repo (0004) siempre es explícito.
grant execute on function public.reclamar_notificaciones(text[], int) to service_role;
grant execute on function public.rescatar_notificaciones_colgadas() to service_role;

-- 2 (important): backfill de reserva_id. Filas encoladas bajo 0008 lo tienen
-- null; el descarte de recordatorio en notificar_reserva_cancelada ahora usa
-- la columna, no el payload. El filtro "exists" es necesario: reserva_id
-- tiene FK a reservas y hay filas de 0008 cuyo payload apunta a una reserva
-- ya borrada (datos de prueba); sin el filtro el update viola la FK.
update notificaciones n set reserva_id = (payload ->> 'reserva_id')::uuid
 where n.reserva_id is null and n.payload ? 'reserva_id'
   and exists (select 1 from reservas r where r.id = (n.payload ->> 'reserva_id')::uuid);

-- 3 (important): tope de rescate. Sin esto, un mensaje venenoso que tumbe al
-- dispatcher loopea claim → crash → rescate para siempre. A partir del 5º
-- intento se marca fallida en vez de reencolarse. Incluye guard de
-- reclamada_en null (mismo agujero: una fila 'enviando' sin reclamada_en
-- nunca sería rescatada).
create or replace function public.rescatar_notificaciones_colgadas()
returns int
language sql
security definer
set search_path = ''
as $$
  with rescatadas as (
    update public.notificaciones
       set estado = case when intentos >= 5 then 'fallida' else 'pendiente' end,
           intentos = intentos + 1,
           reclamada_en = null,
           ultimo_error = coalesce(ultimo_error, 'rescate: dispatcher colgado')
     where estado = 'enviando'
       and (reclamada_en is null or reclamada_en < now() - interval '10 minutes')
    returning 1
  )
  select count(*)::int from rescatadas;
$$;

revoke execute on function public.rescatar_notificaciones_colgadas()
  from public, anon, authenticated;
grant execute on function public.rescatar_notificaciones_colgadas() to service_role;
