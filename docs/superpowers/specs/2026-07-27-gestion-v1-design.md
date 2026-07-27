# Spec v2 — bigote: gestión multi-empresa con espacios físicos

App web profesional, multiusuario y persistente. Reemplaza al spec original (`SPEC-gestion-empresa.md`); incorpora las decisiones de la iteración del 27-jul-2026. La referencia de UX es el brief `2026-07-27-gestion-v1-ux-brief.md` (el prototipo `gestion-empresa.jsx` queda descartado).

---

## 1. Contexto y objetivo

Plataforma para pequeñas organizaciones argentinas (empresas, asociaciones civiles; 3–10 personas por organización) que necesitan en una sola app:

1. Gestión de proyectos y tareas, adaptada a roles internos.
2. Finanzas generales (ingresos/egresos) por organización, con ámbitos: entidad y cada espacio físico.
3. Administración de espacios físicos tipo coworking: edificios con salas por hora, planes gratuitos y pagos, con co-gestión entre una entidad propietaria y una empresa gestora.

**Objetivo v1:** app desplegable en producción, multi-organización real, login con Google/password/magic link, datos persistentes, permisos por rol con RLS y los módulos completos. Usable desde el celular (380 px).

## 2. Stack (decidido, no cambiar sin consultar)

- **Frontend:** Next.js 14+ (App Router) + TypeScript + Tailwind CSS.
- **Backend/DB/Auth/Storage:** Supabase (Postgres, Auth, Row Level Security, Storage para media).
- **Auth:** Google OAuth (Gmail o Google Workspace corporativo) + email/password + magic link. Mismo email = misma cuenta (identity linking).
- **Deploy:** Vercel.
- **Moneda:** ARS, formato `es-AR`. Fechas y horarios en `America/Argentina/Buenos_Aires`.
- **Idioma de toda la UI:** español rioplatense, tono directo ("Creá", "Tomala", "Marcá hecha").
- **Diseño:** según `PRODUCT.md`, `DESIGN.md` y el brief de UX; implementación guiada por el skill impeccable.

## 3. Modelo de datos (Postgres / Supabase)

```
perfiles (id = auth.users.id, nombre, email)               -- global, una cuenta por persona
super_admins (perfil_id)                                   -- operadores de plataforma
organizaciones (id, nombre, tipo: empresa|asociacion_civil|otro)
membresias (org_id, perfil_id, rol_id, activo)             -- PK (org_id, perfil_id); un usuario
                                                           -- en varias orgs con rol distinto
roles (id, org_id, nombre, permisos jsonb)                 -- { proyectos, equipo, finanzas,
                                                           --   espacios, admin } bool

proyectos (id, org_id, nombre, estado, creado_por, created_at)
proyecto_miembros (proyecto_id, perfil_id)
tareas (id, proyecto_id, titulo, descripcion, dificultad int 1-5,
        asignado_a nullable,                               -- NULL = pool del proyecto
        estado: pendiente|en_curso|hecha,
        completada_por, completada_at, created_at)

clientes (id, org_id, nombre, contacto nullable, created_at)

edificios (id, org_propietaria_id, org_gestora_id nullable, nombre, direccion, descripcion,
           destino_ingresos: propietaria|gestora|reparto,
           porcentaje_propietaria numeric nullable)        -- requerido si reparto; 0-100
salas (id, edificio_id, nombre, tipo: publica|privada, descripcion, activa)
espacio_media (id, edificio_id nullable, sala_id nullable, -- exactamente uno
               tipo: foto|video, storage_path, orden)
planes_reserva (id, org_id, nombre, gratuito bool, precio_hora numeric,
                horas_gratis_mes int nullable,             -- columna presente, SIN enforcement v1
                solo_salas_publicas bool)
reservas (id, sala_id, plan_id,
          cliente_id nullable, para_perfil_id nullable,    -- exactamente uno: tercero o miembro
          fecha date, hora_inicio int, horas int, costo numeric,
          estado: confirmada|cancelada, motivo_cancelacion nullable,
          creada_por, created_at)

movimientos (id, org_id,                                   -- libro de qué organización
             edificio_id nullable,                         -- ámbito; NULL = entidad general
             tipo: ingreso|egreso, categoria, monto numeric, detalle, fecha date,
             origen: manual|reserva, reserva_id nullable, creado_por)
```

Reglas de integridad (en DB, no solo en UI):

- Constraint/trigger anti-solapamiento: imposible dos reservas `confirmada` de la misma sala con franjas que se pisan (misma fecha).
- `tareas.dificultad` check 1–5.
- `reservas`: check `(cliente_id IS NULL) <> (para_perfil_id IS NULL)`.
- `espacio_media`: check `(edificio_id IS NULL) <> (sala_id IS NULL)`.
- `edificios`: check `destino_ingresos <> 'reparto' OR porcentaje_propietaria BETWEEN 0 AND 100`.
- Reserva paga confirmada genera automáticamente sus movimientos según `destino_ingresos` del edificio:
  - `propietaria` → 1 ingreso en el libro de la org propietaria.
  - `gestora` → 1 ingreso en el libro de la org gestora.
  - `reparto` → 2 ingresos (propietaria y gestora) según `porcentaje_propietaria`; los montos suman el costo exacto (redondeo a favor de la propietaria).
  - Todos con `origen='reserva'`, `edificio_id` del edificio de la sala, detalle "Sala · nombre · N h" (+ "· X%" si reparto).
- Cancelar la reserva revierte/anula todos sus movimientos, trazado con `motivo_cancelacion`.
- Movimientos `origen='reserva'` no se editan a mano: se ajustan cancelando la reserva.

## 4. Roles, permisos y RLS (obligatoria)

- Permisos en `roles.permisos`, aplicados **en la base con RLS** vía membresía activa, no solo en la UI.
- Aislamiento por organización: ningún dato de una org es visible para quien no tiene membresía activa en ella, con una excepción definida: espacios co-gestionados.
- Semilla de roles por org: Administración (todo), Coordinación (proyectos + equipo), Operaciones (proyectos + espacios). Editables por quien tenga `admin`.
- Reglas:
  - Solo miembros de un proyecto ven sus tareas. Tomar del pool: cualquier miembro del proyecto (pasa a `en_curso` asignada). Completar: la persona asignada o `admin`.
  - Track record visible con permiso `equipo` (el propio, siempre).
  - Finanzas: permiso `finanzas` único por org; ve y escribe el libro de su org en todos los ámbitos. Nunca ve el libro de otra org, aunque compartan edificio.
  - Espacios: la vista de disponibilidad es visible para todo miembro. **Cualquier miembro activo** crea reservas (para sí o para terceros) y cancela las propias. Permiso `espacios`: administrar salas, planes, media, configuración del edificio y cancelar cualquier reserva.
  - Co-gestión: miembros de la org gestora operan los edificios donde su org es `org_gestora_id` con los mismos derechos que en los propios (según sus permisos). Los planes aplicables a una reserva son los de la **org propietaria** del edificio.
  - Super-admin: única vía de alta de organizaciones (panel `/plataforma`): crea org + asigna primer admin por email.

## 5. Requisitos por módulo

### 5.1 Autenticación y shell multi-org (P0)

- Login: "Continuá con Google" + email con password o magic link.
- Post-login: una org → entra directo; varias → última usada + switcher (nombre de la org actual, tap → lista); ninguna → pantalla "Todavía no te invitaron".
- Navegación por permisos: mobile barra inferior (Hoy · Tareas · Espacios · Finanzas · Más), desktop sidebar. Ítems sin permiso no se renderizan.
- Invitación por email a una org con rol; al aceptar, el usuario elige método de ingreso.

Criterios de aceptación:
- [ ] Un usuario con dos orgs cambia con el switcher y todo el contexto (datos, permisos, navegación) cambia con él.
- [ ] Login con Google y con magic link sobre el mismo email llegan a la misma cuenta.
- [ ] Un usuario sin membresía activa en la org X no puede leer ningún dato de X por API directa (test RLS).

### 5.2 Proyectos y tareas (P0)

- CRUD de proyectos con equipo asignado, por org.
- Tareas con dificultad 1–5, asignadas o en pool; tomar del pool; marcar hecha.
- "Mis tareas" transversal (asignadas a mí + pools de mis proyectos) de la org activa.
- Track record por persona: completadas, dificultad acumulada y promedio; filtros por proyecto y período (mes/trimestre/histórico).

Criterios de aceptación:
- [ ] Tarea del pool tomada deja de estar disponible para el resto (tiempo real o refresh).
- [ ] Track record se calcula sobre `completada_por`, no `asignado_a`.
- [ ] Sin permiso `equipo` no se ve el track record ajeno.

### 5.3 Espacios (P0)

- Edificios con dirección, descripción, media y configuración de co-gestión + destino de ingresos.
- Salas públicas/privadas por edificio, activables, con descripción y galería (fotos hasta 10 MB, video hasta 200 MB, Supabase Storage; subida solo con permiso `espacios`).
- Planes configurables por org: al menos "Gratuito" y "Pago por hora" (precio **por plan**, aplica a cualquier sala de los edificios de la org).
- Reserva: fecha + hora inicio + duración, "Para mí" (miembro) o "Para otra persona" (autocompletado de `clientes`, alta al vuelo). Costo calculado visible antes de confirmar.
- Disponibilidad por día: mobile = chips de edificio → chips de sala → columna vertical de franjas 8–22; desktop = grilla salas × horas del edificio elegido.
- "Tus reservas": próximas reservas propias, con cancelación.
- Cancelación con motivo.

Criterios de aceptación:
- [ ] Imposible crear dos reservas confirmadas solapadas en la misma sala (validado en DB).
- [ ] Plan con `solo_salas_publicas` no aplica a sala privada.
- [ ] Miembro de la org gestora opera salas y reservas del edificio co-gestionado; miembro de una tercera org, no (test RLS).
- [ ] El costo mostrado antes de confirmar coincide con la suma de movimientos generados.
- [ ] Miembro sin permiso `espacios` puede reservar para sí y cancelar la propia, pero no cancelar ajenas ni editar salas.

### 5.4 Finanzas (P0)

- Alta de ingresos/egresos con ámbito (Entidad o edificio), categoría, detalle y fecha, en el libro de la org activa.
- Resumen del mes seleccionado + acumulado, con chips de ámbito: Todo (consolidado) · Entidad · [cada edificio].
- En edificios co-gestionados, cada org carga sus propios egresos en su libro con ámbito edificio; nadie ve el libro ajeno.
- Movimientos `origen='reserva'` no editables; link a la reserva.
- Exportación CSV del período (P1).

Criterios de aceptación:
- [ ] Reserva paga confirmada crea el/los ingresos según `destino_ingresos` (test de los tres modos; en reparto los montos suman el costo).
- [ ] Cancelar la reserva revierte todos los ingresos, trazado.
- [ ] Sin permiso `finanzas` no se leen `movimientos` ni por API directa (test RLS).
- [ ] El libro de la org A nunca es visible para la org B, aunque co-gestionen un edificio (test RLS).

### 5.5 Equipo y administración (P0)

- Invitar miembros por email, asignar rol, desactivar sin borrar historial.
- Editor de roles y permisos (solo `admin`).
- Panel `/plataforma` (solo super-admin): crear organización + primer admin. Mínimo, sin diseño especial.

## 6. No-objetivos de v1

- Cobros online (Mercado Pago) — v2; `reservas.costo` y `movimientos` quedan listos para conciliar.
- Notificaciones email/push — v2.
- Enforcement del tope `horas_gratis_mes` — v2 (columna ya presente).
- Liquidaciones automáticas dueño↔gestora más allá del reparto de ingresos de reservas — v2.
- Reportes avanzados / gráficos — v2.
- App móvil nativa — la web responsive alcanza.

## 7. Fases de trabajo

1. **Base:** Next.js + Supabase, esquema SQL completo con RLS y seeds, auth (Google/password/magic link), shell multi-org con switcher y navegación por permisos, panel plataforma mínimo.
2. **Proyectos/tareas** completo + track record.
3. **Espacios:** edificios, salas, media, planes, grilla, anti-solapamiento, reservas para mí/terceros, co-gestión.
4. **Finanzas:** ámbitos, integración con reservas (destino/reparto), resumen mensual, alta manual.
5. **Equipo/roles**, pulido responsive, estados vacíos/carga/error, deploy a Vercel.

Al final de cada fase: build + tests verdes y sistema desplegable.

## 8. Definition of done

- [ ] TypeScript estricto, sin `any` injustificados; ESLint sin errores.
- [ ] RLS probada con tests: cada rol intenta leer/escribir lo que no debe, incluye aislamiento entre orgs y el caso co-gestión (gestora sí, tercera org no).
- [ ] Test del constraint de solapamiento y del reparto de ingresos (tres modos de `destino_ingresos`).
- [ ] Responsive: usable en 380 px.
- [ ] Estados vacíos, de carga y de error en cada módulo, en español directo que diga qué hacer.
- [ ] README con setup local, variables de entorno y deploy.
- [ ] Seed de demo en un comando: 2 orgs (una propietaria, una gestora), edificio co-gestionado con reparto, salas, planes, 3 usuarios con roles distintos, 2 proyectos, clientes.

## 9. Decisiones tomadas (histórico de la iteración)

- Precio **por plan** (no por sala ni mixto).
- Plan gratuito **sin tope** de horas en v1.
- **Entidad `clientes`** desde v1, con autocompletado.
- Prototipo jsx descartado; UX guiada por impeccable (PRODUCT.md + DESIGN.md + brief).
- Multi-org real con **switcher**; alta de orgs **solo super-admin**.
- Planes **por organización** (aplican los de la propietaria del edificio).
- Auth: **Google + password + magic link**.
- Finanzas por **ámbitos** (entidad / edificio) con consolidado; permiso `finanzas` único.
- Co-gestión: gestora con **gestión completa** del espacio; **egresos cada una en su libro**; ingresos de reservas **configurables por edificio** (propietaria/gestora/reparto %).
- Espacios con **descripción, fotos y video**; reservas **para mí o para terceros** por cualquier miembro.
