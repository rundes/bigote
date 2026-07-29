import { LogOut } from "lucide-react";
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
    <header className="flex h-14 items-center justify-between border-b border-linea bg-panel px-4 lg:hidden">
      <SwitcherOrg orgId={orgId} nombreOrg={contexto.org.nombre} orgs={orgs} />
      <form action="/auth/salir" method="POST">
        <button
          type="submit"
          aria-label="Salir"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-tinta-suave transition hover:bg-linea/40 hover:text-tinta"
        >
          <LogOut size={20} strokeWidth={1.75} />
        </button>
      </form>
    </header>
  );
}
