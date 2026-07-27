"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun, ListChecks, DoorOpen, Wallet, Menu, LogOut } from "lucide-react";
import { SwitcherOrg } from "@/componentes/shell/SwitcherOrg";
import type { ContextoOrg, Permisos } from "@/lib/org";

const ITEMS: {
  href: string;
  label: string;
  Icon: typeof Sun;
  permiso: keyof Permisos | null;
}[] = [
  { href: "", label: "Hoy", Icon: Sun, permiso: null },
  { href: "/tareas", label: "Tareas", Icon: ListChecks, permiso: "proyectos" },
  { href: "/espacios", label: "Espacios", Icon: DoorOpen, permiso: null },
  { href: "/finanzas", label: "Finanzas", Icon: Wallet, permiso: "finanzas" },
  { href: "/mas", label: "Más", Icon: Menu, permiso: null },
];

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
  const base = `/o/${orgId}`;
  const visibles = ITEMS.filter((item) => !item.permiso || contexto.permisos[item.permiso]);

  return (
    <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-60 lg:flex-col lg:border-r lg:border-linea lg:bg-panel lg:px-3 lg:py-4">
      <div className="px-2 py-2">
        <SwitcherOrg orgId={orgId} nombreOrg={contexto.org.nombre} orgs={orgs} />
      </div>

      <nav className="mt-4 flex flex-1 flex-col gap-1">
        {visibles.map(({ href, label, Icon }) => {
          const destino = `${base}${href}`;
          const activo = pathname === destino;
          return (
            <Link
              key={href}
              href={destino}
              className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${
                activo ? "text-acento" : "text-tinta hover:bg-linea/40"
              }`}
            >
              <Icon size={20} strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}
      </nav>

      <form action="/auth/salir" method="POST" className="px-2">
        <button
          type="submit"
          className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-tinta-suave transition hover:bg-linea/40 hover:text-tinta"
        >
          <LogOut size={20} strokeWidth={1.75} />
          Salir
        </button>
      </form>
    </aside>
  );
}
