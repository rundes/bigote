import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { clienteAdmin, clienteComo } from "./helpers";

describe("triggers de notificaciones: tareas", () => {
  const admin = clienteAdmin();
  let adminId: string;
  let coordiId: string;
  let proyectoId: string;
  const tareasCreadas: string[] = [];

  beforeAll(async () => {
    const { data: perfiles } = await admin
      .from("perfiles").select("id, email")
      .in("email", ["admin@demo.test", "coordi@demo.test"]);
    adminId = perfiles!.find((p) => p.email === "admin@demo.test")!.id;
    coordiId = perfiles!.find((p) => p.email === "coordi@demo.test")!.id;
    // proyecto del seed donde ambos son miembros (mismo criterio que tareas.test.ts)
    const { data: pm } = await admin
      .from("proyecto_miembros").select("proyecto_id").eq("perfil_id", coordiId).limit(1);
    proyectoId = pm![0].proyecto_id;
  }, 30000);

  afterAll(async () => {
    if (tareasCreadas.length) {
      for (const id of tareasCreadas) {
        await admin.from("notificaciones").delete().eq("payload->>tarea_id", id);
      }
      await admin.from("tareas").delete().in("id", tareasCreadas);
    }
  }, 30000);

  async function crearTareaComo(email: string, asignado: string | null): Promise<string> {
    const cliente = await clienteComo(email);
    const { data, error } = await cliente
      .from("tareas")
      .insert({ proyecto_id: proyectoId, titulo: "test notif", dificultad: 1, asignado_a: asignado })
      .select("id, creada_por")
      .single();
    expect(error).toBeNull();
    tareasCreadas.push(data!.id);
    return data!.id;
  }

  it("asignar a otro encola tarea_asignada; creada_por queda seteado", async () => {
    const tareaId = await crearTareaComo("admin@demo.test", coordiId);
    const { data: tarea } = await admin
      .from("tareas").select("creada_por").eq("id", tareaId).single();
    expect(tarea!.creada_por).toBe(adminId);

    const { data: filas } = await admin
      .from("notificaciones")
      .select("usuario_id, evento")
      .eq("payload->>tarea_id", tareaId);
    expect(filas!.some((f) => f.evento === "tarea_asignada" && f.usuario_id === coordiId)).toBe(true);
  });

  it("tarea sin asignado no encola nada", async () => {
    const tareaId = await crearTareaComo("admin@demo.test", null);
    const { data: filas } = await admin
      .from("notificaciones").select("id").eq("payload->>tarea_id", tareaId);
    expect(filas).toHaveLength(0);
  });

  it("completar tarea ajena avisa al creador; completar propia no", async () => {
    // Sin asignado, así tomar_tarea (que exige asignado_a is null, ver
    // 0004:8) hace un self-assign real en vez de ser un no-op.
    const ajena = await crearTareaComo("admin@demo.test", null);
    const comoCoordi = await clienteComo("coordi@demo.test");
    const { error: errorTomar } = await comoCoordi.rpc("tomar_tarea", { tarea: ajena });
    expect(errorTomar).toBeNull();

    // El self-assign (asignado_a = auth.uid()) no debe generar tarea_asignada:
    // el trigger filtra por actor (0008:237).
    const { data: filasAsignada } = await admin
      .from("notificaciones")
      .select("id")
      .eq("payload->>tarea_id", ajena)
      .eq("evento", "tarea_asignada");
    expect(filasAsignada).toHaveLength(0);

    const { error } = await comoCoordi.rpc("completar_tarea", { tarea: ajena });
    expect(error).toBeNull();
    const { data: filas } = await admin
      .from("notificaciones")
      .select("usuario_id, evento")
      .eq("payload->>tarea_id", ajena)
      .eq("evento", "tarea_hecha");
    expect(filas!.some((f) => f.usuario_id === adminId)).toBe(true);

    const propia = await crearTareaComo("admin@demo.test", null);
    const comoAdmin = await clienteComo("admin@demo.test");
    const { error: errorTomarPropia } = await comoAdmin.rpc("tomar_tarea", { tarea: propia });
    expect(errorTomarPropia).toBeNull();
    const { error: errorCompletarPropia } = await comoAdmin.rpc("completar_tarea", { tarea: propia });
    expect(errorCompletarPropia).toBeNull();
    const { data: filasPropia } = await admin
      .from("notificaciones")
      .select("id").eq("payload->>tarea_id", propia).eq("evento", "tarea_hecha");
    expect(filasPropia).toHaveLength(0);
  });

  it("alta de membresía encola invitación wa (con teléfono) y descarta email", async () => {
    // org donde coordi todavía no es miembro (admin pertenece a las dos del seed)
    const { data: orgs } = await admin.from("organizaciones").select("id");
    const { data: mias } = await admin
      .from("membresias").select("org_id").eq("perfil_id", coordiId);
    const orgNueva = orgs!.find((o) => !mias!.some((m) => m.org_id === o.id))!.id;
    const { data: rol } = await admin
      .from("roles").select("id").eq("org_id", orgNueva).limit(1).single();

    await admin.from("perfiles").update({ telefono: "+5491177788899" }).eq("id", coordiId);
    const { error } = await admin
      .from("membresias")
      .insert({ org_id: orgNueva, perfil_id: coordiId, rol_id: rol!.id });
    expect(error).toBeNull();

    const { data: filas } = await admin
      .from("notificaciones")
      .select("canal, estado")
      .eq("usuario_id", coordiId)
      .eq("evento", "invitacion");
    expect(filas!.some((f) => f.canal === "wa" && f.estado === "pendiente")).toBe(true);
    expect(filas!.filter((f) => f.canal === "email").every((f) => f.estado === "descartada")).toBe(true);

    // limpieza
    await admin.from("membresias").delete()
      .eq("org_id", orgNueva).eq("perfil_id", coordiId);
    await admin.from("notificaciones").delete()
      .eq("usuario_id", coordiId).eq("evento", "invitacion");
    await admin.from("perfiles").update({ telefono: null }).eq("id", coordiId);
  });
});
