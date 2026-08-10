# Spec — bigote v2: notificaciones multicanal + bot de WhatsApp

**Fecha:** 2026-08-05
**Estado:** diseño aprobado en brainstorming; pendiente de plan de implementación.

## 1. Objetivo

Avisar a los miembros de lo que pasa en su organización (reservas, invitaciones, tareas) por tres canales — WhatsApp, email y push web — y permitir operar reservas de salas conversando con un bot de WhatsApp en lenguaje natural.

## 2. Decisiones tomadas

- **Arquitectura:** patrón outbox en Postgres. Las acciones insertan filas en `notificaciones`; cada canal despacha por su lado. Ningún canal acopla a otro: si el bot de WhatsApp cae, email y push siguen.
- **WhatsApp:** open-wa (`@open-wa/wa-automate`), API no oficial. **Chip prepago dedicado, un solo número para toda la plataforma.** Riesgo asumido: WhatsApp puede bloquear el número; por eso el chip no vale nada y los otros dos canales no dependen de él.
- **Interpretación de mensajes:** Claude API con herramientas (tool use). Sin menús ni comandos.
- **Hosting del bot:** servicio Node aparte en Docker (open-wa necesita Chromium y sesión persistente; no corre en Vercel). Host a decidir en la fase 4 (candidatos: Railway, Fly.io, VPS).
- **Email:** Resend. **Push:** Web Push estándar (VAPID + service worker).
- **Recordatorio de reserva:** fijo, 24 h antes del inicio. Si vence sin enviarse, se descarta.
- **Preferencias:** por canal (on/off por usuario). Granularidad por tipo de evento queda fuera de alcance.

## 3. Eventos que notifican

| Evento | Destinatarios |
|---|---|
| `reserva_confirmada` | quien reservó |
| `reserva_recordatorio` | quien reservó (24 h antes) |
| `reserva_cancelada` | quien reservó + miembros con permiso `espacios` de la org |
| `invitacion` | invitado (email siempre — es el canal de entrada; WA/push si ya tiene cuenta con teléfono) |
| `tarea_asignada` | asignado |
| `tarea_hecha` | quien creó la tarea (si no es quien la hizo) |

Movimientos financieros: fuera de alcance (decisión explícita).

## 4. Datos (migración nueva)

- **`perfiles.telefono`** `text` único, formato E.164 (`+549...`). Se carga en el perfil propio (página nueva en "Más"). Es la identidad ante el bot: número entrante que matchea = miembro identificado. Sin verificación por código en v2.
- **`notificaciones`** (outbox): `id`, `org_id`, `usuario_id` (destinatario), `evento` (enum de §3), `canal` (`wa`|`email`|`push`), `payload` jsonb (datos para armar el texto), `estado` (`pendiente`|`enviada`|`fallida`|`descartada`), `programada_para` timestamptz null (solo recordatorios), `intentos` int, `creada_en`, `enviada_en`. Una fila por destinatario × canal, filtrada por preferencias al momento de crear.
- **`preferencias_notificaciones`**: `usuario_id`, `wa` bool, `email` bool, `push` bool. Default: todo on.
- **`push_suscripciones`**: `usuario_id`, `endpoint`, `p256dh`, `auth`, `creada_en`. Una por dispositivo.
- **`wa_mensajes`**: log del bot — `numero`, `usuario_id` null, `direccion` (`entrante`|`saliente`), `texto`, `creado_en`. Trazabilidad + contexto conversacional (últimos N mensajes como historia para Claude).

**RLS:** `notificaciones` y `preferencias_notificaciones` y `push_suscripciones`: cada usuario ve/edita solo lo suyo. `wa_mensajes`: solo service role (ningún acceso desde el cliente).

## 5. Generación de eventos

**(Enmendado en fase 1.)** Triggers en Postgres sobre `reservas` (insert → confirmada + recordatorio; estado → cancelada), `tareas` (insert/update de asignado → asignada; estado hecha → hecha) y `membresias` (insert → invitación), que llaman a `encolar_notificacion()`: resuelve preferencias, teléfono y suscripciones del destinatario e inserta las filas outbox en la misma transacción. Regla: nunca se notifica al autor de la acción (salvo confirmación y recordatorio de reserva propia, que son un comprobante). Motivo del cambio respecto del helper TS: transaccionalidad garantizada y reutilización directa por el bot de fase 5, que escribe por los mismos RPCs.

## 6. Despacho email + push (en la app Next / Vercel)

- Disparo: pg_cron + pg_net en Supabase cada 5 min contra `/api/notificaciones/despachar` (Bearer `CRON_SECRET` desde `config_interna`). *(Enmendado en fase 2: Vercel Cron del plan hobby solo permite frecuencia diaria.)*
- Toma `pendiente` con `programada_para` null o `<= now()`, canales `email` y `push`.
- Email: Resend, template simple de texto con link a la app. Push: `web-push` con claves VAPID; suscripción muerta (410) → borrar fila de `push_suscripciones`.
- Fallo → `intentos + 1`; tras 3 → `fallida`. Recordatorio cuyo turno ya empezó → `descartada`.
- Claim atómico con estado `enviando` + `reclamada_en` + rescate a los 10 min; re-chequeo de preferencias y vencimiento para filas programadas (§13).

## 7. UI en la app

- **Más → Perfil y avisos** (página nueva): campo teléfono, toggles WA/email/push, botón "Activar notificaciones en este dispositivo" (pide permiso de Notification API y registra la suscripción push).
- Service worker mínimo para recibir push y abrir la app al tocar.

## 8. Bot de WhatsApp (servicio aparte)

Repo/carpeta `bot/` en el mismo repo. Node + TypeScript + `@open-wa/wa-automate` + `@anthropic-ai/sdk` + `@supabase/supabase-js` (service role). Docker con volumen persistente para la sesión; QR de vinculación por logs en el primer arranque.

**Avisos salientes:** suscripción Supabase Realtime a inserts en `notificaciones` (`canal='wa'`, `estado='pendiente'`) + polling de respaldo cada 60 s (drena atrasados tras una caída). Manda, marca `enviada`.

**Conversación entrante:**
1. Número entrante → match `perfiles.telefono`. Sin match → respuesta fija: "No reconozco este número. Cargá tu teléfono en bigote → Más." y corta.
2. Miembro identificado → contexto: sus orgs, permisos y últimos mensajes (`wa_mensajes`).
3. Claude (modelo actual de la familia Claude, tool use) con herramientas:
   - `disponibilidad_salas(org, edificio?, fecha)` — lectura
   - `mis_reservas(org)` — lectura
   - `crear_reserva(org, sala, inicio, fin, para_quien?)` — escribe
   - `cancelar_reserva(reserva_id)` — escribe
4. **Permisos = los de la web, chequeados explícitamente en cada herramienta** (el bot usa service role, así que RLS no protege): miembro activo de la org reserva y cancela las propias; `espacios` cancela cualquiera. Multi-org: si pertenece a varias, Claude pregunta a cuál se refiere.
5. Toda escritura del bot pasa por la misma lógica de dominio que la web (solapamientos, movimientos de reserva, reversión al cancelar) — reutilizar las funciones existentes, no duplicarlas.

**Límites anti-abuso:** máx. 30 mensajes procesados por número por hora; mensajes de no-miembros se responden una vez y luego se ignoran 24 h.

## 9. Variables de entorno nuevas

- App: `RESEND_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`.
- Bot: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY`, ruta del volumen de sesión.

## 10. Fases

1. **Núcleo:** migración (tablas + teléfono), `notificar()` en las acciones, página de perfil y avisos, RLS + tests. ✅
2. **Email:** Resend + cron + templates. ✅
3. **Push:** service worker + suscripción + despacho.
4. **Bot WA — avisos:** servicio Docker, sesión, Realtime + polling, envío.
5. **Bot WA — conversación:** Claude + herramientas + permisos + límites.

Cada fase termina deployada y usable; el valor no depende de las fases siguientes.

## 11. Criterios de aceptación

- [ ] Reservar una sala genera confirmación por los canales activos del usuario, y el recordatorio llega 24 h antes. (email ✔ fase 2; wa/push pendientes)
- [ ] Cancelar avisa a quien reservó y a quienes administran espacios.
- [ ] Invitación llega por email; asignación de tarea avisa al asignado.
- [x] Apagar un canal en preferencias corta esos envíos.
- [ ] Caída del bot: email/push siguen; al volver, drena pendientes no vencidos y descarta vencidos.
- [ ] Bot: miembro consulta disponibilidad, reserva y cancela por chat; número desconocido recibe el mensaje fijo; nadie opera fuera de sus permisos (test explícito de cada herramienta).
- [ ] RLS de tablas nuevas testeada (nadie ve notificaciones ni preferencias ajenas).

## 12. Fuera de alcance (v3+)

- Movimientos financieros como evento.
- Preferencias por tipo de evento.
- Verificación de teléfono por código.
- Un número de WhatsApp por org / multi-sesión.
- Cobros, media u otros flujos por chat más allá de reservas de salas.

## 13. Notas para fase 2 (del review final de fase 1)

- **Re-chequeo de preferencias al despachar.** El dispatcher debe volver a
  consultar `preferencias_notificaciones` (y `perfiles.telefono` para el
  canal `wa`) inmediatamente antes de enviar cualquier fila con
  `programada_para` no nulo. Las preferencias se evalúan una sola vez al
  encolar, pero un recordatorio (p. ej. `reserva_recordatorio`) puede vivir
  semanas en la cola: si el usuario apaga el canal o borra su teléfono
  después de encolar y antes de que llegue la fecha de envío, el envío
  saldría igual salvo que el dispatcher repita el chequeo al momento de
  procesar la fila.

- **`reserva_cancelada` y ruteo por org.** El `org_id` de estas
  notificaciones es siempre el de la organización propietaria del edificio,
  pero entre los destinatarios hay personas de la organización gestora
  también. El link que arme el dispatcher de fase 2 no puede construirse
  ruteando por `org_id` a secas, porque para un destinatario de la gestora
  ese id no corresponde a su organización. El payload necesita llevar el
  edificio (o, alternativamente, la organización correcta por destinatario)
  para que el link resuelva a la ruta correcta según quién lo recibe.

- **Claim atómico obligatorio.** El paso de "tomar" filas pendientes para
  procesar debe ser un único `UPDATE notificaciones SET estado = '...'
  WHERE estado = 'pendiente' ... RETURNING *`, nunca un `SELECT` seguido de
  un `UPDATE` separado. Hoy no existe un estado intermedio tipo
  `en_proceso`: si dos crons (o dos instancias del dispatcher) se solapan
  en el tiempo, un patrón SELECT+UPDATE dejaría una ventana en la que ambos
  leen las mismas filas `pendiente` y duplican el envío. El `UPDATE ...
  RETURNING` con el filtro por estado en el `WHERE` es atómico por fila y
  evita esa duplicación sin necesidad de locks explícitos.

- **Migración 0009 (fase 2).** Conviene agrupar en una sola migración:
  - Revocar el permiso de `UPDATE`/`INSERT` directo sobre la columna
    `creada_por` de `tareas` para el rol `authenticated` (hoy queda
    editable por el cliente aunque el valor correcto lo pone el trigger).
  - Agregar la columna `reserva_id uuid` (con su índice) a `notificaciones`,
    para reemplazar el filtrado actual por `payload->>reserva_id` — hoy la
    limpieza y el matching de estas filas dependen de un descarte contra el
    payload en vez de una FK indexada.
  - Ajustar la firma de `encolar_notificacion` para que reciba un filtro de
    canal explícito, eliminando el patrón actual de "encolar y después
    descartar" que usa el email de invitación (se encola en un canal
    apagado solo para marcarlo `descartada` acto seguido).
  - Evaluar sumar una columna `ultimo_error text` (nullable), para guardar
    el motivo cuando una fila queda en estado `fallida` y así poder
    diagnosticar sin tener que reproducir el envío.
