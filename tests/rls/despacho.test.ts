import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { clienteAdmin, clienteComo } from "./helpers";

// Funciones de despacho de 0009/0010: claim atómico, rescate, filtro de
// canales y guard de creada_por.
describe("despacho de notificaciones", () => {
  const admin = clienteAdmin();
  let adminId: string;
  const creadas: string[] = [];

  // La DB compartida trae pendientes email ajenas (zombies de otras
  // corridas + posibles pendientes reales). reclamar_notificaciones con
  // maximo:100 las va a atrapar junto con las nuestras. Snapshot antes de
  // tocar nada; en afterAll restauramos las que hayan quedado "enviando"
  // por nuestros claims.
  type FilaAjena = {
    id: string;
    estado: string;
    intentos: number;
    reclamada_en: string | null;
    ultimo_error: string | null;
  };
  let ajenas: FilaAjena[] = [];
  // reclamar_notificaciones ordena por creada_en asc: con maximo:100 fijo,
  // si el backlog ajeno ya iguala o supera 100 filas elegibles, nuestra
  // fila recién creada (la más nueva) queda afuera del corte y el claim
  // "no la ve" aunque la función esté bien. maximoSeguro se calcula sobre
  // el snapshot para blindar los asserts de inclusión sin depender del
  // volumen de basura ajena acumulada en la DB compartida.
  // Asume <20 pendientes ajenas nuevas entre el snapshot y el claim: hoy
  // es seguro (no hay dispatcher vivo ni suites corriendo en paralelo
  // contra esta DB), pero no es una garantía general — revisar este
  // margen cuando el dispatcher real esté desplegado y compitiendo por
  // las mismas filas.
  let maximoSeguro: number;

  async function encolarDirecto(extra: Record<string, unknown> = {}): Promise<string> {
    const { data, error } = await admin
      .from("notificaciones")
      .insert({
        usuario_id: adminId, evento: "tarea_asignada", canal: "email",
        payload: { t: "despacho-test" }, ...extra,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    creadas.push(data!.id);
    return data!.id;
  }

  beforeAll(async () => {
    const { data } = await admin
      .from("perfiles").select("id").eq("email", "admin@demo.test").single();
    adminId = data!.id;
    // limpieza defensiva de corridas abortadas
    await admin.from("notificaciones").delete().eq("payload->>t", "despacho-test");

    const { data: pendientesEmail } = await admin
      .from("notificaciones")
      .select("id, estado, intentos, reclamada_en, ultimo_error")
      .eq("canal", "email")
      .eq("estado", "pendiente");
    ajenas = pendientesEmail ?? [];
    maximoSeguro = ajenas.length + 20;
  }, 30000);

  afterAll(async () => {
    await admin.from("notificaciones").delete().eq("payload->>t", "despacho-test");
    // Restaurar en bloque, agrupando por (intentos, reclamada_en,
    // ultimo_error) original -- son ~90 filas ajenas y una vuelta fila por
    // fila excede el hookTimeout. Todas partían de estado 'pendiente'
    // (así se filtraron en el snapshot), así que alcanza con pisar las
    // que hayan quedado 'enviando' por nuestros claims. ultimo_error
    // entra al agrupamiento (y no se pisa a null a secas): una fila ajena
    // 'pendiente' puede legítimamente traer diagnóstico de un rescate
    // previo (0010) y perderlo sería destruir información real.
    const grupos = new Map<
      string,
      { intentos: number; reclamada_en: string | null; ultimo_error: string | null; ids: string[] }
    >();
    for (const fila of ajenas) {
      const clave = `${fila.intentos}|${fila.reclamada_en ?? ""}|${fila.ultimo_error ?? ""}`;
      const grupo = grupos.get(clave);
      if (grupo) {
        grupo.ids.push(fila.id);
      } else {
        grupos.set(clave, {
          intentos: fila.intentos,
          reclamada_en: fila.reclamada_en,
          ultimo_error: fila.ultimo_error,
          ids: [fila.id],
        });
      }
    }
    for (const grupo of grupos.values()) {
      await admin
        .from("notificaciones")
        .update({
          estado: "pendiente",
          intentos: grupo.intentos,
          reclamada_en: grupo.reclamada_en,
          ultimo_error: grupo.ultimo_error,
        })
        .eq("estado", "enviando")
        .in("id", grupo.ids);
    }
  }, 30000);

  it("reclamar pasa pendiente→enviando y no entrega dos veces", async () => {
    const id = await encolarDirecto();
    const primera = await admin.rpc("reclamar_notificaciones", {
      canales: ["email"], maximo: maximoSeguro,
    });
    expect(primera.error).toBeNull();
    const mias = (primera.data as { id: string; estado: string }[]).filter((n) => n.id === id);
    expect(mias).toHaveLength(1);
    expect(mias[0].estado).toBe("enviando");

    const segunda = await admin.rpc("reclamar_notificaciones", {
      canales: ["email"], maximo: maximoSeguro,
    });
    expect((segunda.data as { id: string }[]).some((n) => n.id === id)).toBe(false);
  });

  it("reclamar respeta programada_para futura y canal", async () => {
    const futura = await encolarDirecto({
      programada_para: new Date(Date.now() + 3600_000).toISOString(),
    });
    const otroCanal = await encolarDirecto({ canal: "wa" });
    const { data } = await admin.rpc("reclamar_notificaciones", {
      canales: ["email"], maximo: 100,
    });
    const ids = (data as { id: string }[]).map((n) => n.id);
    expect(ids).not.toContain(futura);
    expect(ids).not.toContain(otroCanal);
  });

  it("rescatar devuelve a pendiente solo filas colgadas viejas", async () => {
    const id = await encolarDirecto();
    await admin.rpc("reclamar_notificaciones", { canales: ["email"], maximo: maximoSeguro });
    // recién reclamada: no debe rescatarse
    const { data: cero } = await admin.rpc("rescatar_notificaciones_colgadas");
    const { data: sigue } = await admin
      .from("notificaciones").select("estado").eq("id", id).single();
    expect(sigue!.estado).toBe("enviando");

    // se envejece a mano y ahí sí
    await admin.from("notificaciones")
      .update({ reclamada_en: new Date(Date.now() - 11 * 60_000).toISOString() })
      .eq("id", id);
    const { data: uno } = await admin.rpc("rescatar_notificaciones_colgadas");
    expect(uno).toBeGreaterThanOrEqual(1);
    const { data: rescatada } = await admin
      .from("notificaciones")
      .select("estado, reclamada_en, intentos, ultimo_error")
      .eq("id", id)
      .single();
    // 0010: el rescate incrementa intentos y setea ultimo_error; con
    // intentos bajos (recién nacida, 0→1) vuelve a pendiente, no fallida.
    expect(rescatada!.estado).toBe("pendiente");
    expect(rescatada!.reclamada_en).toBeNull();
    expect(rescatada!.intentos).toBeGreaterThanOrEqual(1);
    expect(rescatada!.ultimo_error).not.toBeNull();
    void cero;
  });

  it("authenticated no puede ejecutar las funciones de despacho", async () => {
    const comoAdmin = await clienteComo("admin@demo.test");
    const claim = await comoAdmin.rpc("reclamar_notificaciones", {
      canales: ["email"], maximo: 1,
    });
    expect(claim.error).not.toBeNull();
    const rescate = await comoAdmin.rpc("rescatar_notificaciones_colgadas");
    expect(rescate.error).not.toBeNull();
  });

  it("creada_por no se puede falsificar por insert directo", async () => {
    const comoAdmin = await clienteComo("admin@demo.test");
    const { data: coordi } = await admin
      .from("perfiles").select("id").eq("email", "coordi@demo.test").single();
    const { data: pm } = await admin
      .from("proyecto_miembros").select("proyecto_id").eq("perfil_id", adminId).limit(1);
    const { data: tarea, error } = await comoAdmin
      .from("tareas")
      .insert({
        proyecto_id: pm![0].proyecto_id, titulo: "spoof test", dificultad: 1,
        creada_por: coordi!.id,
      })
      .select("id, creada_por")
      .single();
    expect(error).toBeNull();
    expect(tarea!.creada_por).toBe(adminId); // el trigger pisó el spoof
    await admin.from("notificaciones").delete().eq("payload->>tarea_id", tarea!.id);
    await admin.from("tareas").delete().eq("id", tarea!.id);
  });
});
