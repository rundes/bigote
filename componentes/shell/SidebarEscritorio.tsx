"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { Logo } from "@/componentes/marca/Logo";
import { SwitcherOrg } from "@/componentes/shell/SwitcherOrg";
import { ITEMS_NAV } from "@/lib/nav";
import type { ContextoOrg } from "@/lib/org";

export function SidebarEscritorio({
  orgId,
  contexto,
  orgs,
}: {
  orgId: string;
  contexto: ContextoOrg;
  orgs: { id: string; nombre: string }[];
}) {
  const pathname = usePathname();
  const visibles = ITEMS_NAV.filter(
    (item) => item.permiso === null || contexto.permisos[item.permiso]
  );

  return (
    <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-60 lg:flex-col lg:bg-marca lg:px-3 lg:py-4">
      {/* Lockup institucional: amarillo sobre naranja, como en nuevatierra.org.ar */}
      <div className="px-2 pb-4 pt-1">
        <Logo className="text-[12px] text-amarillo" />
      </div>

      <div className="border-t border-marca-linea px-2 pt-3">
        <SwitcherOrg orgId={orgId} nombreOrg={contexto.org.nombre} orgs={orgs} />
      </div>

      <nav className="mt-3 flex flex-1 flex-col gap-1">
        {visibles.map(({ href, etiqueta, icono: Icon }) => {
          const destino = href(orgId);
          const activo = pathname === destino;
          return (
            <Link
              key={destino}
              href={destino}
              aria-current={activo ? "page" : undefined}
              className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${
                activo
                  ? "bg-amarillo font-semibold text-tinta"
                  : "text-marca-suave hover:bg-marca-tinta/12 hover:text-marca-tinta"
              }`}
            >
              <Icon size={20} strokeWidth={1.75} />
              {etiqueta}
            </Link>
          );
        })}
      </nav>

      <form action="/auth/salir" method="POST" className="px-2">
        <button
          type="submit"
          className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-marca-suave transition hover:bg-marca-tinta/12 hover:text-marca-tinta"
        >
          <LogOut size={20} strokeWidth={1.75} />
          Salir
        </button>
      </form>
    </aside>
  );
}
