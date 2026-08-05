import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { clienteAdmin, clienteComo } from "./helpers";

// RLS de notificaciones, preferencias y push: cada uno lo suyo, nada ajeno.
// wa_mensajes: invisible para authenticated (sin políticas).
describe("RLS notificaciones", () => {
  const admin = clienteAdmin();
  let adminId: string;
  let coordiId: string;
  let filaAdmin: string;

  beforeAll(async () => {
    const perfiles = await admin
      .from("perfiles")
      .select("id, email")
      .in("email", ["admin@demo.test", "coordi@demo.test"]);
    adminId = perfiles.data!.find((p) => p.email === "admin@demo.test")!.id;
    coordiId = perfiles.data!.find((p) => p.email === "coordi@demo.test")!.id;

    const { data } = await admin
      .from("notificaciones")
      .insert({ usuario_id: adminId, evento: "tarea_asignada", canal: "email", payload: { t: "rls" } })
      .select("id")
      .single();
    filaAdmin = data!.id;
  });

  afterAll(async () => {
    await admin.from("notificaciones").delete().eq("id", filaAdmin);
    await admin.from("preferencias_notificaciones").delete().in("usuario_id", [adminId, coordiId]);
    await admin.from("push_suscripciones").delete().in("usuario_id", [adminId, coordiId]);
  });

  it("cada usuario ve solo sus notificaciones", async () => {
    const comoAdmin = await clienteComo("admin@demo.test");
    const propias = await comoAdmin.from("notificaciones").select("id").eq("id", filaAdmin);
    expect(propias.data).toHaveLength(1);

    const comoCoordi = await clienteComo("coordi@demo.test");
    const ajenas = await comoCoordi.from("notificaciones").select("id").eq("id", filaAdmin);
    expect(ajenas.data).toHaveLength(0);
  });

  it("authenticated no puede insertar, actualizar ni borrar el outbox", async () => {
    const comoCoordi = await clienteComo("coordi@demo.test");
    const insercion = await comoCoordi
      .from("notificaciones")
      .insert({ usuario_id: coordiId, evento: "tarea_asignada", canal: "email" });
    expect(insercion.error).not.toBeNull();

    const cambio = await comoCoordi
      .from("notificaciones")
      .update({ estado: "enviada" })
      .eq("id", filaAdmin)
      .select();
    expect(cambio.data ?? []).toHaveLength(0);

    const borrado = await comoCoordi.from("notificaciones").delete().eq("id", filaAdmin).select();
    expect(borrado.data ?? []).toHaveLength(0);

    const sigueAhi = await admin.from("notificaciones").select("id").eq("id", filaAdmin);
    expect(sigueAhi.data).toHaveLength(1);
  });

  it("preferencias: upsert propio sí, ajeno no", async () => {
    const comoAdmin = await clienteComo("admin@demo.test");
    const propio = await comoAdmin
      .from("preferencias_notificaciones")
      .upsert({ usuario_id: adminId, wa: false });
    expect(propio.error).toBeNull();

    const ajeno = await comoAdmin
      .from("preferencias_notificaciones")
      .upsert({ usuario_id: coordiId, wa: false });
    expect(ajeno.error).not.toBeNull();

    const comoCoordi = await clienteComo("coordi@demo.test");
    const lectura = await comoCoordi
      .from("preferencias_notificaciones")
      .select("usuario_id")
      .eq("usuario_id", adminId);
    expect(lectura.data).toHaveLength(0);
  });

  it("push_suscripciones: all propio sí, ajeno no", async () => {
    const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const comoAdmin = await clienteComo("admin@demo.test");
    const propia = await comoAdmin.from("push_suscripciones").insert({
      usuario_id: adminId,
      endpoint: `https://test.push/rls-${sufijo}`,
      p256dh: "dummy-p256dh",
      auth: "dummy-auth",
    });
    expect(propia.error).toBeNull();

    const ajena = await comoAdmin.from("push_suscripciones").insert({
      usuario_id: coordiId,
      endpoint: `https://test.push/rls-ajena-${sufijo}`,
      p256dh: "dummy-p256dh",
      auth: "dummy-auth",
    });
    expect(ajena.error).not.toBeNull();

    const comoCoordi = await clienteComo("coordi@demo.test");
    const lectura = await comoCoordi
      .from("push_suscripciones")
      .select("id")
      .eq("usuario_id", adminId);
    expect(lectura.data).toHaveLength(0);
  });

  it("wa_mensajes es invisible para authenticated", async () => {
    await admin.from("wa_mensajes").insert({
      numero: "+5491100000000", direccion: "entrante", texto: "hola rls",
    });
    const comoAdmin = await clienteComo("admin@demo.test");
    const lectura = await comoAdmin.from("wa_mensajes").select("id");
    expect(lectura.data ?? []).toHaveLength(0);
    await admin.from("wa_mensajes").delete().eq("numero", "+5491100000000");
  });

  it("teléfono: el propio se edita, el formato inválido se rechaza", async () => {
    const comoAdmin = await clienteComo("admin@demo.test");
    const valido = await comoAdmin
      .from("perfiles")
      .update({ telefono: "+5491133344455" })
      .eq("id", adminId)
      .select("telefono");
    expect(valido.error).toBeNull();
    expect(valido.data![0].telefono).toBe("+5491133344455");

    const invalido = await comoAdmin
      .from("perfiles")
      .update({ telefono: "1133344455" })
      .eq("id", adminId);
    expect(invalido.error).not.toBeNull();

    await admin.from("perfiles").update({ telefono: null }).eq("id", adminId);
  });
});
