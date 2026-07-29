import { describe, it, expect } from "vitest";
import { clienteComo } from "./helpers";

describe("aislamiento entre organizaciones", () => {
  // Excepción co-gestión (spec §4, avalada en la revisión de seguridad de
  // Task 4): el nombre de la org socia de un edificio co-gestionado es
  // visible (la UI de espacios necesita mostrar "co-gestión con <nombre>"),
  // pero ninguno de sus datos (clientes, proyectos, planes, movimientos) lo
  // es. La garantía real de "ningún dato" se prueba a nivel de esas tablas.
  it("coordi ve el nombre de la org socia del edificio co-gestionado, pero nada de sus datos", async () => {
    const coordi = await clienteComo("coordi@demo.test");
    const { data: orgs } = await coordi.from("organizaciones").select("id, nombre");
    const nombres = (orgs ?? []).map((o) => o.nombre);
    expect(nombres).toContain("Fundación Delta");
    expect(nombres).toContain("Gestora Sur");

    const gestoraSur = (orgs ?? []).find((o) => o.nombre === "Gestora Sur");
    expect(gestoraSur).toBeDefined();
    const gestoraSurId = gestoraSur!.id;

    const { data: clientes } = await coordi
      .from("clientes")
      .select("id")
      .eq("org_id", gestoraSurId);
    expect(clientes).toEqual([]);

    const { data: planes } = await coordi
      .from("planes_reserva")
      .select("id")
      .eq("org_id", gestoraSurId);
    expect(planes).toEqual([]);

    const { data: proyectos } = await coordi
      .from("proyectos")
      .select("id")
      .eq("org_id", gestoraSurId);
    expect(proyectos).toEqual([]);

    // Vacío también porque coordi no tiene permiso finanzas en ninguna org,
    // pero confirma igual la ausencia de datos de Gestora Sur.
    const { data: movimientos } = await coordi
      .from("movimientos")
      .select("id")
      .eq("org_id", gestoraSurId);
    expect(movimientos).toEqual([]);
  });

  it("coordi sin permiso finanzas no lee movimientos", async () => {
    const coordi = await clienteComo("coordi@demo.test");
    const { data } = await coordi.from("movimientos").select("id");
    expect(data).toEqual([]);
  });

  it("coordi sin permiso espacios no puede crear salas", async () => {
    const coordi = await clienteComo("coordi@demo.test");
    const { data: salas } = await coordi.from("salas").select("edificio_id").limit(1);
    const { error } = await coordi
      .from("salas")
      .insert({ edificio_id: salas![0].edificio_id, nombre: "Intrusa" });
    expect(error).not.toBeNull();
  });

  it("admin de ambas orgs ve las dos", async () => {
    const admin = await clienteComo("admin@demo.test");
    const { data } = await admin.from("organizaciones").select("nombre");
    expect((data ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
