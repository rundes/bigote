"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

/*
  Vive siempre dentro del chrome de marca (sidebar y barra superior), así que
  el disparador se pinta sobre naranja. El desplegable es un popover y se
  queda en superficie clara.
*/
export function SwitcherOrg({
  orgId,
  nombreOrg,
  orgs,
}: {
  orgId: string;
  nombreOrg: string;
  orgs: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    document.cookie = `ultima_org=${orgId}; path=/; max-age=31536000`;
  }, [orgId]);

  if (orgs.length <= 1) {
    return (
      <span className="block truncate text-sm font-semibold text-marca-tinta">{nombreOrg}</span>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex h-11 w-full items-center gap-1 rounded-lg px-2 text-sm font-semibold text-marca-tinta transition hover:bg-marca-tinta/12"
      >
        <span className="truncate">{nombreOrg}</span>
        <ChevronDown
          size={20}
          strokeWidth={1.75}
          className={`shrink-0 transition-transform ${abierto ? "rotate-180" : ""}`}
        />
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAbierto(false)} />
          <ul className="absolute left-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-xl border border-linea bg-superficie shadow-sm">
            {orgs.map((org) => (
              <li key={org.id}>
                <button
                  type="button"
                  onClick={() => {
                    setAbierto(false);
                    router.push(`/o/${org.id}`);
                  }}
                  className={`flex h-11 w-full items-center px-3 text-left text-sm transition hover:bg-panel ${
                    org.id === orgId ? "font-semibold text-acento" : "text-tinta"
                  }`}
                >
                  {org.nombre}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
