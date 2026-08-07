import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { clienteAdmin } from "../rls/helpers";
import { despachar, type EnviarEmail } from "@/lib/notificaciones/despachar";

describe("despachar (integración con DB, envío falso)", () => {
  const admin = clienteAdmin();
  let adminId: string;
  const marca = { t: "despachar-test" };
  // despachar() reclama TODO el backlog email pendiente de la DB compartida
  // (100+ filas zombie de otras corridas): el sender falso las "envía" sin
  // salir nada real, pero eso les cambia estado/intentos/ultimo_error de
  // verdad en la DB. Snapshot fiel (incluyendo ultimo_error, como en
  // tests/rls/despacho.test.ts) para poder restaurarlas byte a byte en
  // afterAll y no pisar diagnóstico de filas ajenas.
  type FilaAjena = { id: string; estado: string; intentos: number; ultimo_error: string | null };
  let ajenas: FilaAjena[] = [];

  async function encolar(extra: Record<string, unknown> = {}): Promise<string> {
    const { data } = await admin.from("notificaciones")
      .insert({ usuario_id: adminId, evento: "tarea_asignada", canal: "email", payload: marca, ...extra })
      .select("id").single();
    return data!.id;
  }

  beforeAll(async () => {
    const { data } = await admin.from("perfiles").select("id").eq("email", "admin@demo.test").single();
    adminId = data!.id;
    await admin.from("notificaciones").delete().eq("payload->>t", "despachar-test");
    // Sin filtro por payload->>t: a esta altura ya se borraron las propias
    // (arriba) y ninguna se creó todavía (encolar() corre dentro de cada
    // it). Un .neq("payload->>t", ...) acá sería no solo innecesario sino
    // activamente incorrecto: la mayoría de las filas ajenas tiene un
    // payload real (sin clave "t"), y en Postgres NULL != 'x' da NULL (no
    // true), así que ese filtro las excluiría en silencio del snapshot y
    // el afterAll jamás las restauraría.
    const { data: pendientes } = await admin
      .from("notificaciones")
      .select("id, estado, intentos, ultimo_error")
      .eq("canal", "email")
      .eq("estado", "pendiente");
    ajenas = pendientes ?? [];
  }, 30000);

  afterAll(async () => {
    await admin.from("notificaciones").delete().eq("payload->>t", "despachar-test");
    // Restaurar en bloque (no fila por fila: son 100+ filas ajenas y eso
    // excede el hookTimeout). Todas las filas partían de estado 'pendiente'
    // (así se filtraron en el snapshot): despachar() puede haberlas dejado
    // en 'enviada', 'descartada', 'pendiente' (reintento) o 'fallida' según
    // le tocara a cada una. Se restauran TODAS a su estado/intentos/
    // ultimo_error original, no solo las que quedaron 'enviando' (acá nunca
    // quedan en ese estado transitorio: el dispatcher siempre resuelve el
    // envío antes de devolver).
    const grupos = new Map<
      string,
      { estado: string; intentos: number; ultimo_error: string | null; ids: string[] }
    >();
    for (const fila of ajenas) {
      const clave = `${fila.estado}|${fila.intentos}|${fila.ultimo_error ?? ""}`;
      const grupo = grupos.get(clave);
      if (grupo) {
        grupo.ids.push(fila.id);
      } else {
        grupos.set(clave, {
          estado: fila.estado, intentos: fila.intentos, ultimo_error: fila.ultimo_error, ids: [fila.id],
        });
      }
    }
    for (const grupo of grupos.values()) {
      await admin
        .from("notificaciones")
        .update({
          estado: grupo.estado, intentos: grupo.intentos, ultimo_error: grupo.ultimo_error,
          enviada_en: null, reclamada_en: null,
        })
        .in("id", grupo.ids);
    }
  }, 30000);

  it("envía pendientes, marca enviada y registra destinatario correcto", async () => {
    const id = await encolar();
    const enviados: { to: string; subject: string }[] = [];
    const falso: EnviarEmail = async (a) => { enviados.push(a); return { ok: true }; };

    const resumen = await despachar(admin, falso, "bigote <test@test>");
    expect(resumen.enviadas).toBeGreaterThanOrEqual(1);
    expect(enviados.some((e) => e.to === "admin@demo.test")).toBe(true);

    const { data } = await admin.from("notificaciones").select("estado, enviada_en").eq("id", id).single();
    expect(data!.estado).toBe("enviada");
    expect(data!.enviada_en).not.toBeNull();
  }, 60000);

  it("fallo de envío reintenta y a la 3ª queda fallida con ultimo_error", async () => {
    const id = await encolar({ intentos: 2 });
    const falso: EnviarEmail = async () => ({ ok: false, error: "boom" });

    await despachar(admin, falso, "bigote <test@test>");
    const { data } = await admin.from("notificaciones").select("estado, intentos, ultimo_error").eq("id", id).single();
    expect(data!.estado).toBe("fallida");
    expect(data!.intentos).toBe(3);
    expect(data!.ultimo_error).toContain("boom");
  }, 60000);

  it("programada con email off se descarta sin enviar", async () => {
    await admin.from("preferencias_notificaciones").upsert({ usuario_id: adminId, email: false });
    const id = await encolar({ programada_para: new Date(Date.now() - 1000).toISOString() });
    const llamadas: unknown[] = [];
    const falso: EnviarEmail = async (a) => { llamadas.push(a); return { ok: true }; };

    await despachar(admin, falso, "bigote <test@test>");
    const { data } = await admin.from("notificaciones").select("estado").eq("id", id).single();
    expect(data!.estado).toBe("descartada");
    await admin.from("preferencias_notificaciones").delete().eq("usuario_id", adminId);
  }, 60000);
});
