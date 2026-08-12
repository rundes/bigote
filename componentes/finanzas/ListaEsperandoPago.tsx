"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Check } from "lucide-react";
import {
  registrarPago,
  pedirSubidaComprobante,
} from "@/app/(app)/o/[orgId]/finanzas/cobros/acciones";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { horasParaVencer, type ReservaEsperandoPago } from "@/lib/cobros-tipos";

const pesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export function ListaEsperandoPago({
  orgId,
  reservas,
}: {
  orgId: string;
  reservas: ReservaEsperandoPago[];
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Comprobante ya subido por reserva, listo para viajar con el pago.
  const [adjuntos, setAdjuntos] = useState<Record<string, string>>({});
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  async function subir(reservaId: string, file: File) {
    setOcupado(reservaId);
    setError(null);

    const ext = file.name.split(".").pop() ?? "";
    const permiso = await pedirSubidaComprobante(orgId, reservaId, ext);
    if (permiso.error || !permiso.path || !permiso.token) {
      setOcupado(null);
      setError(permiso.error ?? "No pudimos preparar la subida.");
      return;
    }

    // El archivo va directo del navegador al storage con el token firmado:
    // no pasa por el servidor de Next.
    const supabase = crearClienteNavegador();
    const { error: errorSubida } = await supabase.storage
      .from("comprobantes")
      .uploadToSignedUrl(permiso.path, permiso.token, file);

    setOcupado(null);
    if (errorSubida) {
      setError("No pudimos subir el comprobante.");
      return;
    }
    setAdjuntos((prev) => ({ ...prev, [reservaId]: permiso.path! }));
  }

  async function registrar(r: ReservaEsperandoPago) {
    setOcupado(r.id);
    setError(null);
    const res = await registrarPago(orgId, r.id, r.costo, adjuntos[r.id] ?? null);
    setOcupado(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  if (reservas.length === 0) {
    return <p className="mt-2 text-sm text-tinta-suave">Ninguna reserva está esperando pago.</p>;
  }

  return (
    <>
      <div className="mt-2 divide-y divide-linea border-y border-linea">
        {reservas.map((r) => {
          const horas = horasParaVencer(r.vence_at);
          const urgente = horas <= 6;
          const adjunto = adjuntos[r.id];
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="min-w-0 flex-1 basis-48">
                <span className="block truncate text-sm font-medium text-tinta">{r.quien}</span>
                <span className="block text-xs text-tinta-suave">
                  {r.sala_nombre} ·{" "}
                  {new Date(`${r.fecha}T00:00:00`).toLocaleDateString("es-AR", {
                    weekday: "short",
                    day: "2-digit",
                    month: "2-digit",
                  })}{" "}
                  {r.hora_inicio}:00 · {r.horas} h
                </span>
                <span
                  className={`block text-xs ${urgente ? "font-medium text-peligro" : "text-tinta-suave"}`}
                >
                  {horas <= 0 ? "vence en minutos" : `vence en ${horas} h`}
                </span>
              </span>

              <span className="shrink-0 text-sm font-semibold tabular-nums text-tinta">
                {pesos.format(r.costo)}
              </span>

              <input
                ref={(el) => {
                  inputs.current[r.id] = el;
                }}
                type="file"
                accept=".pdf,image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) subir(r.id, f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={ocupado !== null}
                onClick={() => inputs.current[r.id]?.click()}
                className={`flex h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm transition disabled:opacity-60 ${
                  adjunto
                    ? "border-ok/40 text-ok"
                    : "border-linea text-tinta-suave hover:text-tinta"
                }`}
              >
                {adjunto ? (
                  <>
                    <Check size={16} strokeWidth={2} />
                    Adjunto
                  </>
                ) : (
                  <>
                    <Paperclip size={16} strokeWidth={1.75} />
                    Comprobante
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={ocupado !== null}
                onClick={() => registrar(r)}
                className="h-11 shrink-0 rounded-lg bg-acento px-4 text-sm font-medium text-acento-tinta transition hover:opacity-90 disabled:opacity-60"
              >
                {ocupado === r.id ? "Guardando…" : "Registrar pago"}
              </button>
            </div>
          );
        })}
      </div>
      {error && <p className="mt-3 text-sm text-peligro">{error}</p>}
    </>
  );
}
