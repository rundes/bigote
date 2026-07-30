export type FilaTrackRecord = {
  perfil_id: string;
  nombre: string;
  completadas: number;
  dificultad_total: number;
  dificultad_promedio: number;
};

export function TarjetaPersona({ persona }: { persona: FilaTrackRecord }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-linea py-3 last:border-b-0">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm text-tinta">{persona.nombre}</span>
        <span className="text-xs text-tinta-suave">
          dificultad {persona.dificultad_total} · promedio {persona.dificultad_promedio}
        </span>
      </div>
      <span className="shrink-0 text-2xl font-semibold tabular-nums text-tinta">
        {persona.completadas}
      </span>
    </div>
  );
}
