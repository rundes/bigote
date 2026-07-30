import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clienteAdmin, clienteComo } from "./helpers";

// Fila devuelta por la RPC track_record (ver supabase/migrations/0004_tareas_rpc.sql).
//
// Ejecución concurrente: este archivo es de solo lectura (no crea ni
// modifica tareas), así que puede correr en paralelo con cualquier otro
// archivo de tests/rls sin pisar datos.
type FilaTrackRecord = {
  perfil_id: string;
  nombre: string;
  completadas: number;
  dificultad_total: number;
  dificultad_promedio: number;
};

describe("track_record: privacidad del historial de tareas completadas", () => {
  const admin = clienteAdmin();
  let coordi: SupabaseClient;
  let ope: SupabaseClient;
  let coordiId: string;
  let opeId: string;
  let fundacionDeltaId: string;
  let campanaId: string;

  beforeAll(async () => {
    coordi = await clienteComo("coordi@demo.test");
    ope = await clienteComo("ope@demo.test");

    const { data: coordiUser, error: coordiUserError } = await coordi.auth.getUser();
    if (coordiUserError || !coordiUser.user) throw new Error("No pude obtener el usuario coordi");
    coordiId = coordiUser.user.id;

    const { data: opeUser, error: opeUserError } = await ope.auth.getUser();
    if (opeUserError || !opeUser.user) throw new Error("No pude obtener el usuario ope");
    opeId = opeUser.user.id;

    const { data: fundacionDelta, error: fundacionDeltaError } = await admin
      .from("organizaciones")
      .select("id")
      .eq("nombre", "Fundación Delta")
      .single();
    if (fundacionDeltaError || !fundacionDelta) throw new Error("No encontré Fundación Delta");
    fundacionDeltaId = fundacionDelta.id;

    const { data: campana, error: campanaError } = await admin
      .from("proyectos")
      .select("id")
      .eq("org_id", fundacionDeltaId)
      .eq("nombre", "Campaña socios")
      .single();
    if (campanaError || !campana) throw new Error("No encontré el proyecto Campaña socios");
    campanaId = campana.id;
  });

  afterAll(async () => {
    await coordi.auth.signOut();
    await ope.auth.signOut();
  });

  it("coordi (permiso equipo) ve el track record completo: al menos coordi y ope", async () => {
    const { data, error } = await coordi.rpc("track_record", { org: fundacionDeltaId });
    expect(error).toBeNull();

    const filas = (data ?? []) as FilaTrackRecord[];
    expect(filas.length).toBeGreaterThanOrEqual(2);

    const porPerfil = filas.find((f) => f.perfil_id === coordiId);
    expect(porPerfil).toBeDefined();
    expect(porPerfil!.completadas).toBeGreaterThanOrEqual(2);

    const porPerfilOpe = filas.find((f) => f.perfil_id === opeId);
    expect(porPerfilOpe).toBeDefined();
    expect(porPerfilOpe!.completadas).toBeGreaterThanOrEqual(2);
  });

  it("ope (sin permiso equipo) solo ve su propia fila del track record", async () => {
    const { data, error } = await ope.rpc("track_record", { org: fundacionDeltaId });
    expect(error).toBeNull();

    const filas = (data ?? []) as FilaTrackRecord[];
    expect(filas).toHaveLength(1);
    expect(filas[0].perfil_id).toBe(opeId);
  });

  it("filtro por proyecto 'Campaña socios' excluye las completadas históricas de 'Sitio nuevo'", async () => {
    const { data, error } = await coordi.rpc("track_record", {
      org: fundacionDeltaId,
      proyecto: campanaId,
    });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
