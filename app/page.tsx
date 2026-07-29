import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { obtenerContextoOrg, listarMisOrgs } from "@/lib/org";

export default async function Home() {
  const cookieStore = await cookies();
  const ultimaOrg = cookieStore.get("ultima_org")?.value;

  if (ultimaOrg) {
    const contexto = await obtenerContextoOrg(ultimaOrg);
    if (contexto) redirect(`/o/${ultimaOrg}`);
  }

  const orgs = await listarMisOrgs();
  if (orgs.length === 0) redirect("/sin-organizacion");
  redirect(`/o/${orgs[0].id}`);
}
