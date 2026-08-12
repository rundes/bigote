-- Fecha estimada de una tarea. Nullable a propósito: la mayoría de las tareas
-- de una organización chica no tienen fecha, y obligar a poner una convertiría
-- el campo en ruido que nadie mira.
--
-- `date` y no `timestamptz`: es una estimación a nivel día, y guardar hora
-- obligaría a decidir zona horaria para algo que nadie va a mirar al minuto.

alter table tareas add column fecha_estimada date;

-- Las consultas que importan son "mis tareas ordenadas por urgencia" y "las
-- vencidas": ambas filtran por estado distinto de hecha.
create index tareas_fecha_estimada_idx
  on tareas (fecha_estimada)
  where estado <> 'hecha' and fecha_estimada is not null;
