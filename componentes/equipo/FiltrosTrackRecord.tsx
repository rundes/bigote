import Link from "next/link";

export type Periodo = "mes" | "trimestre" | "historico";

const PERIODOS: { valor: Periodo; etiqueta: string }[] = [
  { valor: "mes", etiqueta: "Mes" },
  { valor: "trimestre", etiqueta: "Trimestre" },
  { valor: "historico", etiqueta: "Histórico" },
];

// Píldora 32px (DESIGN.md §Components): seleccionada con fondo accent al
// 12% + texto accent; sin seleccionar, borde --line y texto secundario.
function claseChip(activo: boolean): string {
  return `flex h-8 shrink-0 items-center whitespace-nowrap rounded-full border px-3 text-sm font-medium transition ${
    activo
      ? "border-transparent bg-acento/12 text-acento"
      : "border-linea text-tinta-suave hover:text-tinta"
  }`;
}

export function FiltrosTrackRecord({
  orgId,
  periodo,
  proyectoId,
  proyectos,
}: {
  orgId: string;
  periodo: Periodo;
  proyectoId: string | null;
  proyectos: { id: string; nombre: string }[];
}) {
  const base = `/o/${orgId}/equipo`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 overflow-x-auto">
        {PERIODOS.map((p) => (
          <Link
            key={p.valor}
            href={`${base}?periodo=${p.valor}${proyectoId ? `&proyecto=${proyectoId}` : ""}`}
            className={claseChip(periodo === p.valor)}
          >
            {p.etiqueta}
          </Link>
        ))}
      </div>

      {proyectos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          <Link href={`${base}?periodo=${periodo}`} className={claseChip(!proyectoId)}>
            Todos
          </Link>
          {proyectos.map((p) => (
            <Link
              key={p.id}
              href={`${base}?periodo=${periodo}&proyecto=${p.id}`}
              className={claseChip(proyectoId === p.id)}
            >
              {p.nombre}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
