"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ITEMS_NAV } from "@/lib/nav";
import type { ContextoOrg } from "@/lib/org";

export function NavInferior({ orgId, contexto }: { orgId: string; contexto: ContextoOrg }) {
  const pathname = usePathname();
  const visibles = ITEMS_NAV.filter(
    (item) =>
      !item.soloEscritorio &&
      (item.permiso === null || contexto.permisos[item.permiso])
  );

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch bg-marca lg:hidden">
      {visibles.map(({ href, etiqueta, icono: Icon }) => {
        const destino = href(orgId);
        const activo = pathname === destino;
        return (
          <Link
            key={destino}
            href={destino}
            aria-current={activo ? "page" : undefined}
            className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium transition ${
              activo ? "text-amarillo" : "text-marca-suave"
            }`}
          >
            {/* No hay lugar para la píldora del sidebar; el activo se marca con
                una barra amarilla arriba, misma señal de color. */}
            {activo && (
              <span
                aria-hidden="true"
                className="absolute inset-x-3 top-0 h-0.5 rounded-b-full bg-amarillo"
              />
            )}
            <Icon size={20} strokeWidth={1.75} />
            {etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
