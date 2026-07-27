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

> Nota: este README se completa en tareas siguientes (auth, Supabase, shell de la app).
