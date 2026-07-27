"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun, ListChecks, DoorOpen, Wallet, Menu } from "lucide-react";
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

export function NavInferior({ orgId, contexto }: { orgId: string; contexto: ContextoOrg }) {
  const pathname = usePathname();
  const base = `/o/${orgId}`;
  const visibles = ITEMS.filter((item) => !item.permiso || contexto.permisos[item.permiso]);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch border-t border-linea bg-panel lg:hidden">
      {visibles.map(({ href, label, Icon }) => {
        const destino = `${base}${href}`;
        const activo = pathname === destino;
        return (
          <Link
            key={href}
            href={destino}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium ${
              activo ? "text-acento" : "text-tinta-suave"
            }`}
          >
            <Icon size={20} strokeWidth={1.75} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
