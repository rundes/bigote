import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clienteAdmin, clienteComo } from "./helpers";

// Fase 5: políticas de membresias/roles y efecto de la desactivación. Org
// efímera propia con dos usuarios (una admin, un miembro raso) para poder
// togglear `activo` sin tocar el seed compartido.

const NOMBRE_ORG = "Org Equipo [test-f5]";
const EMAIL_ADMIN = "equipo-admin@demo.test";
const EMAIL_RASO = "equipo-raso@demo.test";

async function limpiar(admin: SupabaseClient) {
  const { data: org } = await admin
    .from("organizaciones")
    .select("id")
    .eq("nombre", NOMBRE_ORG)
    .maybeSingle();
  if (org) {
    const { error } = await admin.from("organizaciones").delete().eq("id", org.id);
    if (error) throw new Error(`No pude borrar ${NOMBRE_ORG}: ${error.message}`);
  }
}

async function upsertUsuario(admin: SupabaseClient, email: string, nombre: string) {
  const { data: usersData, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  const existente = usersData.users.find((u) => u.email === email);
  if (existente) return existente;
  const { data, error: createError } = await admin.auth.admin.createUser({
    email,
    password: "demo1234",
    email_confirm: true,
    user_metadata: { name: nombre },
  });
  if (createError) throw new Error(`createUser ${email}: ${createError.message}`);
  return data.user;
}

describe("equipo: políticas de membresias/roles y desactivación", () => {
  const admin = clienteAdmin();
  let coordi: SupabaseClient;
  let raso: SupabaseClient;
  let orgId: string;
  let rasoId: string;
  let fundacionDeltaId: string;

  beforeAll(async () => {
    await limpiar(admin);

    const { data: delta } = await admin
      .from("organizaciones")
      .select("id")
      .eq("nombre", "Fundación Delta")
      .single();
    if (!delta) throw new Error("No encontré Fundación Delta");
    fundacionDeltaId = delta.id;

    const adminUser = await upsertUsuario(admin, EMAIL_ADMIN, "Alba Admin Efímera");
    const rasoUser = await upsertUsuario(admin, EMAIL_RASO, "Rafa Raso");
    rasoId = rasoUser.id;

    const { data: org, error: orgError } = await admin
      .from("organizaciones")
      .insert({ nombre: NOMBRE_ORG, tipo: "empresa" })
      .select("id")
      .single();
    if (orgError || !org) throw new Error(`insert org: ${orgError?.message}`);
    orgId = org.id;

    const { data: rolAdmin, error: e1 } = await admin
      .from("roles")
      .insert({
        org_id: orgId,
        nombre: "Administración",
        permisos: { proyectos: true, equipo: true, finanzas: true, espacios: true, admin: true },
      })
      .select("id")
      .single();
    const { data: rolBase, error: e2 } = await admin
      .from("roles")
      .insert({
        org_id: orgId,
        nombre: "Base",
        permisos: { proyectos: false, equipo: false, finanzas: false, espacios: false, admin: false },
      })
      .select("id")
      .single();
    if (e1 || e2 || !rolAdmin || !rolBase) throw new Error("No pude crear los roles efímeros");

    const { error: m1 } = await admin
      .from("membresias")
      .insert({ org_id: orgId, perfil_id: adminUser.id, rol_id: rolAdmin.id });
    const { error: m2 } = await admin
      .from("membresias")
      .insert({ org_id: orgId, perfil_id: rasoUser.id, rol_id: rolBase.id });
    if (m1 || m2) throw new Error("No pude crear las membresías efímeras");

    coordi = await clienteComo("coordi@demo.test");
    raso = await clienteComo(EMAIL_RASO);
  });

  afterAll(async () => {
    await limpiar(admin);
  });

  it("(1) sin permiso admin no se mutan membresías ni roles (coordi en su propia org)", async () => {
    const { data: membresias } = await admin
      .from("membresias")
      .select("perfil_id, rol_id")
      .eq("org_id", fundacionDeltaId)
      .limit(1);
    const objetivo = membresias![0];

    const { data: cambioMembresia, error: errorMembresia } = await coordi
      .from("membresias")
      .update({ activo: false })
      .eq("org_id", fundacionDeltaId)
      .eq("perfil_id", objetivo.perfil_id)
      .select();
    expect(errorMembresia).toBeNull();
    expect(cambioMembresia).toEqual([]);

    const { data: cambioRol, error: errorRol } = await coordi
      .from("roles")
      .update({ permisos: { proyectos: true, equipo: true, finanzas: true, espacios: true, admin: true } })
      .eq("id", objetivo.rol_id)
      .select();
    expect(errorRol).toBeNull();
    expect(cambioRol).toEqual([]);
  });

  it("(2) un miembro raso ve la lista de miembros pero no puede mutarla", async () => {
    const { data: miembros, error } = await raso
      .from("membresias")
      .select("perfil_id")
      .eq("org_id", orgId);
    expect(error).toBeNull();
    expect(miembros).toHaveLength(2);

    const { data: mutacion, error: errorMutacion } = await raso
      .from("membresias")
      .update({ activo: false })
      .eq("org_id", orgId)
      .neq("perfil_id", rasoId)
      .select();
    expect(errorMutacion).toBeNull();
    expect(mutacion).toEqual([]);
  });

  it("(3) desactivar mata el acceso sin borrar historial; reactivar lo restituye", async () => {
    const { error: errorDesactivar } = await admin
      .from("membresias")
      .update({ activo: false })
      .eq("org_id", orgId)
      .eq("perfil_id", rasoId);
    expect(errorDesactivar).toBeNull();

    // La org desaparece para el usuario inactivo…
    const { data: orgs } = await raso.from("organizaciones").select("id").eq("id", orgId);
    expect(orgs).toEqual([]);

    // …y de la lista de miembros solo le queda su propia membresía (fila
    // propia siempre visible: es el historial, no acceso).
    const { data: miembros } = await raso.from("membresias").select("perfil_id").eq("org_id", orgId);
    expect(miembros).toHaveLength(1);
    expect(miembros![0].perfil_id).toBe(rasoId);

    const { error: errorReactivar } = await admin
      .from("membresias")
      .update({ activo: true })
      .eq("org_id", orgId)
      .eq("perfil_id", rasoId);
    expect(errorReactivar).toBeNull();

    const { data: orgsDespues } = await raso.from("organizaciones").select("id").eq("id", orgId);
    expect(orgsDespues).toHaveLength(1);
  });
});
