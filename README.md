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

4. **Aplicar las migraciones** (`supabase/migrations/0001` a `0003`: esquema, RLS + helpers, función `crear_organizacion`). Dos formas, cualquiera de las dos deja el proyecto igual:

   - CLI:
     ```bash
     npx supabase link --project-ref <ref>
     npx supabase db push
     ```
   - O vía el MCP de Supabase (herramienta `apply_migration`) si estás trabajando con un agente que lo tenga configurado.

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
    tareas/ finanzas/ espacios/ mas/   módulos
    sin-acceso/          usuario sin permiso para esa org
  plataforma/            panel de super admin (crear organizaciones)
  sin-organizacion/      usuario autenticado sin ninguna membresía
componentes/shell/       BarraSuperior, SidebarEscritorio, NavInferior, SwitcherOrg
lib/
  org.ts                 obtenerContextoOrg, listarMisOrgs (permisos por rol)
  supabase/              clientes (navegador, servidor, admin) y middleware de sesión
scripts/seed.mjs         seed de demo idempotente
supabase/migrations/     0001 esquema, 0002 RLS + helpers, 0003 crear_organizacion
tests/rls/               tests de aislamiento y reglas de reserva contra Supabase real
docs/superpowers/        specs y plan de la fase 1
```

## Fases

Este repo se construye por fases documentadas en `docs/superpowers/`:

- Spec de producto y diseño: `docs/superpowers/specs/2026-07-27-gestion-v1-design.md`, `docs/superpowers/specs/2026-07-27-gestion-v1-ux-brief.md`
- Plan de la fase 1 (esquema, RLS, seeds, auth, shell, tests, plataforma, este README): `docs/superpowers/plans/2026-07-27-fase1-base.md`

La fase 1 cubre la base: esquema completo, RLS, seeds, auth, shell multi-org con navegación por permisos, tests de RLS y panel de plataforma. Queda para fases siguientes, entre otras cosas, el trigger que genera movimientos financieros a partir de reservas.
