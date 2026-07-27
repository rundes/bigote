# bigote

Gestión de proyectos, finanzas y espacios para una pequeña organización. App web (Next.js) que reemplaza planillas y cuadernos: tareas con track record por persona, ingresos/egresos con resumen mensual, y reservas de salas.

## Setup local

```bash
npm install
```

Crear `.env.local` en la raíz con las variables de Supabase (ver `.env.local` existente o pedirlas al equipo):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

Levantar Supabase local:

```bash
supabase start
```

## Comandos

```bash
npm run dev     # servidor de desarrollo
npm run build   # build de producción
npm run start   # servir el build de producción
npm run lint    # lint
```

## Autenticación

Login en `/ingresar` con Google OAuth, email+contraseña o enlace mágico. El middleware (`middleware.ts` + `lib/supabase/middleware.ts`) refresca la sesión en cada request y redirige a `/ingresar` a quien no esté autenticado (rutas públicas: `/ingresar` y `/auth/*`).

Configuración pendiente en el Dashboard del proyecto hosted de Supabase (no se hace por código):

- **Auth → Providers → Google**: habilitar el provider con un OAuth client de Google Cloud Console. Redirect URI a registrar en Google Cloud Console: `https://olmjkuapainklekdzntk.supabase.co/auth/v1/callback`.
- **Auth → URL Configuration → Redirect URLs**: agregar `http://localhost:3000/auth/callback` (y el equivalente de producción cuando exista) a la lista de URLs permitidas.

Si el provider de Google todavía no está configurado, el botón "Continuá con Google" muestra el error correspondiente sin romper el resto del formulario (email/contraseña y enlace mágico funcionan igual).

> Nota: este README se completa en tareas siguientes (Supabase, shell de la app).
