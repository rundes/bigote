import Link from "next/link";
import { redirect } from "next/navigation";
import { Boxes, Building2, MapPin, Send, ShieldCheck, UserRound, Users, Wallet } from "lucide-react";
import { obtenerContextoOrg } from "@/lib/org";
import { crearClienteServidor } from "@/lib/supabase/server";
import { APP_VERSION } from "@/lib/version";

export default async function PaginaMas({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto) redirect("/");

  // La consola de plataforma no tiene entrada en la navegación: sin este
  // enlace hay que saberse la URL de memoria.
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: superAdmin } = user
    ? await supabase
        .from("super_admins")
        .select("perfil_id")
        .eq("perfil_id", user.id)
        .maybeSingle()
    : { data: null };

  const claseItem = "flex h-11 items-center gap-3 text-sm font-medium text-tinta";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-tinta">Más</h1>

      <div className="flex flex-col">
        <Link href={`/o/${orgId}/mas/perfil`} className={claseItem}>
          <UserRound size={20} strokeWidth={1.75} />
          Perfil y avisos
        </Link>
        <Link href={`/o/${orgId}/equipo`} className={claseItem}>
          <Users size={20} strokeWidth={1.75} />
          Equipo
        </Link>
        {contexto.permisos.admin && (
          <Link href={`/o/${orgId}/roles`} className={claseItem}>
            <ShieldCheck size={20} strokeWidth={1.75} />
            Roles y permisos
          </Link>
        )}
      </div>

      {contexto.permisos.inventario && (
        <div className="flex flex-col">
          <p className="mb-1 text-[13px] text-tinta-suave">Inventario</p>
          <Link href={`/o/${orgId}/inventario`} className={claseItem}>
            <Boxes size={20} strokeWidth={1.75} />
            Ver inventario
          </Link>
          <Link href={`/o/${orgId}/inventario/paquetes`} className={claseItem}>
            <Send size={20} strokeWidth={1.75} />
            Paquetes y despachos
          </Link>
          <Link href={`/o/${orgId}/inventario/ubicaciones`} className={claseItem}>
            <MapPin size={20} strokeWidth={1.75} />
            Ubicaciones
          </Link>
        </div>
      )}

      {contexto.permisos.finanzas && (
        <div className="flex flex-col">
          <p className="mb-1 text-[13px] text-tinta-suave">Finanzas</p>
          <Link href={`/o/${orgId}/finanzas/cobros`} className={claseItem}>
            <Wallet size={20} strokeWidth={1.75} />
            Cobros y datos de cuenta
          </Link>
        </div>
      )}

      {superAdmin && (
        <div className="flex flex-col">
          <p className="mb-1 text-[13px] text-tinta-suave">Plataforma</p>
          <Link href="/plataforma" className={claseItem}>
            <Building2 size={20} strokeWidth={1.75} />
            Organizaciones
          </Link>
        </div>
      )}

      <p className="text-xs text-tinta-suave">bigote v{APP_VERSION}</p>
    </div>
  );
}
