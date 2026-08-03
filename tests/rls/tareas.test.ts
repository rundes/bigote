import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clienteAdmin, clienteComo } from "./helpers";

// Todas las tareas creadas por este archivo llevan el prefijo [test-f2] en el
// título, para poder limpiarlas de forma aislada (beforeAll + afterAll con el
// cliente admin, que bypassa RLS) sin tocar las tareas históricas del seed
// que usa tests/rls/track-record.test.ts.
//
// Ejecución concurrente: este archivo solo toca tareas con prefijo
// [test-f2] en el proyecto "Sitio nuevo"; no colisiona con las fechas de
// reservas.test.ts/cogestion.test.ts ni con el histórico que lee
// track-record.test.ts (que no crea filas).
async function limpiarTareasTestF2(admin: SupabaseClient) {
  const { error } = await admin.from("tareas").delete().like("titulo", "[test-f2]%");
  if (error) throw new Error(`No pude limpiar tareas [test-f2]: ${error.message}`);
}

describe("tareas: gestión directa y transiciones vía RPC", () => {
  const clienteServicio = clienteAdmin();
  let admin: SupabaseClient;
  let coordi: SupabaseClient;
  let ope: SupabaseClient;
  let gestora: SupabaseClient;
  let coordiId: string;
  let opeId: string;
  let sitioId: string;

  beforeAll(async () => {
    // Leftovers de una corrida previa que haya crasheado antes de su afterAll.
    await limpiarTareasTestF2(clienteServicio);

    admin = await clienteComo("admin@demo.test");
    coordi = await clienteComo("coordi@demo.test");
    ope = await clienteComo("ope@demo.test");
    gestora = await clienteComo("gestora@demo.test");

    const { data: coordiUser, error: coordiUserError } = await coordi.auth.getUser();
    if (coordiUserError || !coordiUser.user) throw new Error("No pude obtener el usuario coordi");
    coordiId = coordiUser.user.id;

    const { data: opeUser, error: opeUserError } = await ope.auth.getUser();
    if (opeUserError || !opeUser.user) throw new Error("No pude obtener el usuario ope");
    opeId = opeUser.user.id;

    const { data: fundacionDelta, error: fundacionDeltaError } = await clienteServicio
      .from("organizaciones")
      .select("id")
      .eq("nombre", "Fundación Delta")
      .single();
    if (fundacionDeltaError || !fundacionDelta) throw new Error("No encontré Fundación Delta");

    const { data: sitio, error: sitioError } = await clienteServicio
      .from("proyectos")
      .select("id")
      .eq("org_id", fundacionDelta.id)
      .eq("nombre", "Sitio nuevo")
      .single();
    if (sitioError || !sitio) throw new Error("No encontré el proyecto Sitio nuevo");
    sitioId = sitio.id;
  });

  afterAll(async () => {
    await limpiarTareasTestF2(clienteServicio);
  });

  it("admin (permiso proyectos) crea una tarea directa en el pool de Sitio nuevo -> OK", async () => {
    // Con el cliente autenticado (no el de servicio) para probar de verdad
    // la policy tareas_gestion: si se pusiera más restrictiva, este insert
    // fallaría y el test lo detectaría.
    const { data, error } = await admin
      .from("tareas")
      .insert({
        proyecto_id: sitioId,
        titulo: "[test-f2] tarea pool directa",
        dificultad: 1,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.estado).toBe("pendiente");
    expect(data!.asignado_a).toBeNull();

    const { data: confirmada } = await clienteServicio
      .from("tareas")
      .select("id")
      .eq("id", data!.id)
      .single();
    expect(confirmada).not.toBeNull();
  });

  it("gestora (no es miembro de Fundación Delta) no puede insertar tareas directo en Sitio nuevo", async () => {
    const { data, error } = await gestora
      .from("tareas")
      .insert({
        proyecto_id: sitioId,
        titulo: "[test-f2] intento gestora",
        dificultad: 1,
      })
      .select();

    // La policy tareas_gestion exige permiso 'proyectos' o 'admin' en la org
    // dueña del proyecto; gestora no es miembro de Fundación Delta, así que
    // el insert es rechazado por RLS (con .select() encadenado el rechazo
    // llega como error, no como data: []).
    expect(error).not.toBeNull();
    expect(data).toBeNull();

    const { data: intrusa } = await clienteServicio
      .from("tareas")
      .select("id")
      .eq("titulo", "[test-f2] intento gestora");
    expect(intrusa).toEqual([]);
  });

  it("carrera de tomar_tarea: de coordi y ope, exactamente uno se queda con la tarea del pool", async () => {
    const { data: tarea, error: errorTarea } = await clienteServicio
      .from("tareas")
      .insert({
        proyecto_id: sitioId,
        titulo: "[test-f2] tarea race",
        dificultad: 1,
      })
      .select()
      .single();
    expect(errorTarea).toBeNull();
    const tareaId = tarea!.id;

    const resultados = await Promise.allSettled([
      coordi.rpc("tomar_tarea", { tarea: tareaId }),
      ope.rpc("tomar_tarea", { tarea: tareaId }),
    ]);

    // Con supabase-js un error de la RPC no rechaza la promesa: llega como
    // { error } dentro de un resultado "fulfilled". Contemplamos igual el
    // caso "rejected" por si algún transporte llegara a rechazar la promesa.
    const exitos = resultados.filter(
      (r) => r.status === "fulfilled" && r.value.error === null,
    );
    const fallidos = resultados.filter(
      (r) => r.status === "rejected" || (r.status === "fulfilled" && r.value.error !== null),
    );

    expect(exitos).toHaveLength(1);
    expect(fallidos).toHaveLength(1);

    const fallido = fallidos[0];
    const mensajeError =
      fallido.status === "rejected"
        ? String((fallido.reason as { message?: string })?.message ?? fallido.reason)
        : fallido.value.error!.message;
    expect(mensajeError).toContain("tomó primero");

    const { data: tareaFinal } = await clienteServicio
      .from("tareas")
      .select("estado, asignado_a")
      .eq("id", tareaId)
      .single();
    expect(tareaFinal!.estado).toBe("en_curso");
    expect([coordiId, opeId]).toContain(tareaFinal!.asignado_a);
  });

  it("completar_tarea: coordi no puede completar la tarea de ope; ope sí puede completar la suya", async () => {
    const { data: tarea, error: errorTarea } = await clienteServicio
      .from("tareas")
      .insert({
        proyecto_id: sitioId,
        titulo: "[test-f2] tarea completar",
        dificultad: 1,
        asignado_a: opeId,
        estado: "en_curso",
      })
      .select()
      .single();
    expect(errorTarea).toBeNull();
    const tareaId = tarea!.id;

    const { error: errorCoordi } = await coordi.rpc("completar_tarea", { tarea: tareaId });
    expect(errorCoordi).not.toBeNull();
    expect(errorCoordi!.message).toContain("Solo la persona asignada");

    // Confirmamos que la tarea sigue sin completar tras el intento rechazado.
    const { data: sinCompletar } = await clienteServicio
      .from("tareas")
      .select("estado, completada_por")
      .eq("id", tareaId)
      .single();
    expect(sinCompletar!.estado).toBe("en_curso");
    expect(sinCompletar!.completada_por).toBeNull();

    const { error: errorOpe } = await ope.rpc("completar_tarea", { tarea: tareaId });
    expect(errorOpe).toBeNull();

    const { data: tareaFinal } = await clienteServicio
      .from("tareas")
      .select("estado, completada_por")
      .eq("id", tareaId)
      .single();
    expect(tareaFinal!.estado).toBe("hecha");
    expect(tareaFinal!.completada_por).toBe(opeId);
  });

  it("soltar_tarea: coordi no puede soltar una tarea en_curso que tiene ope", async () => {
    const { data: tarea, error: errorTarea } = await clienteServicio
      .from("tareas")
      .insert({
        proyecto_id: sitioId,
        titulo: "[test-f2] tarea soltar ajena",
        dificultad: 1,
        asignado_a: opeId,
        estado: "en_curso",
      })
      .select()
      .single();
    expect(errorTarea).toBeNull();
    const tareaId = tarea!.id;

    const { error: errorCoordi } = await coordi.rpc("soltar_tarea", { tarea: tareaId });
    expect(errorCoordi).not.toBeNull();
    expect(errorCoordi!.message).toContain("No la podés soltar");

    const { data: sinSoltar } = await clienteServicio
      .from("tareas")
      .select("estado, asignado_a")
      .eq("id", tareaId)
      .single();
    expect(sinSoltar!.estado).toBe("en_curso");
    expect(sinSoltar!.asignado_a).toBe(opeId);
  });

  it("soltar_tarea: ope (dueño) puede soltarla al pool; coordi puede volver a tomarla", async () => {
    const { data: tarea, error: errorTarea } = await clienteServicio
      .from("tareas")
      .insert({
        proyecto_id: sitioId,
        titulo: "[test-f2] tarea soltar propia",
        dificultad: 1,
        asignado_a: opeId,
        estado: "en_curso",
      })
      .select()
      .single();
    expect(errorTarea).toBeNull();
    const tareaId = tarea!.id;

    const { error: errorOpe } = await ope.rpc("soltar_tarea", { tarea: tareaId });
    expect(errorOpe).toBeNull();

    const { data: sueltaEnPool } = await clienteServicio
      .from("tareas")
      .select("estado, asignado_a")
      .eq("id", tareaId)
      .single();
    expect(sueltaEnPool!.estado).toBe("pendiente");
    expect(sueltaEnPool!.asignado_a).toBeNull();

    const { error: errorTomarCoordi } = await coordi.rpc("tomar_tarea", { tarea: tareaId });
    expect(errorTomarCoordi).toBeNull();

    const { data: tomadaPorCoordi } = await clienteServicio
      .from("tareas")
      .select("estado, asignado_a")
      .eq("id", tareaId)
      .single();
    expect(tomadaPorCoordi!.estado).toBe("en_curso");
    expect(tomadaPorCoordi!.asignado_a).toBe(coordiId);
  });
});
