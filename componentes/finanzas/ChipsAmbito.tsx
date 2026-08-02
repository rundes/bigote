import Link from "next/link";

export function ChipsAmbito({
  orgId,
  mes,
  ambito,
  edificios,
}: {
  orgId: string;
  mes: string;
  ambito: string;
  edificios: { id: string; nombre: string }[];
}) {
  const chips = [
    { valor: "todo", etiqueta: "Todo" },
    { valor: "entidad", etiqueta: "Entidad" },
    ...edificios.map((e) => ({ valor: e.id, etiqueta: e.nombre })),
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <Link
          key={chip.valor}
          href={`/o/${orgId}/finanzas?mes=${mes}&ambito=${chip.valor}`}
          aria-current={chip.valor === ambito ? "true" : undefined}
          className={`flex h-8 items-center rounded-full px-3 text-sm transition ${
            chip.valor === ambito
              ? "bg-acento/10 font-medium text-acento"
              : "border border-linea text-tinta-suave hover:text-tinta"
          }`}
        >
          {chip.etiqueta}
        </Link>
      ))}
    </div>
  );
}
