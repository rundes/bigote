import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, UserRound, Users } from "lucide-react";
import { obtenerContextoOrg } from "@/lib/org";
import { APP_VERSION } from "@/lib/version";

export default async function PaginaMas({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto) redirect("/");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-tinta">Más</h1>

      <div className="flex flex-col">
        <Link
          href={`/o/${orgId}/mas/perfil`}
          className="flex h-11 items-center gap-3 text-sm font-medium text-tinta"
        >
          <UserRound size={20} strokeWidth={1.75} />
          Perfil y avisos
        </Link>
        <Link
          href={`/o/${orgId}/equipo`}
          className="flex h-11 items-center gap-3 text-sm font-medium text-tinta"
        >
          <Users size={20} strokeWidth={1.75} />
          Equipo
        </Link>
        {contexto.permisos.admin && (
          <Link
            href={`/o/${orgId}/roles`}
            className="flex h-11 items-center gap-3 text-sm font-medium text-tinta"
          >
            <ShieldCheck size={20} strokeWidth={1.75} />
            Roles y permisos
          </Link>
        )}
      </div>

      <p className="text-xs text-tinta-suave">bigote v{APP_VERSION}</p>
    </div>
  );
}
