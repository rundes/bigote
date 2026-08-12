"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { guardarCobrosConfig } from "@/app/(app)/o/[orgId]/finanzas/cobros/acciones";
import type { CobrosConfig } from "@/lib/cobros-tipos";

export function FormCobros({ orgId, config }: { orgId: string; config: CobrosConfig }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  async function enviar(formData: FormData) {
    setGuardando(true);
    setError(null);
    setGuardado(false);
    const r = await guardarCobrosConfig(orgId, formData);
    setGuardando(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    setGuardado(true);
    router.refresh();
  }

  return (
    <form action={enviar} className="mt-2 rounded-xl border border-linea bg-superficie p-4">
      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
          <label htmlFor="alias" className="text-[13px] text-tinta-suave">
            Alias
          </label>
          <input
            id="alias"
            name="alias"
            defaultValue={config.alias}
            placeholder="nuevatierra.salas"
            className="h-11 rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta focus:border-acento focus:outline-none"
          />
        </div>
        <div className="flex min-w-[14rem] flex-1 flex-col gap-1">
          <label htmlFor="cbu" className="text-[13px] text-tinta-suave">
            CBU (22 dígitos)
          </label>
          <input
            id="cbu"
            name="cbu"
            inputMode="numeric"
            defaultValue={config.cbu}
            className="h-11 rounded-lg border border-linea bg-superficie px-3 font-mono text-sm tabular-nums text-tinta focus:border-acento focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-3">
        <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
          <label htmlFor="titular" className="text-[13px] text-tinta-suave">
            Titular
          </label>
          <input
            id="titular"
            name="titular"
            defaultValue={config.titular}
            className="h-11 rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta focus:border-acento focus:outline-none"
          />
        </div>
        <div className="flex min-w-[9rem] flex-1 flex-col gap-1">
          <label htmlFor="cuit" className="text-[13px] text-tinta-suave">
            CUIT
          </label>
          <input
            id="cuit"
            name="cuit"
            defaultValue={config.cuit}
            className="h-11 rounded-lg border border-linea bg-superficie px-3 font-mono text-sm tabular-nums text-tinta focus:border-acento focus:outline-none"
          />
        </div>
        <div className="flex min-w-[9rem] flex-1 flex-col gap-1">
          <label htmlFor="banco" className="text-[13px] text-tinta-suave">
            Banco
          </label>
          <input
            id="banco"
            name="banco"
            defaultValue={config.banco}
            className="h-11 rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta focus:border-acento focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-1">
        <label htmlFor="instrucciones" className="text-[13px] text-tinta-suave">
          Instrucciones para quien paga
        </label>
        <textarea
          id="instrucciones"
          name="instrucciones"
          rows={2}
          defaultValue={config.instrucciones}
          placeholder="Mandanos el comprobante por WhatsApp al…"
          className="rounded-lg border border-linea bg-superficie px-3 py-2 text-sm text-tinta focus:border-acento focus:outline-none"
        />
      </div>

      <div className="mt-3 flex w-40 flex-col gap-1">
        <label htmlFor="plazo_horas" className="text-[13px] text-tinta-suave">
          Plazo (horas)
        </label>
        <input
          id="plazo_horas"
          name="plazo_horas"
          type="number"
          min={1}
          max={720}
          defaultValue={config.plazo_horas}
          className="h-11 rounded-lg border border-linea bg-superficie px-3 text-sm tabular-nums text-tinta focus:border-acento focus:outline-none"
        />
      </div>

      <label className="mt-4 flex items-start gap-3">
        <input
          type="checkbox"
          name="activo"
          defaultChecked={config.activo}
          className="mt-1 size-4 accent-[var(--color-acento)]"
        />
        <span>
          <span className="block text-sm font-medium text-tinta">
            Exigir pago antes de confirmar
          </span>
          <span className="block text-xs text-tinta-suave">
            Aplica solo a los planes marcados como &ldquo;requiere pago previo&rdquo;. Con
            esto apagado, las reservas se confirman al momento como hasta ahora.
          </span>
        </span>
      </label>

      {error && <p className="mt-3 text-sm text-peligro">{error}</p>}
      {guardado && <p className="mt-3 text-sm text-ok">Guardado.</p>}

      <button
        type="submit"
        disabled={guardando}
        className="mt-4 h-11 rounded-lg bg-acento px-4 text-sm font-medium text-acento-tinta disabled:opacity-60"
      >
        {guardando ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
