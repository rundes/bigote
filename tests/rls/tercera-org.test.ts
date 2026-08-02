import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clienteAdmin, clienteComo } from "./helpers";

// Cierra el criterio de §5.3: la co-gestión expone el edificio a la org
// gestora (cogestion.test.ts) pero a NADIE más. Acá se arma una tercera org
// efímera con un usuario con todos los permisos, y se verifica que ni ve
// Casa Delta ni puede reservar en ella. La org y el usuario se crean en
// beforeAll y se borran en afterAll (y también al inicio, por si una corrida
// previa crasheó sin limpiar).

const NOMBRE_ORG = "Org Tercera [test-f3]";
const EMAIL = "tercera@demo.test";

async function limpiar(admin: SupabaseClient) {
  const { data: org } = await admin
    .from("organizaciones")
    .select("id")
    .eq("nombre", NOMBRE_ORG)
    .maybeSingle();
  if (org) {
    // membresias y roles caen en cascada con la org
    const { error } = await admin.from("organizaciones").delete().eq("id", org.id);
    if (error) throw new Error(`No pude borrar ${NOMBRE_ORG}: ${error.message}`);
  }
}

describe("tercera org: un edificio co-gestionado no se filtra fuera de sus dos orgs", () => {
  const admin = clienteAdmin();
  let tercera: SupabaseClient;
  let casaDeltaId: string;
  let salaNorteId: string;
  let planGratuitoId: string;

  beforeAll(async () => {
    await limpiar(admin);

    // Usuario demo (idempotente por email, mismo patrón que el seed)
    const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (usersError) throw new Error(`listUsers: ${usersError.message}`);
    let user = usersData.users.find((u) => u.email === EMAIL) ?? null;
    if (!user) {
      const { data, error } = await admin.auth.admin.createUser({
        email: EMAIL,
        password: "demo1234",
        email_confirm: true,
        user_metadata: { name: "Teresa Tercera" },
      });
      if (error) throw new Error(`createUser: ${error.message}`);
      user = data.user;
    }

    const { data: org, error: orgError } = await admin
      .from("organizaciones")
      .insert({ nombre: NOMBRE_ORG, tipo: "empresa" })
      .select("id")
      .single();
    if (orgError || !org) throw new Error(`insert org: ${orgError?.message}`);

    const { data: rol, error: rolError } = await admin
      .from("roles")
      .insert({
        org_id: org.id,
        nombre: "Administración",
        permisos: { proyectos: true, equipo: true, finanzas: true, espacios: true, admin: true },
      })
      .select("id")
      .single();
    if (rolError || !rol) throw new Error(`insert rol: ${rolError?.message}`);

    const { error: membresiaError } = await admin
      .from("membresias")
      .insert({ org_id: org.id, perfil_id: user.id, rol_id: rol.id });
    if (membresiaError) throw new Error(`insert membresia: ${membresiaError.message}`);

    tercera = await clienteComo(EMAIL);

    const { data: edificio } = await admin
      .from("edificios")
      .select("id, org_propietaria_id")
      .eq("nombre", "Casa Delta")
      .single();
    if (!edificio) throw new Error("No encontré el edificio Casa Delta");
    casaDeltaId = edificio.id;

    const { data: sala } = await admin
      .from("salas")
      .select("id")
      .eq("edificio_id", casaDeltaId)
      .eq("nombre", "Sala Norte")
      .single();
    if (!sala) throw new Error("No encontré la Sala Norte");
    salaNorteId = sala.id;

    const { data: plan } = await admin
      .from("planes_reserva")
      .select("id")
      .eq("org_id", edificio.org_propietaria_id)
      .eq("nombre", "Gratuito")
      .single();
    if (!plan) throw new Error("No encontré el plan Gratuito");
    planGratuitoId = plan.id;
  });

  afterAll(async () => {
    await limpiar(admin);
    await tercera.auth.signOut();
  });

  it("no ve el edificio, sus salas ni sus reservas", async () => {
    const { data: edificios, error: errorEdificios } = await tercera
      .from("edificios")
      .select("id")
      .eq("id", casaDeltaId);
    expect(errorEdificios).toBeNull();
    expect(edificios).toEqual([]);

    const { data: salas, error: errorSalas } = await tercera
      .from("salas")
      .select("id")
      .eq("edificio_id", casaDeltaId);
    expect(errorSalas).toBeNull();
    expect(salas).toEqual([]);

    const { data: reservas, error: errorReservas } = await tercera
      .from("reservas")
      .select("id")
      .eq("sala_id", salaNorteId);
    expect(errorReservas).toBeNull();
    expect(reservas).toEqual([]);
  });

  it("no puede reservar: 'No podés reservar en este edificio' [fecha 2027-08-20]", async () => {
    const { error } = await tercera.rpc("crear_reserva", {
      sala: salaNorteId,
      plan: planGratuitoId,
      dia: "2027-08-20",
      inicio: 10,
      duracion: 1,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("No podés reservar en este edificio");
  });
});
