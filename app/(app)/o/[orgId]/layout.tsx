import { redirect } from "next/navigation";
import { obtenerContextoOrg, listarMisOrgs } from "@/lib/org";
import { BarraSuperior } from "@/componentes/shell/BarraSuperior";
import { SidebarEscritorio } from "@/componentes/shell/SidebarEscritorio";
import { NavInferior } from "@/componentes/shell/NavInferior";

export default async function LayoutOrg({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto) redirect("/");

  const orgs = await listarMisOrgs();

  return (
    <div className="min-h-screen bg-fondo">
      <SidebarEscritorio orgId={orgId} contexto={contexto} orgs={orgs} />
      <div className="flex min-h-screen flex-col lg:pl-60">
        <BarraSuperior orgId={orgId} contexto={contexto} orgs={orgs} />
        <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 pb-24 pt-6 lg:px-6 lg:pb-10">
          {children}
        </main>
      </div>
      <NavInferior orgId={orgId} contexto={contexto} />
    </div>
  );
}
