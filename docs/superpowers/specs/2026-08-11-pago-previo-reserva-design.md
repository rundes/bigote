# Pago previo a la reserva — diseño

Fecha: 2026-08-11
Estado: aprobado, sin implementar. Va después del módulo de inventario.

## 1. Problema

Hoy una reserva nace `confirmada` y bloquea el horario en el mismo instante, sin
que medie pago. Centro Nueva Tierra quiere cobrar antes de confirmar el uso de
una sala, mandándole a quien reserva un mail con los datos de la cuenta.

## 2. Decisiones tomadas

| Decisión | Elección | Por qué |
|---|---|---|
| Horario mientras se espera | Se retiene, con vencimiento (48 h por defecto) | Sin retención, dos personas pagan el mismo turno y hay que devolver plata |
| Confirmación del pago | Admin registra el pago, comprobante opcional | Una transferencia no le avisa a la app; alguien tiene que mirar el banco |
| Medio de cobro | Transferencia a alias/CBU | Cero comisión y la cuenta ya existe |
| Pasarela | No ahora, pero el modelo queda listo | ~5% por reserva y alta como persona jurídica no se justifican al volumen actual |

### Por qué no una pasarela todavía

Se evaluaron MODO, Ualá Bis, Mercado Pago y PagoTIC. Dos conclusiones:

- **MODO no es un procesador**: exige estar dado de alta previamente en un
  gateway (Decidir/Payway, IPG, Getnet o Line) y entregarle esas credenciales.
  Es más pesado que Mercado Pago, no más liviano.
- **El alta liviana no aplica a una asociación civil.** Ualá Bis pide DNI a
  personas físicas, pero a personas jurídicas les exige inscripción en el
  registro público de comercio, inscripciones impositivas, socios, apoderados y
  estatuto. Ninguna pasarela argentina puede dar alta liviana a una entidad
  jurídica: la normativa de prevención de lavado no lo permite.

Una pasarela cobra ~5% de cada reserva y compra, a cambio, que un admin no tenga
que tocar un botón. Al volumen de una asociación que alquila salones
ocasionalmente, esa cuenta no cierra.

Lo que sí se hace ahora, y no cuesta nada: `pagos_reserva` lleva `metodo` y
`proveedor` desde el día uno, y la máquina de estados es idéntica para
transferencia y pasarela. El día que el volumen la justifique, se enchufa el
webhook en un estado que ya existe, sin rehacer reservas ni finanzas.

## 3. Máquina de estados

```
crear reserva
     │
     ├─ plan sin pago previo, o costo = 0 ──────────► confirmada
     │
     └─ plan con pago previo y costo > 0 ──► esperando_pago
                                                 │  horario RETENIDO
                                                 │  vence_at = now() + plazo
                                                 │
                        ┌────────────────────────┼────────────────────┐
                        ▼                        ▼                    ▼
                   confirmada                vencida             cancelada
              (admin registra pago)      (cron, venció)      (manual, cualquier
               nace el ingreso            libera horario       momento)
```

`confirmada → cancelada` sigue funcionando como hoy.

## 4. El cambio crítico: la constraint de exclusión

El solapamiento no se chequea en la RPC: lo impide una constraint GiST en
`0001_esquema.sql`, **filtrada por estado**:

```sql
constraint reservas_sin_solape exclude using gist (
  sala_id with =, fecha with =,
  int4range(hora_inicio, hora_inicio + horas) with &&
) where (estado = 'confirmada')
```

Una reserva en `esperando_pago` queda fuera de ese predicado y **no bloquearía el
horario**. Toda la decisión de retener el turno depende de esta línea. La
migración debe recrear la constraint:

```sql
alter table reservas drop constraint reservas_sin_solape;
alter table reservas add constraint reservas_sin_solape exclude using gist (
  sala_id with =, fecha with =,
  int4range(hora_inicio, hora_inicio + horas) with &&
) where (estado in ('confirmada', 'esperando_pago'));
```

## 5. El segundo cambio crítico: cuándo nace el ingreso

`0007_movimientos_reserva.sql` asienta el ingreso al **insertar**:

```sql
create trigger generar_movimientos_reserva_trigger
  after insert on reservas
  for each row execute function public.generar_movimientos_reserva();
```

Con pago previo, eso registraría en finanzas plata que nadie pagó. El trigger
pasa a dispararse en la transición a `confirmada`:

- `after insert` cuando la reserva nace ya `confirmada` (sin pago previo)
- `after update of estado` cuando pasa de `esperando_pago` a `confirmada`

`revertir_movimientos_reserva` hoy sólo contempla `confirmada → cancelada`. Debe
seguir borrando únicamente en ese caso: desde `esperando_pago` no hay
movimientos que revertir, y borrar de más sería silencioso.

La RPC `cancelar_reserva` rechaza todo lo que no esté `confirmada`
(`if v_reserva.estado <> 'confirmada' then raise exception`). Debe aceptar
también `esperando_pago`.

## 6. Cambios de schema

El check de `estado` se declaró inline, así que Postgres lo nombró solo.
Verificar el nombre real antes de escribir la migración
(`\d reservas`); abajo se asume el nombre por defecto.

```sql
-- reservas
alter table reservas drop constraint reservas_estado_check;
alter table reservas add check (estado in
  ('confirmada', 'cancelada', 'esperando_pago', 'vencida'));
alter table reservas add column vence_at timestamptz;
alter table reservas add check (estado <> 'esperando_pago' or vence_at is not null);

-- planes: qué plan exige cobro previo
alter table planes_reserva
  add column requiere_pago_previo boolean not null default false;

-- clientes: hoy `contacto` es texto libre y no sirve para mandar mail
alter table clientes add column email text;
```

Si una reserva necesita pago previo y el cliente no tiene `email`, la UI lo pide
antes de dejar crear la reserva. No se infiere desde `contacto`: es texto libre
y podría ser un teléfono.

### Tablas nuevas

```sql
create table cobros_config (
  org_id uuid primary key references organizaciones (id) on delete cascade,
  alias text not null default '',
  cbu text not null default '',
  titular text not null default '',
  cuit text not null default '',
  banco text not null default '',
  instrucciones text not null default '',
  plazo_horas int not null default 48 check (plazo_horas between 1 and 720),
  activo boolean not null default false
);

create table pagos_reserva (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizaciones (id) on delete cascade,
  reserva_id uuid not null references reservas (id) on delete cascade,
  metodo text not null default 'transferencia'
    check (metodo in ('transferencia', 'pasarela', 'efectivo')),
  proveedor text,
  referencia_externa text,
  monto numeric not null check (monto > 0),
  comprobante_path text,
  registrado_por uuid references perfiles (id),
  registrado_at timestamptz not null default now(),
  nota text not null default ''
);
```

`proveedor` y `referencia_externa` quedan nulos con transferencia. Son el enganche
para una pasarela futura sin migrar nada.

`monto` debe ser igual a `reservas.costo`: no hay pagos parciales ni señas en
esta versión (§12), y un pago por menos dejaría la reserva confirmada sin cobrar
del todo. La RPC lo valida y rechaza cualquier otro monto. La columna existe como
`numeric` propio, y no se deriva de `costo`, para que el día que se admitan señas
no haya que migrar el histórico.

`comprobante_path` apunta al bucket de media que ya existe desde la fase de
espacios.

## 7. Vencimiento

Lo corre el `pg_cron` que ya existe desde `0011_cron_despacho.sql`, cada 5
minutos. No hace falta infraestructura nueva:

```sql
update reservas set estado = 'vencida'
where estado = 'esperando_pago' and vence_at <= now();
```

Al pasar a `vencida` sale del predicado de la constraint y el horario se libera
solo. Conviene notificar a quien reservó.

## 8. Notificaciones

`notificaciones.evento` tiene un check cerrado que hay que ampliar:

```sql
alter table notificaciones drop constraint notificaciones_evento_check;
alter table notificaciones add check (evento in (
  'reserva_confirmada', 'reserva_recordatorio', 'reserva_cancelada',
  'invitacion', 'tarea_asignada', 'tarea_hecha',
  'reserva_esperando_pago', 'reserva_vencida', 'pago_registrado'
));
```

- `reserva_esperando_pago` — el mail con alias, CBU, titular, monto y hasta cuándo
- `reserva_vencida` — aviso de que se liberó el horario
- `pago_registrado` — confirmación de que la reserva quedó firme

El template vive junto a los de `lib/notificaciones/emails.ts`. Los datos de la
cuenta salen de `cobros_config`, no hardcodeados.

**A quién se le manda.** `reservas` apunta a un cliente externo o a un miembro,
nunca a ambos (`check ((cliente_id is null) <> (para_perfil_id is null))`). Con
`para_perfil_id` el destinatario es ese perfil y el aviso entra por el outbox de
notificaciones como cualquier otro, respetando sus preferencias de canal. Con
`cliente_id` va a `clientes.email` por mail y nada más: un cliente externo no
tiene perfil ni preferencias, así que el canal no se elige. Quien creó la reserva
recibe copia en ambos casos, porque suele ser quien persigue el cobro.

## 9. UI

**Panel de finanzas** gana una sección "Esperando pago": lista de reservas
pendientes con monto, quién reservó, cuándo vence, y las acciones "Registrar
pago" y "Adjuntar comprobante". Las que vencen dentro de las 6 h se destacan.

**Configuración de cobros** es una pantalla dentro de finanzas, con permiso
`finanzas`: alias, CBU, titular, CUIT, banco, instrucciones libres y plazo. Con
`activo = false` el sistema se comporta como hoy y ningún plan exige pago previo,
lo que permite desplegar sin activar.

**Ficha de reserva** muestra el estado de pago y, si está esperando, hasta cuándo.

## 10. Bordes y errores

- Registrar un pago dos veces sobre la misma reserva: bloqueado, la reserva ya
  no está en `esperando_pago`.
- Registrar un pago sobre una reserva vencida: la RPC lo rechaza y sugiere crear
  una nueva. Reactivar es peligroso porque el horario pudo haberse ocupado.
- Vencimiento y registro de pago simultáneos: la RPC de pago toma `for update`
  sobre la reserva y verifica el estado adentro de la transacción.
- Activar cobros sin alias ni CBU cargados: la config no deja poner `activo` sin
  al menos uno de los dos.
- Cambiar `plazo_horas` no altera reservas ya en curso: `vence_at` se fija al crear.

## 11. Tests

Siguiendo `tests/rls/`:

- Una reserva en `esperando_pago` **bloquea** el horario: crear una segunda
  superpuesta falla. Este es el test que protege la decisión del §4.
- Una reserva `vencida` **libera** el horario: la segunda entra.
- El ingreso en finanzas aparece al registrar el pago, no al crear la reserva.
- Cancelar desde `esperando_pago` no borra movimientos ni falla.
- Reparto de ingresos por `destino_ingresos` sigue dando los mismos montos que
  hoy cuando el plan no exige pago previo.
- Aislamiento entre organizaciones en `cobros_config` y `pagos_reserva`.

## 12. Fuera de alcance

Integración con pasarela, conciliación automática contra el banco, reembolsos,
pagos parciales o señas, y cobro previo para reservas de miembros con plan
gratuito. El modelo admite las dos primeras sin rediseño.
