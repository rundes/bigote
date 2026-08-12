# Inventario y etiquetas QR — diseño

Fecha: 2026-08-11
Estado: aprobado, pendiente de plan de implementación

## 1. Problema

Centro Nueva Tierra guarda y distribuye cosas de naturaleza distinta: libros y
materiales gráficos que se despachan a grupos de todo el país, y equipamiento y
mobiliario que se usa en la sede y a veces se presta. Hoy no hay registro: no se
sabe cuántos ejemplares quedan de un título, quién se llevó una cámara, ni a qué
grupo se le mandó qué.

Objetivo: registrar el inventario, etiquetar cada cosa con un QR imprimible en
hoja A4 común, y que escanear ese QR con la cámara del teléfono abra la ficha
con las acciones de préstamo, devolución y despacho.

## 2. Decisiones tomadas

| Decisión | Elección | Por qué |
|---|---|---|
| Naturaleza | Dos: existencias por cantidad, activos únicos | Un libro con 200 ejemplares y una cámara no se modelan igual |
| Destinatarios | Registro propio, con vínculo opcional a `clientes` | Un grupo que recibe material no es lo mismo que quien alquila un salón |
| Ubicaciones | Lista simple, no jerarquía | Alcanza para filtrar; una jerarquía que nadie mantiene queda peor |
| Escaneo | Cámara nativa del teléfono | Cero dependencias; armar un paquete carga cantidad, no escanea N veces |
| Impresión | CSS `@page` + `window.print()` | El navegador ya pagina A4 y da vista previa y "Guardar como PDF" |
| Stock | Libro de movimientos | Un contador mutable no dice a dónde fueron los ejemplares que faltan |

## 3. Modelo de datos

Seis tablas, todas con `org_id` y RLS siguiendo el patrón de `0002_rls.sql`.

```sql
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
    ('libro','grafico','equipamiento','mobiliario','cable','otro')),
  naturaleza text not null check (naturaleza in ('existencia','activo')),
  ubicacion_id uuid references inventario_ubicaciones (id) on delete set null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table inventario_paquetes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizaciones (id) on delete cascade,
  codigo text not null unique,
  destinatario_id uuid not null references inventario_destinatarios (id),
  estado text not null default 'abierto' check (estado in ('abierto','despachado')),
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

create table inventario_movimientos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizaciones (id) on delete cascade,
  articulo_id uuid not null references inventario_articulos (id),
  paquete_id uuid references inventario_paquetes (id),
  tipo text not null check (tipo in
    ('alta','prestamo','devolucion','despacho','ajuste','baja')),
  cantidad int not null check (cantidad <> 0),
  destinatario_id uuid references inventario_destinatarios (id),
  perfil_id uuid references perfiles (id),
  devolucion_esperada date,
  nota text not null default '',
  creado_por uuid not null references perfiles (id),
  created_at timestamptz not null default now()
);
```

### Discriminador `naturaleza`

- `existencia` — la fila es el título o SKU. El stock se deriva sumando movimientos.
- `activo` — la fila **es** la cosa física. El estado se deriva del último movimiento.

Una sola tabla y no dos: ficha, QR y etiqueta funcionan igual para ambos, y
separarlas duplicaría esas tres cosas para ganar poco.

### Convención de signos

`cantidad` es positiva en `alta` y `devolucion`, negativa en `prestamo`,
`despacho` y `baja`. `ajuste` admite ambos signos. El stock es `sum(cantidad)`.

Para artículos con `naturaleza = 'activo'`, `abs(cantidad)` es siempre 1. No se
puede expresar como check porque cruza tablas: se valida en las RPC.

### Vista derivada

```sql
create view inventario_stock as
  select articulo_id, sum(cantidad)::int as stock
  from inventario_movimientos group by articulo_id;
```

Estado de un activo: tipo del movimiento más reciente. `alta` o `devolucion` →
disponible, `prestamo` → prestado, `despacho` o `baja` → salido. `ajuste` no
aplica a activos: corrige cantidades y una cantidad de 1 no se corrige, se da de
baja. Las RPC lo rechazan.

## 4. Códigos y QR

Formato `XX-NNNNNN`: prefijo de dos letras según categoría (`LB` libro, `GR`
gráfico, `EQ` equipamiento, `MB` mobiliario, `CB` cable, `OT` otro, `PK`
paquete) más seis caracteres al azar de Crockford base32 (sin I, L, O, U para
que nadie confunda al tipear). Ejemplo: `CB-7K3M9Q`.

Aleatorio y no correlativo por dos razones: un correlativo por organización
colisiona entre organizaciones y rompe la resolución sin contexto de `org`, y
además publica cuántas cosas tiene la organización. Índice único más reintento
ante colisión; con 32^6 ≈ 1.07e9 combinaciones el reintento casi nunca ocurre.

El QR codifica solo `/q/CB-7K3M9Q`. Corto importa: menos datos, módulos más
grandes, y una etiqueta de 20 mm arrugada sobre un cable se sigue leyendo.

## 5. Etiquetas

Hoja A4 (210 × 297 mm) con margen de 10 mm, útil 190 × 277 mm. Papel común: se
corta e imprime, el pegamento lo pone quien etiqueta. Guías de corte punteadas.

| Formato | Grilla | Celda (mm) | QR | Uso |
|---|---|---|---|---|
| Chica | 5 × 6 = 30 | 38 × 46,2 | 25 mm | Libros, cosas chicas |
| Mediana | 4 × 4 = 16 | 47,5 × 69,3 | 35 mm | Equipamiento, mobiliario |
| Grande | 2 × 3 = 6 | 95 × 92,3 | 60 mm | Cajas y paquetes; suma destinatario y cantidad |
| Banderita | 2 × 11 = 22 | 95 × 25,2 | 20 mm | Cables y objetos que se envuelven |

Las tres primeras llevan QR arriba y nombre debajo, más el código en chico.

### Banderita

Tira de 95 × 25 mm en tres segmentos:

```
┌──────────────┬───────────────┬───────────────┐
│   ENVOLVER   │ CARA VISIBLE  │    REVERSO    │
│    30 mm     │    32,5 mm    │    32,5 mm    │
│              │ ▓▓▓▓          │               │
│  · · · · ·   │ ▓▓▓▓ HDMI 5m  │   (en blanco) │
│  pegamento   │ ▓▓▓▓ CB-7K3M9Q│               │
└──────────────┴───────────────┴───────────────┘
                ▲ doblez        ▲ doblez
```

Se envuelve el primer segmento alrededor del cable y se pegan entre sí los dos
restantes, formando una banderita que queda perpendicular al cable.

30 mm de zona de envolver cubren un cable de hasta ~9 mm de diámetro con solape
suficiente. En la cara visible el QR va a la izquierda y el nombre al costado, no
debajo: la banderita es ancha y baja.

`break-inside: avoid` en cada celda para que ninguna etiqueta quede partida entre
hojas.

## 6. Rutas

```
/o/[orgId]/inventario                  lista con filtros de categoría,
                                       ubicación, estado y búsqueda
/o/[orgId]/inventario/[id]             ficha con acciones
/o/[orgId]/inventario/paquetes         armado y despacho
/o/[orgId]/inventario/paquetes/[id]
/o/[orgId]/inventario/destinatarios
/o/[orgId]/inventario/ubicaciones
/o/[orgId]/inventario/etiquetas        selección, formato y vista de impresión
/q/[codigo]                            resuelve y redirige a la ficha
```

`/q/[codigo]` vive fuera del árbol `(app)/o/[orgId]` porque el código resuelve su
propia organización. Busca en `inventario_articulos` y `inventario_paquetes`, y
redirige según qué encontró: un artículo va a
`/o/{org}/inventario/{id}`, un paquete a `/o/{org}/inventario/paquetes/{id}`.
Código inexistente devuelve 404 con mensaje, no pantalla rota. Un código de otra
organización se comporta igual que uno inexistente: RLS no lo devuelve, y
distinguir "no existe" de "no es tuyo" filtraría información entre organizaciones.

## 7. RPC

Con `security definer`, siguiendo el patrón de `0005_reservas_rpc.sql`:

- `inv_crear_articulo(org_id, nombre, descripcion, categoria, naturaleza,
  ubicacion_id, cantidad_inicial)` — genera código y escribe el `alta` inicial
- `inv_prestar(articulo_id, perfil_id, devolucion_esperada, nota)`
- `inv_devolver(articulo_id, nota)`
- `inv_ajustar(articulo_id, cantidad, nota)` — solo existencias
- `inv_agregar_a_paquete(paquete_id, articulo_id, cantidad)`
- `inv_despachar_paquete(paquete_id)` — valida stock de todos los ítems, escribe
  un `despacho` por ítem y cierra el paquete en una sola transacción

Validaciones que viven en las RPC y no en el cliente: no despachar más de lo que
hay, no prestar un activo ya prestado, no modificar un paquete ya despachado, y
`abs(cantidad) = 1` para activos.

## 8. Permisos y navegación

Se agrega la clave `inventario` al jsonb `roles.permisos`. La migración debe:

1. Cambiar el default de la columna.
2. Rellenar filas existentes: `permisos || '{"inventario":false}'` donde falte.
3. Poner `inventario: true` donde `permisos->>'admin' = 'true'`, para que quien
   ya administra no quede afuera de una sección nueva.

`Permisos` en `lib/org.ts` suma `inventario: boolean`.

**Navegación en mobile.** `ITEMS_NAV` ya tiene cinco entradas y `NavInferior` las
muestra todas en una barra inferior. Una sexta deja cada ítem en ~63 px de ancho
en una pantalla de 380 px, por debajo del mínimo táctil de 44 px que exige
PRODUCT.md una vez descontado el padding. Inventario entra como ítem propio en el
sidebar de escritorio y se alcanza desde "Más" en mobile. La barra inferior no
cambia.

## 9. Arreglo en código existente

`lib/supabase/middleware.ts` redirige a `/ingresar` sin conservar el destino:

```ts
const url = request.nextUrl.clone();
url.pathname = "/ingresar";
return NextResponse.redirect(url);
```

Hoy no molesta porque se entra por la home. Con QR sí: escanear sin sesión
deposita en el login y pierde el ítem, obligando a buscarlo a mano. Hay que
agregar `?next=<pathname>` y que el flujo de ingreso lo respete después de
autenticar. Validar que `next` sea una ruta relativa de esta app antes de
redirigir, para no habilitar un open redirect.

## 10. Dependencia nueva

`qrcode` (npm), del lado del servidor, emitiendo SVG inline. Escanear no cuesta
dependencias; generar sí.

## 11. Tests

Siguiendo `tests/rls/`, contra el proyecto Supabase real:

- Aislamiento entre organizaciones en las seis tablas
- Derivación de stock: alta, préstamo, devolución y despacho dan el saldo correcto
- Despachar más de lo disponible falla
- Prestar un activo ya prestado falla
- Modificar un paquete despachado falla
- Unicidad de códigos bajo inserción concurrente

## 12. Fuera de alcance en v1

Auditoría por escaneo masivo, escáner en lote dentro de la app, notificaciones
de despacho y valorización contable. Ninguna fue pedida; se listan para que la
exclusión sea explícita y no un olvido.
