# bigote

App web (Next.js) para que una organización chica reemplace planillas y cuadernos: gestión de proyectos y tareas con track record por persona, ingresos/egresos con resumen mensual, y reservas de salas de un espacio físico tipo coworking. Tres módulos: **proyectos** (tareas asignadas o en pool, con dificultad), **finanzas** (movimientos de ingreso/egreso y balance del mes) y **espacios** (edificios, salas y reservas por hora, con planes gratuitos y pagos). Multi-organización: una misma cuenta puede pertenecer a más de una org (por ejemplo una organización gestora que administra un edificio de otra), con switcher y navegación según permisos de rol.

## Stack

- [Next.js 16](https://nextjs.org/) (App Router) + React 19 + TypeScript
- Tailwind CSS v4, tokens de diseño propios (ver `DESIGN.md`)
- [Supabase](https://supabase.com/) hosted: Postgres + Auth (Google OAuth, email/contraseña, magic link) + RLS
- Vitest para tests de RLS (contra el proyecto Supabase real)

## Requisitos

- Node 20 o superior
- Una cuenta de Supabase (el proyecto se crea en el plan gratuito)

## Setup local

1. **Crear un proyecto en Supabase** (hosted, no local): [supabase.com/dashboard](https://supabase.com/dashboard) → New project. Anotá el **project ref** (el subdominio de la URL del proyecto, algo como `abcdefghijklmnop`).

2. **Obtener las API keys**: en el Dashboard del proyecto → *Settings → API Keys* → copiá la **publishable key** (`sb_publishable_...`) y la **secret key** (`sb_secret_...`, nunca se expone al cliente).

3. **Configurar `.env.local`**: copiá `.env.example` a `.env.local` y completá con los valores del proyecto:

   ```bash
   cp .env.example .env.local
   ```

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   SUPABASE_SECRET_KEY=sb_secret_...
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```

4. **Aplicar las migraciones** (`supabase/migrations/0001` a `0011`, ver detalle y advertencias en la sección [Migraciones](#migraciones) más abajo — `npx supabase db push` **no funciona** en este repo).

5. **Instalar dependencias**:

   ```bash
   npm install
   ```

6. **Correr el seed de datos demo** (idempotente, se puede correr varias veces sin duplicar nada):

   ```bash
   npm run seed
   ```

7. **Levantar el servidor de desarrollo**:

   ```bash
   npm run dev
   ```

   La app queda en `http://localhost:3000`.

## Usuarios demo

El seed crea estos usuarios (password para todos: `demo1234`):

| Email | Rol | Organización(es) |
|---|---|---|
| `admin@demo.test` | Administración (+ super admin de plataforma) | Fundación Delta y Gestora Sur |
| `coordi@demo.test` | Coordinación | Fundación Delta |
| `ope@demo.test` | Operaciones | Fundación Delta |
| `gestora@demo.test` | Operaciones | Gestora Sur (solamente) |

Además el seed crea un edificio co-gestionado ("Casa Delta", Fundación Delta como propietaria y Gestora Sur como gestora, reparto de ingresos 60/40), salas, planes de reserva, dos proyectos con tareas y clientes.

## Tests

```bash
npm test
```

Son tests de RLS (aislamiento entre organizaciones, reglas de reservas) que corren contra el proyecto Supabase real usando las credenciales de `.env.local`. **Requieren que el seed ya esté aplicado** (`npm run seed`) antes de correrlos.

## Migraciones

**`npx supabase db push` no funciona en este repo.** El historial remoto de `supabase_migrations.schema_migrations` tiene versiones con timestamp (`YYYYMMDDHHMMSS`) que quedaron así por haberse aplicado vía MCP/Management API, no por el flujo normal del CLI — el CLI no reconoce ese historial y falla al intentar sincronizar. Las migraciones (`supabase/migrations/0001...sql` en adelante) se aplican manualmente vía la Management API de Supabase:

```
POST https://api.supabase.com/v1/projects/<project-ref>/database/query
```

con el SQL de la migración en el body, seguido de un insert en `supabase_migrations.schema_migrations (version, name, statements)` para dejar registro (version = timestamp `YYYYMMDDHHMMSS`, name = el nombre del archivo sin extensión, statements = el SQL). Requiere un token de acceso de Supabase (Management API), no las keys del proyecto.

**Paso manual imprescindible después de aplicar la 0011** (`0011_cron_despacho.sql`): la migración crea la tabla `config_interna` pero **no** carga el secret del cron — nunca se commitea un secreto en una migración. Hay que insertarlo a mano, también vía Management API:

```sql
insert into config_interna (clave, valor)
values ('cron_secret', '<el mismo valor de CRON_SECRET en Vercel>')
on conflict (clave) do update set valor = excluded.valor;
```

Sin esa fila, el job de `pg_cron` manda `Authorization: Bearer null` al endpoint y el despacho falla en silencio (401), sin ningún error visible salvo revisando `cron.job_run_details`.

**URL del cron:** la 0011 tenía la URL de producción hardcodeada en el `net.http_post` del job `despachar-notificaciones`. Al cambiar el dominio de Vercel el cron quedó posteando contra un 404 y las notificaciones dejaron de salir en silencio (pg_cron no avisa; el rastro queda en `cron.job_run_details`). La 0017 la movió a `config_interna`, junto al secret:

```sql
insert into config_interna (clave, valor) values ('app_url', 'https://<dominio>')
on conflict (clave) do update set valor = excluded.valor;
```

Cambiar de dominio ahora es un update de esa fila. Al aplicar las migraciones a otro entorno, cargar ahí su propia `app_url`.

## Deploy en Vercel

Importar el repo en Vercel y configurar estas variables de entorno (mismas que en `.env.local`, apuntando al proyecto Supabase hosted):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `NEXT_PUBLIC_SITE_URL` (URL pública de la app; en Vercel, `https://<tu-dominio>`)

Después de desplegar, agregá la URL de producción en *Auth → URL Configuration → Redirect URLs* del proyecto Supabase (ver sección siguiente).

## Configuración de Google OAuth

El login admite Google, pero requiere configuración manual (no se hace por código ni por migración):

1. **Google Cloud Console**: crear un OAuth client (tipo *Web application*). Como *Authorized redirect URI* agregar:

   ```
   https://<ref>.supabase.co/auth/v1/callback
   ```

2. **Supabase Dashboard → Auth → Providers → Google**: habilitar el provider y cargar el *Client ID* y *Client Secret* del OAuth client creado en el paso anterior.

3. **Supabase Dashboard → Auth → URL Configuration → Site URL**: configurar la URL desplegada de la app (por ejemplo `https://<tu-dominio-de-vercel>`). Supabase usa este valor para armar los enlaces de los emails (invitación, magic link, recuperación).

4. **Supabase Dashboard → Auth → URL Configuration → Redirect URLs**: agregar las URLs de callback de la app:

   - `http://localhost:3000/auth/callback` (desarrollo)
   - `http://localhost:3000/auth/confirm` (desarrollo)
   - `https://<tu-dominio-de-vercel>/auth/callback` (producción, una vez desplegada)
   - `https://<tu-dominio-de-vercel>/auth/confirm` (producción, una vez desplegada)

Si el provider de Google no está configurado, el botón "Continuá con Google" en `/ingresar` muestra el error correspondiente sin romper el resto del formulario (email/contraseña y enlace mágico funcionan igual).

Si el enlace de una invitación venció o ya se usó, la persona invitada puede pedir uno nuevo con "Mandame un enlace mágico" en `/ingresar`, usando el mismo email (fallback, no requiere que un admin la vuelva a invitar).

## Estructura de carpetas

```
app/
  (auth)/ingresar/       login (Google, email+contraseña, magic link)
  auth/callback/         callback de OAuth / magic link
  auth/salir/            logout
  (app)/o/[orgId]/       shell autenticado por organización
    tareas/ finanzas/ espacios/ equipo/ roles/ mas/   módulos
    sin-acceso/          usuario sin permiso para esa org
  plataforma/            panel de super admin (crear organizaciones)
  sin-organizacion/      usuario autenticado sin ninguna membresía
componentes/shell/       BarraSuperior, SidebarEscritorio, NavInferior, SwitcherOrg
lib/
  org.ts                 obtenerContextoOrg, listarMisOrgs (permisos por rol)
  supabase/              clientes (navegador, servidor, admin) y middleware de sesión
scripts/seed.mjs         seed de demo idempotente
supabase/migrations/     0001 esquema, 0002 RLS + helpers, 0003 crear_organizacion,
                         0004 RPCs de tareas, 0005 RPCs de reservas + bucket media,
                         0006 clientes en co-gestión, 0007 movimientos por reserva,
                         0008 notificaciones (outbox), 0009 despacho (claim atómico,
                         reintentos), 0010 ajustes de despacho, 0011 cron de despacho
                         (pg_cron + pg_net + config_interna)
tests/rls/               tests de aislamiento y reglas de reserva contra Supabase real
docs/superpowers/        specs y planes por fase
```

## Fases

Este repo se construye por fases documentadas en `docs/superpowers/`:

- Spec de producto y diseño: `docs/superpowers/specs/2026-07-27-gestion-v1-design.md`, `docs/superpowers/specs/2026-07-27-gestion-v1-ux-brief.md`
- **Fase 1 — Base** (completa): esquema, RLS, seeds, auth, shell, tests, plataforma. Plan: `docs/superpowers/plans/2026-07-27-fase1-base.md`
- **Fase 2 — Proyectos y tareas** (completa): CRUD de proyectos y tareas, pool + asignadas, track record por persona con filtros y privacidad. Criterios §5.2 verificados: pool atómico, track record sobre `completada_por`, privacidad de `equipo` en RLS.
- **Fase 3 — Espacios** (completa): disponibilidad por día (grilla desktop, chips + columna mobile), reservas para mí o para terceros vía RPC `crear_reserva` (costo calculado en el servidor, plan y cliente validados contra la org propietaria), cancelación con motivo, administración de edificios/salas/planes y galería de fotos/videos en Supabase Storage, todo operable por la org gestora en edificios co-gestionados. Plan: `docs/superpowers/plans/2026-08-02-fase3-espacios.md`
- **Fase 4 — Finanzas** (completa): alta manual de ingresos/egresos con ámbito (Entidad o edificio), resumen del mes + acumulado con chips de ámbito, movimientos automáticos por reserva paga vía triggers en la base según `destino_ingresos` (propietaria/gestora/reparto con redondeo a favor de la propietaria), reversión al cancelar, export CSV. Criterios §5.4 y el pendiente de §5.3 (costo = suma de movimientos) verificados con tests. Plan: `docs/superpowers/plans/2026-08-02-fase4-finanzas.md`
- **Fase 5 — Equipo y cierre de v1** (completa): invitar miembros por email con rol (reusa el flujo de invitación de Supabase; si el email ya tiene cuenta se suma directo), cambiar rol y desactivar/reactivar sin borrar historial (con guard anti-lockout: la org nunca queda sin administración), editor de roles y permisos (solo `admin`, en Más → Roles y permisos), estados de carga y error del shell. Plan: `docs/superpowers/plans/2026-08-02-fase5-equipo.md`

**v1 completa.** Pendiente de verificación manual (requiere Google OAuth configurado en el Dashboard): switcher multi-org con `admin@demo.test` e identity linking Google + magic link. Ideas para v2 en el spec §6 (cobros online, notificaciones, tope de horas gratis, reportes).

v2 en curso — fase 1 (núcleo) y **fase 2 (email) completas**: outbox + triggers + perfil y avisos (fase 1), dispatcher Resend con claim atómico y reintentos + pg_cron cada 5 min (fase 2). Falta verificar el dominio `tronador.net.ar` en Resend para pasar `EMAIL_FROM` de `onboarding@resend.dev` (hoy solo llega al dueño de la cuenta Resend) a `bigote <avisos@tronador.net.ar>` — al verificar: cambiar la env en Vercel y redeploy. Spec: `docs/superpowers/specs/2026-08-05-notificaciones-v2-design.md`.
