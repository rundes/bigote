"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { cancelarReserva } from "@/app/(app)/o/[orgId]/espacios/acciones";
import { useToast } from "@/componentes/ui/Toast";

export function SheetCancelar({
  orgId,
  reservaId,
  descripcion,
  onCerrar,
}: {
  orgId: string;
  reservaId: string;
  descripcion: string;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enCurso, setEnCurso] = useState(false);

  useEffect(() => {
    function alTeclado(evento: KeyboardEvent) {
      if (evento.key === "Escape") onCerrar();
    }
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, [onCerrar]);

  async function confirmar() {
    if (!motivo.trim()) {
      setError("Contanos por qué la cancelás.");
      return;
    }
    setEnCurso(true);
    setError(null);
    const resultado = await cancelarReserva(orgId, reservaId, motivo.trim());
    setEnCurso(false);
    if (resultado.error) {
      setError(resultado.error);
      return;
    }
    mostrar("Reserva cancelada.");
    onCerrar();
    router.refresh();
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-tinta/20" onClick={onCerrar} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cancelar reserva"
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-xl border-t border-linea bg-superficie p-4 pb-6 lg:inset-y-0 lg:left-auto lg:right-0 lg:h-full lg:max-h-none lg:w-[420px] lg:rounded-none lg:border-l lg:border-t-0"
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-tinta">Cancelar la reserva</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-11 w-11 items-center justify-center text-tinta-suave hover:text-tinta"
          >
            <X size={20} strokeWidth={1.75} />
          </button>
        </div>
        <p className="mb-4 text-sm text-tinta-suave">{descripcion}</p>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="motivo-cancelacion" className="text-[13px] text-tinta-suave">
              Motivo
            </label>
            <textarea
              id="motivo-cancelacion"
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              autoFocus
              placeholder="Contanos por qué la cancelás"
              className="w-full rounded-lg border border-linea bg-superficie px-3 py-2 text-sm text-tinta placeholder:text-tinta-suave focus:border-acento focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={confirmar}
            disabled={enCurso}
            className="h-11 w-full rounded-lg bg-peligro text-sm font-medium text-acento-tinta transition hover:opacity-90 disabled:opacity-60"
          >
            {enCurso ? "Cancelando…" : "Cancelá la reserva"}
          </button>

          {error && <p className="text-sm text-peligro">{error}</p>}
        </div>
      </div>
    </>
  );
}
