import Link from "next/link";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { FormCrearOrg } from "./FormCrearOrg";

const ETIQUETAS_TIPO: Record<string, string> = {
  empresa: "Empresa",
  asociacion_civil: "Asociación civil",
  otro: "Otro",
};

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

  // Listado con visibilidad cruzada de orgs: el cliente admin evita las
  // restricciones de RLS sobre membresías (un super-admin no es
  // necesariamente miembro de todas las orgs que administra la plataforma).
  const admin = crearClienteAdmin();
  const { data: orgs } = await admin
    .from("organizaciones")
    .select("id, nombre, tipo, created_at")
    .order("created_at", { ascending: false });
  const { data: membresias } = await admin
    .from("membresias")
    .select("org_id")
    .eq("activo", true);

  const conteos = new Map<string, number>();
  for (const m of membresias ?? []) {
    conteos.set(m.org_id, (conteos.get(m.org_id) ?? 0) + 1);
  }

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
        {orgs && orgs.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {orgs.map((org) => (
              <li
                key={org.id}
                className="flex items-center justify-between rounded-lg border border-linea bg-superficie px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-tinta">{org.nombre}</p>
                  <p className="text-xs text-tinta-suave">
                    {ETIQUETAS_TIPO[org.tipo] ?? org.tipo}
                  </p>
                </div>
                <span className="text-xs text-tinta-suave">
                  {conteos.get(org.id) ?? 0} miembro{(conteos.get(org.id) ?? 0) === 1 ? "" : "s"}
                </span>
              </li>
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
