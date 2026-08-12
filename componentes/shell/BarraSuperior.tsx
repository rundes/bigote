import { LogOut } from "lucide-react";
import { Isotipo } from "@/componentes/marca/Logo";
import { SwitcherOrg } from "@/componentes/shell/SwitcherOrg";
import type { ContextoOrg } from "@/lib/org";

export function BarraSuperior({
  orgId,
  contexto,
  orgs,
}: {
  orgId: string;
  contexto: ContextoOrg;
  orgs: { id: string; nombre: string }[];
}) {
  return (
    <header className="flex h-14 items-center gap-2 bg-marca px-3 lg:hidden">
      {/* En mobile solo entra el isotipo; el wordmark se reserva para sidebar e ingreso. */}
      <span className="text-[11px] text-amarillo">
        <Isotipo />
      </span>
      <span className="sr-only">Centro Nueva Tierra</span>

      <div className="min-w-0 flex-1">
        <SwitcherOrg orgId={orgId} nombreOrg={contexto.org.nombre} orgs={orgs} />
      </div>

      <form action="/auth/salir" method="POST">
        <button
          type="submit"
          aria-label="Salir"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-marca-suave transition hover:bg-marca-tinta/12 hover:text-marca-tinta"
        >
          <LogOut size={20} strokeWidth={1.75} />
        </button>
      </form>
    </header>
  );
}
