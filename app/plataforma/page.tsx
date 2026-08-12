import Link from "next/link";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { FormCrearOrg } from "./FormCrearOrg";
import { FilaOrg, type ResumenOrg } from "./FilaOrg";

export default async function PaginaPlataforma() {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: superAdmin } = await supabase
    .from("super_admins")
    .select("perfil_id")
    .eq("perfil_id", user.id)
    .maybeSingle();
  if (!superAdmin) redirect("/");

  // El listado de orgs sí lo permite RLS al super-admin (organizaciones_select
  // tiene la rama es_super_admin()), así que usamos el cliente de sesión acá.
  // Los conteos de miembros necesitan el cliente admin: un super-admin no es
  // necesariamente miembro de esas orgs, y membresias_select no lo deja ver
  // filas de orgs ajenas.
  const { data: orgs } = await supabase
    .from("organizaciones")
    .select("id, nombre, tipo, created_at")
    .order("created_at", { ascending: false });
  const admin = crearClienteAdmin();
  const [{ data: membresias }, { data: proyectos }, { data: edificios }, { data: articulos }] =
    await Promise.all([
      admin.from("membresias").select("org_id").eq("activo", true),
      admin.from("proyectos").select("org_id"),
      admin.from("edificios").select("org_propietaria_id"),
      admin.from("inventario_articulos").select("org_id"),
    ]);

  function contar(filas: { org_id: string }[] | null): Map<string, number> {
    const m = new Map<string, number>();
    for (const f of filas ?? []) m.set(f.org_id, (m.get(f.org_id) ?? 0) + 1);
    return m;
  }
  const conteos = contar(membresias);
  const porProyectos = contar(proyectos);
  const porArticulos = contar(articulos);
  const porEdificios = new Map<string, number>();
  for (const e of (edificios ?? []) as { org_propietaria_id: string }[]) {
    porEdificios.set(e.org_propietaria_id, (porEdificios.get(e.org_propietaria_id) ?? 0) + 1);
  }

  const resumenes: ResumenOrg[] = (orgs ?? []).map((o) => ({
    id: o.id,
    nombre: o.nombre,
    tipo: o.tipo,
    miembros: conteos.get(o.id) ?? 0,
    proyectos: porProyectos.get(o.id) ?? 0,
    edificios: porEdificios.get(o.id) ?? 0,
    articulos: porArticulos.get(o.id) ?? 0,
  }));

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-8 px-4 py-10">
      <div>
        <Link href="/" className="text-sm text-tinta-suave underline decoration-linea underline-offset-4 hover:text-acento">
          ← Volver
        </Link>
        <h1 className="mt-4 text-xl font-semibold text-tinta">Panel de plataforma</h1>
        <p className="mt-1 text-sm text-tinta-suave">
          Creá organizaciones nuevas e invitá a su primer admin.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-tinta-suave">Organizaciones</h2>
        {resumenes.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {resumenes.map((org) => (
              <FilaOrg key={org.id} org={org} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-tinta-suave">Todavía no hay organizaciones.</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-tinta-suave">Nueva organización</h2>
        <FormCrearOrg />
      </section>
    </main>
  );
}
