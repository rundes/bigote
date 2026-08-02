// Seed de demo idempotente para bigote.
// Uso: npm run seed  (usa node --env-file=.env.local)
//
// Crea usuarios demo, dos organizaciones (una propietaria, una gestora),
// un edificio co-gestionado con reparto 60/40, salas, planes, dos proyectos
// con tareas y clientes. Correrlo varias veces no duplica nada: los usuarios
// se buscan por email, el resto de las entidades por sus claves naturales
// (nombre + org donde aplica).

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function assertNoError(error, context) {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------------

async function findUserByEmail(email) {
  // GoTrue pagina listUsers con perPage=50 por defecto; con más de 50
  // usuarios en el proyecto, un email demo podría quedar en una página
  // siguiente y no encontrarse. Subimos perPage (alcanza para este
  // proyecto; no hace falta paginar del todo).
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  assertNoError(error, `listUsers (buscando ${email})`);
  return data.users.find((u) => u.email === email) ?? null;
}

async function upsertUser(email, nombre) {
  let user = await findUserByEmail(email);
  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: "demo1234",
      email_confirm: true,
      user_metadata: { name: nombre },
    });
    assertNoError(error, `createUser ${email}`);
    user = data.user;
  }

  // El trigger crear_perfil ya crea la fila en perfiles; nos aseguramos de
  // que el nombre quede correcto (por si el perfil ya existía de una corrida
  // previa con otros metadata, o si el trigger no llegó a setearlo).
  const { error: perfilError } = await supabase
    .from("perfiles")
    .update({ nombre })
    .eq("id", user.id);
  assertNoError(perfilError, `update perfiles ${email}`);

  return user;
}

// ---------------------------------------------------------------------------
// Helpers select-antes-de-insertar (claves naturales = nombres)
// ---------------------------------------------------------------------------

async function upsertOrganizacion(nombre, tipo) {
  const { data: existing, error: selError } = await supabase
    .from("organizaciones")
    .select("*")
    .eq("nombre", nombre)
    .maybeSingle();
  assertNoError(selError, `select organizaciones ${nombre}`);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("organizaciones")
    .insert({ nombre, tipo })
    .select("*")
    .single();
  assertNoError(error, `insert organizaciones ${nombre}`);
  return data;
}

async function upsertRol(orgId, nombre, permisos) {
  const { data: existing, error: selError } = await supabase
    .from("roles")
    .select("*")
    .eq("org_id", orgId)
    .eq("nombre", nombre)
    .maybeSingle();
  assertNoError(selError, `select roles ${nombre}`);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("roles")
    .insert({ org_id: orgId, nombre, permisos })
    .select("*")
    .single();
  assertNoError(error, `insert roles ${nombre}`);
  return data;
}

async function upsertMembresia(orgId, perfilId, rolId) {
  const { data: existing, error: selError } = await supabase
    .from("membresias")
    .select("*")
    .eq("org_id", orgId)
    .eq("perfil_id", perfilId)
    .maybeSingle();
  assertNoError(selError, `select membresias ${orgId}/${perfilId}`);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("membresias")
    .insert({ org_id: orgId, perfil_id: perfilId, rol_id: rolId })
    .select("*")
    .single();
  assertNoError(error, `insert membresias ${orgId}/${perfilId}`);
  return data;
}

async function upsertSuperAdmin(perfilId) {
  const { data: existing, error: selError } = await supabase
    .from("super_admins")
    .select("*")
    .eq("perfil_id", perfilId)
    .maybeSingle();
  assertNoError(selError, `select super_admins ${perfilId}`);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("super_admins")
    .insert({ perfil_id: perfilId })
    .select("*")
    .single();
  assertNoError(error, `insert super_admins ${perfilId}`);
  return data;
}

async function upsertEdificio(nombre, fields) {
  const { data: existing, error: selError } = await supabase
    .from("edificios")
    .select("*")
    .eq("nombre", nombre)
    .maybeSingle();
  assertNoError(selError, `select edificios ${nombre}`);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("edificios")
    .insert({ nombre, ...fields })
    .select("*")
    .single();
  assertNoError(error, `insert edificios ${nombre}`);
  return data;
}

async function upsertSala(edificioId, nombre, tipo) {
  const { data: existing, error: selError } = await supabase
    .from("salas")
    .select("*")
    .eq("edificio_id", edificioId)
    .eq("nombre", nombre)
    .maybeSingle();
  assertNoError(selError, `select salas ${nombre}`);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("salas")
    .insert({ edificio_id: edificioId, nombre, tipo })
    .select("*")
    .single();
  assertNoError(error, `insert salas ${nombre}`);
  return data;
}

async function upsertPlan(orgId, nombre, fields) {
  const { data: existing, error: selError } = await supabase
    .from("planes_reserva")
    .select("*")
    .eq("org_id", orgId)
    .eq("nombre", nombre)
    .maybeSingle();
  assertNoError(selError, `select planes_reserva ${nombre}`);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("planes_reserva")
    .insert({ org_id: orgId, nombre, ...fields })
    .select("*")
    .single();
  assertNoError(error, `insert planes_reserva ${nombre}`);
  return data;
}

async function upsertProyecto(orgId, nombre, creadoPor) {
  const { data: existing, error: selError } = await supabase
    .from("proyectos")
    .select("*")
    .eq("org_id", orgId)
    .eq("nombre", nombre)
    .maybeSingle();
  assertNoError(selError, `select proyectos ${nombre}`);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("proyectos")
    .insert({ org_id: orgId, nombre, creado_por: creadoPor })
    .select("*")
    .single();
  assertNoError(error, `insert proyectos ${nombre}`);
  return data;
}

async function upsertProyectoMiembro(proyectoId, perfilId) {
  const { data: existing, error: selError } = await supabase
    .from("proyecto_miembros")
    .select("*")
    .eq("proyecto_id", proyectoId)
    .eq("perfil_id", perfilId)
    .maybeSingle();
  assertNoError(selError, `select proyecto_miembros ${proyectoId}/${perfilId}`);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("proyecto_miembros")
    .insert({ proyecto_id: proyectoId, perfil_id: perfilId })
    .select("*")
    .single();
  assertNoError(error, `insert proyecto_miembros ${proyectoId}/${perfilId}`);
  return data;
}

async function upsertTarea(proyectoId, titulo, fields) {
  const { data: existing, error: selError } = await supabase
    .from("tareas")
    .select("*")
    .eq("proyecto_id", proyectoId)
    .eq("titulo", titulo)
    .maybeSingle();
  assertNoError(selError, `select tareas ${titulo}`);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("tareas")
    .insert({ proyecto_id: proyectoId, titulo, ...fields })
    .select("*")
    .single();
  assertNoError(error, `insert tareas ${titulo}`);
  return data;
}

// Completa dirección/descripcion de un edificio o sala solo si están vacías
// (no pisa ediciones hechas desde la app).
async function completarTextos(tabla, id, campos) {
  const { data: fila, error: selError } = await supabase
    .from(tabla)
    .select("*")
    .eq("id", id)
    .single();
  assertNoError(selError, `select ${tabla} ${id}`);

  const cambios = {};
  for (const [campo, valor] of Object.entries(campos)) {
    if (!fila[campo]) cambios[campo] = valor;
  }
  if (Object.keys(cambios).length === 0) return;

  const { error } = await supabase.from(tabla).update(cambios).eq("id", id);
  assertNoError(error, `update ${tabla} ${id}`);
}

// Clave natural: sala + fecha + hora de inicio (fechas fijas futuras para
// que el seed sea idempotente entre corridas en días distintos).
async function upsertReserva(salaId, fecha, horaInicio, fields) {
  const { data: existing, error: selError } = await supabase
    .from("reservas")
    .select("*")
    .eq("sala_id", salaId)
    .eq("fecha", fecha)
    .eq("hora_inicio", horaInicio)
    .maybeSingle();
  assertNoError(selError, `select reservas ${fecha} ${horaInicio}h`);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("reservas")
    .insert({ sala_id: salaId, fecha, hora_inicio: horaInicio, ...fields })
    .select("*")
    .single();
  assertNoError(error, `insert reservas ${fecha} ${horaInicio}h`);
  return data;
}

// Clave natural: org + detalle + fecha (fechas fijas para idempotencia).
async function upsertMovimiento(orgId, detalle, fecha, fields) {
  const { data: existing, error: selError } = await supabase
    .from("movimientos")
    .select("*")
    .eq("org_id", orgId)
    .eq("detalle", detalle)
    .eq("fecha", fecha)
    .maybeSingle();
  assertNoError(selError, `select movimientos ${detalle}`);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("movimientos")
    .insert({ org_id: orgId, detalle, fecha, ...fields })
    .select("*")
    .single();
  assertNoError(error, `insert movimientos ${detalle}`);
  return data;
}

async function upsertCliente(orgId, nombre, contacto) {
  const { data: existing, error: selError } = await supabase
    .from("clientes")
    .select("*")
    .eq("org_id", orgId)
    .eq("nombre", nombre)
    .maybeSingle();
  assertNoError(selError, `select clientes ${nombre}`);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("clientes")
    .insert({ org_id: orgId, nombre, contacto })
    .select("*")
    .single();
  assertNoError(error, `insert clientes ${nombre}`);
  return data;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // 1. Usuarios
  const admin = await upsertUser("admin@demo.test", "Ana Admin");
  const coordi = await upsertUser("coordi@demo.test", "Camila Coordinadora");
  const ope = await upsertUser("ope@demo.test", "Omar Operaciones");
  const gestora = await upsertUser("gestora@demo.test", "Gabriela Gestora");

  // 2. Orgs
  const fundacionDelta = await upsertOrganizacion("Fundación Delta", "asociacion_civil");
  const gestoraSur = await upsertOrganizacion("Gestora Sur", "empresa");

  // Roles semilla en cada org
  const permisosAdministracion = {
    proyectos: true,
    equipo: true,
    finanzas: true,
    espacios: true,
    admin: true,
  };
  const permisosCoordinacion = {
    proyectos: true,
    equipo: true,
    finanzas: false,
    espacios: false,
    admin: false,
  };
  const permisosOperaciones = {
    proyectos: true,
    equipo: false,
    finanzas: false,
    espacios: true,
    admin: false,
  };

  const rolAdminDelta = await upsertRol(fundacionDelta.id, "Administración", permisosAdministracion);
  const rolCoordiDelta = await upsertRol(fundacionDelta.id, "Coordinación", permisosCoordinacion);
  const rolOpeDelta = await upsertRol(fundacionDelta.id, "Operaciones", permisosOperaciones);

  const rolAdminSur = await upsertRol(gestoraSur.id, "Administración", permisosAdministracion);
  await upsertRol(gestoraSur.id, "Coordinación", permisosCoordinacion);
  const rolOpeSur = await upsertRol(gestoraSur.id, "Operaciones", permisosOperaciones);

  // Membresías: admin -> Administración en ambas orgs; coordi -> Coordinación
  // y ope -> Operaciones en Fundación Delta; gestora -> Operaciones, solo en
  // Gestora Sur (para probar RLS de co-gestión con un usuario que no es
  // miembro de la org propietaria).
  await upsertMembresia(fundacionDelta.id, admin.id, rolAdminDelta.id);
  await upsertMembresia(gestoraSur.id, admin.id, rolAdminSur.id);
  await upsertMembresia(fundacionDelta.id, coordi.id, rolCoordiDelta.id);
  await upsertMembresia(fundacionDelta.id, ope.id, rolOpeDelta.id);
  await upsertMembresia(gestoraSur.id, gestora.id, rolOpeSur.id);

  // super_admins: admin
  await upsertSuperAdmin(admin.id);

  // Edificio co-gestionado
  const casaDelta = await upsertEdificio("Casa Delta", {
    org_propietaria_id: fundacionDelta.id,
    org_gestora_id: gestoraSur.id,
    destino_ingresos: "reparto",
    porcentaje_propietaria: 60,
  });

  const salaNorte = await upsertSala(casaDelta.id, "Sala Norte", "publica");
  const salaSur = await upsertSala(casaDelta.id, "Sala Sur", "publica");
  const estudio = await upsertSala(casaDelta.id, "Estudio", "privada");

  // Textos de fase 3 (solo si están vacíos: no pisa ediciones de la app)
  await completarTextos("edificios", casaDelta.id, {
    direccion: "Av. Rivadavia 1234, CABA",
    descripcion:
      "Casona reciclada de dos plantas con patio, a dos cuadras del subte. Salas luminosas para reuniones, talleres y trabajo tranquilo.",
  });
  await completarTextos("salas", salaNorte.id, {
    descripcion: "Sala de reuniones para 8 personas, con proyector y pizarra.",
  });
  await completarTextos("salas", salaSur.id, {
    descripcion: "Sala amplia para talleres de hasta 20 personas, sillas apilables.",
  });
  await completarTextos("salas", estudio.id, {
    descripcion: "Estudio chico e insonorizado, ideal para grabar o para llamadas largas.",
  });

  // Planes de Fundación Delta
  const planGratuito = await upsertPlan(fundacionDelta.id, "Gratuito", {
    gratuito: true,
    precio_hora: 0,
  });
  const planPago = await upsertPlan(fundacionDelta.id, "Pago por hora", {
    gratuito: false,
    precio_hora: 8000,
  });
  await upsertPlan(fundacionDelta.id, "Comunidad", {
    gratuito: true,
    precio_hora: 0,
    solo_salas_publicas: true,
  });

  // Plan de Gestora Sur: existe solo para verificar (tests de fase 3) que un
  // plan de la org gestora NO aplica en un edificio cuya propietaria es otra.
  await upsertPlan(gestoraSur.id, "Pago Sur", {
    gratuito: false,
    precio_hora: 5000,
  });

  // Proyectos de Fundación Delta
  const proyectoSitio = await upsertProyecto(fundacionDelta.id, "Sitio nuevo", admin.id);
  const proyectoCampana = await upsertProyecto(fundacionDelta.id, "Campaña socios", admin.id);

  // Miembros: los 3 en "Sitio nuevo"; admin+coordi en "Campaña socios"
  await upsertProyectoMiembro(proyectoSitio.id, admin.id);
  await upsertProyectoMiembro(proyectoSitio.id, coordi.id);
  await upsertProyectoMiembro(proyectoSitio.id, ope.id);
  await upsertProyectoMiembro(proyectoCampana.id, admin.id);
  await upsertProyectoMiembro(proyectoCampana.id, coordi.id);

  // 5 tareas en total, dificultades 1-5 variadas, 2 en pool (asignado_a null)
  await upsertTarea(proyectoSitio.id, "Definir wireframes del home", {
    descripcion: "Bocetar la estructura de la home nueva.",
    dificultad: 2,
    asignado_a: coordi.id,
  });
  await upsertTarea(proyectoSitio.id, "Maquetar landing", {
    descripcion: "Armar el HTML/CSS de la landing a partir de los wireframes.",
    dificultad: 4,
    asignado_a: ope.id,
  });
  await upsertTarea(proyectoSitio.id, "Redactar textos institucionales", {
    descripcion: "Escribir la sección 'Quiénes somos' y misión/visión.",
    dificultad: 1,
    asignado_a: null,
  });
  await upsertTarea(proyectoCampana.id, "Armar base de socios a contactar", {
    descripcion: "Depurar el padrón de socios para la campaña.",
    dificultad: 3,
    asignado_a: admin.id,
  });
  await upsertTarea(proyectoCampana.id, "Diseñar pieza gráfica de campaña", {
    descripcion: "Arte para redes sociales de la campaña de socios.",
    dificultad: 5,
    asignado_a: null,
  });

  // Historia de tareas ya completadas, para poblar el track record: 2 por
  // coordi (dif 3 y 5) y 2 por ope (dif 2 y 4), todas en "Sitio nuevo".
  function haceDias(n) {
    return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
  }

  await upsertTarea(proyectoSitio.id, "Relevar contenido viejo", {
    descripcion: "Revisar el contenido del sitio anterior a migrar.",
    dificultad: 3,
    estado: "hecha",
    asignado_a: coordi.id,
    completada_por: coordi.id,
    completada_at: haceDias(10),
  });
  await upsertTarea(proyectoSitio.id, "Migrar DNS", {
    descripcion: "Apuntar el dominio al nuevo hosting.",
    dificultad: 5,
    estado: "hecha",
    asignado_a: coordi.id,
    completada_por: coordi.id,
    completada_at: haceDias(40),
  });
  await upsertTarea(proyectoSitio.id, "Backup del sitio anterior", {
    descripcion: "Respaldar archivos y base de datos del sitio viejo.",
    dificultad: 2,
    estado: "hecha",
    asignado_a: ope.id,
    completada_por: ope.id,
    completada_at: haceDias(5),
  });
  await upsertTarea(proyectoSitio.id, "Inventario de plugins", {
    descripcion: "Listar los plugins en uso del sitio anterior.",
    dificultad: 4,
    estado: "hecha",
    asignado_a: ope.id,
    completada_por: ope.id,
    completada_at: haceDias(70),
  });

  // Clientes de Fundación Delta
  const clienteEstudioSur = await upsertCliente(fundacionDelta.id, "Estudio Sur", "Lucía Fernández · lucia@estudiosur.test · 11 5555-1234");
  await upsertCliente(fundacionDelta.id, "Colectivo Raíz", "Nicolás Gómez · contacto@colectivoraiz.test · 11 5555-5678");
  await upsertCliente(fundacionDelta.id, "Marta Pérez", "Marta Pérez · marta.perez@demo.test · 11 5555-9012");

  // Reservas demo (fechas fijas futuras; service role bypassa RLS — desde la
  // app las reservas solo se crean vía RPC crear_reserva). Costos coherentes
  // con el plan: Pago por hora $8000/h.
  await upsertReserva(salaNorte.id, "2026-12-15", 10, {
    plan_id: planPago.id,
    cliente_id: clienteEstudioSur.id,
    horas: 2,
    costo: 16000,
    creada_por: admin.id,
  });
  await upsertReserva(salaSur.id, "2026-12-15", 14, {
    plan_id: planGratuito.id,
    para_perfil_id: ope.id,
    horas: 1,
    costo: 0,
    creada_por: ope.id,
  });

  // Movimientos manuales demo (los de reserva los generan los triggers de
  // la migración 0007; el ámbito edificio es Casa Delta).
  await upsertMovimiento(fundacionDelta.id, "Expensas y luz Casa Delta", "2026-11-05", {
    tipo: "egreso",
    categoria: "servicios",
    monto: 180000,
    edificio_id: casaDelta.id,
    creado_por: admin.id,
  });
  await upsertMovimiento(fundacionDelta.id, "Hosting del sitio", "2026-11-10", {
    tipo: "egreso",
    categoria: "servicios",
    monto: 30000,
    creado_por: admin.id,
  });
  await upsertMovimiento(fundacionDelta.id, "Donación Colectivo Raíz", "2026-11-20", {
    tipo: "ingreso",
    categoria: "donaciones",
    monto: 250000,
    creado_por: admin.id,
  });
  await upsertMovimiento(gestoraSur.id, "Limpieza Casa Delta", "2026-11-12", {
    tipo: "egreso",
    categoria: "servicios",
    monto: 90000,
    edificio_id: casaDelta.id,
    creado_por: admin.id,
  });

  // 3. Resumen
  const counts = {};
  const tables = [
    "organizaciones",
    "roles",
    "membresias",
    "edificios",
    "salas",
    "planes_reserva",
    "proyectos",
    "tareas",
    "clientes",
    "reservas",
    "movimientos",
  ];
  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true });
    assertNoError(error, `count ${table}`);
    counts[table] = count;
  }

  const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  assertNoError(usersError, "listUsers (resumen)");
  const demoEmails = new Set([
    "admin@demo.test",
    "coordi@demo.test",
    "ope@demo.test",
    "gestora@demo.test",
  ]);
  counts.usuarios = usersData.users.filter((u) => demoEmails.has(u.email)).length;

  console.log("Seed de demo completo.");
  console.log("Resumen:");
  console.log(`  orgs:      ${counts.organizaciones}`);
  console.log(`  usuarios:  ${counts.usuarios}`);
  console.log(`  roles:     ${counts.roles}`);
  console.log(`  membresias:${counts.membresias}`);
  console.log(`  edificios: ${counts.edificios}`);
  console.log(`  salas:     ${counts.salas}`);
  console.log(`  planes:    ${counts.planes_reserva}`);
  console.log(`  proyectos: ${counts.proyectos}`);
  console.log(`  tareas:    ${counts.tareas}`);
  console.log(`  clientes:  ${counts.clientes}`);
  console.log(`  reservas:  ${counts.reservas}`);
  console.log(`  movs:      ${counts.movimientos}`);
}

main().catch((err) => {
  console.error("Seed falló:", err);
  process.exit(1);
});
