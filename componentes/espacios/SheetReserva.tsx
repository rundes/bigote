"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import type { Plan, Sala } from "@/lib/espacios";
import { crearReserva, crearClienteRapido } from "@/app/(app)/o/[orgId]/espacios/acciones";
import { useToast } from "@/componentes/ui/Toast";

export type Cliente = { id: string; nombre: string; contacto: string | null };

type Estado = { error?: string } | null;

const pesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export function formatearHora(h: number): string {
  return `${h}:00`;
}

export function SheetReserva({
  orgId,
  orgPropietariaId,
  sala,
  fecha,
  horaInicial,
  planes,
  clientes,
  onCerrar,
}: {
  orgId: string;
  orgPropietariaId: string;
  sala: Sala;
  fecha: string;
  horaInicial: number;
  planes: Plan[];
  clientes: Cliente[];
  onCerrar: () => void;
}) {
  const router = useRouter();
  const { mostrar } = useToast();

  const planesAplicables = useMemo(
    () => planes.filter((p) => !(p.solo_salas_publicas && sala.tipo === "privada")),
    [planes, sala.tipo]
  );

  const [inicio, setInicio] = useState(horaInicial);
  const [horas, setHoras] = useState(1);
  const [planId, setPlanId] = useState(planesAplicables[0]?.id ?? "");
  const [paraOtra, setParaOtra] = useState(false);
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [creandoCliente, setCreandoCliente] = useState(false);
  const [errorCliente, setErrorCliente] = useState<string | null>(null);

  const plan = planesAplicables.find((p) => p.id === planId);
  const costo = plan && !plan.gratuito ? plan.precio_hora * horas : 0;
  const duracionMaxima = 22 - inicio;

  const clientesFiltrados = useMemo(() => {
    const q = busquedaCliente.trim().toLowerCase();
    if (!q) return clientes.slice(0, 6);
    return clientes.filter((c) => c.nombre.toLowerCase().includes(q)).slice(0, 6);
  }, [clientes, busquedaCliente]);

  const clienteElegido = clientes.find((c) => c.id === clienteId) ?? null;

  async function accion(_previo: Estado, formData: FormData): Promise<Estado> {
    if (paraOtra && !formData.get("cliente")) {
      return { error: "Elegí para quién es la reserva (o agregala como cliente)." };
    }
    const resultado = await crearReserva(orgId, formData);
    if (resultado.error) return resultado;
    mostrar(`Reservaste ${sala.nombre} · ${formatearHora(inicio)} h`);
    onCerrar();
    router.refresh();
    return null;
  }

  const [estado, enviarAccion, enCurso] = useActionState(accion, null);

  useEffect(() => {
    function alTeclado(evento: KeyboardEvent) {
      if (evento.key === "Escape") onCerrar();
    }
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, [onCerrar]);

  async function agregarCliente() {
    setCreandoCliente(true);
    setErrorCliente(null);
    const resultado = await crearClienteRapido(orgId, orgPropietariaId, busquedaCliente, "");
    setCreandoCliente(false);
    if (resultado.error || !resultado.id) {
      setErrorCliente(resultado.error ?? "No pudimos crear el cliente.");
      return;
    }
    setClienteId(resultado.id);
    router.refresh();
  }

  const [y, m, d] = fecha.split("-").map(Number);
  const fechaLegible = new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));

  return (
    <>
      <div className="fixed inset-0 z-40 bg-tinta/20" onClick={onCerrar} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Reservar ${sala.nombre}`}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-xl border-t border-linea bg-superficie p-4 pb-6 lg:inset-y-0 lg:left-auto lg:right-0 lg:h-full lg:max-h-none lg:w-[420px] lg:rounded-none lg:border-l lg:border-t-0"
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-tinta">{sala.nombre}</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-11 w-11 items-center justify-center text-tinta-suave hover:text-tinta"
          >
            <X size={20} strokeWidth={1.75} />
          </button>
        </div>
        <p className="mb-4 text-sm text-tinta-suave first-letter:uppercase">{fechaLegible}</p>

        <form action={enviarAccion} className="flex flex-col gap-4">
          <input type="hidden" name="sala" value={sala.id} />
          <input type="hidden" name="fecha" value={fecha} />

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="reserva-inicio" className="text-[13px] text-tinta-suave">
                Empieza
              </label>
              <select
                id="reserva-inicio"
                name="hora_inicio"
                value={inicio}
                onChange={(e) => {
                  const nueva = Number(e.target.value);
                  setInicio(nueva);
                  if (nueva + horas > 22) setHoras(22 - nueva);
                }}
                className="h-11 w-full rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta focus:border-acento focus:outline-none"
              >
                {Array.from({ length: 14 }, (_, i) => 8 + i).map((h) => (
                  <option key={h} value={h}>
                    {formatearHora(h)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="reserva-horas" className="text-[13px] text-tinta-suave">
                Duración
              </label>
              <select
                id="reserva-horas"
                name="horas"
                value={horas}
                onChange={(e) => setHoras(Number(e.target.value))}
                className="h-11 w-full rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta focus:border-acento focus:outline-none"
              >
                {Array.from({ length: duracionMaxima }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? "hora" : "horas"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="reserva-plan" className="text-[13px] text-tinta-suave">
              Plan
            </label>
            <select
              id="reserva-plan"
              name="plan"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="h-11 w-full rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta focus:border-acento focus:outline-none"
            >
              {planesAplicables.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} · {p.gratuito ? "Gratis" : `${pesos.format(p.precio_hora)}/h`}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[13px] text-tinta-suave">Para quién</span>
            <div className="flex rounded-lg border border-linea p-1" role="radiogroup" aria-label="Para quién es la reserva">
              {[
                { valor: false, etiqueta: "Para mí" },
                { valor: true, etiqueta: "Para otra persona" },
              ].map((opcion) => (
                <button
                  key={String(opcion.valor)}
                  type="button"
                  role="radio"
                  aria-checked={paraOtra === opcion.valor}
                  onClick={() => {
                    setParaOtra(opcion.valor);
                    if (!opcion.valor) setClienteId(null);
                  }}
                  className={`h-9 flex-1 rounded-md text-sm font-medium transition ${
                    paraOtra === opcion.valor
                      ? "bg-acento/10 text-acento"
                      : "text-tinta-suave hover:text-tinta"
                  }`}
                >
                  {opcion.etiqueta}
                </button>
              ))}
            </div>

            {paraOtra && (
              <div className="flex flex-col gap-2">
                <input type="hidden" name="cliente" value={clienteId ?? ""} />
                {clienteElegido ? (
                  <div className="flex h-11 items-center justify-between rounded-lg border border-acento bg-acento/10 px-3 text-sm text-tinta">
                    <span>{clienteElegido.nombre}</span>
                    <button
                      type="button"
                      onClick={() => setClienteId(null)}
                      aria-label="Cambiar cliente"
                      className="text-tinta-suave hover:text-tinta"
                    >
                      <X size={16} strokeWidth={1.75} />
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={busquedaCliente}
                      onChange={(e) => setBusquedaCliente(e.target.value)}
                      placeholder="Buscá el cliente por nombre"
                      aria-label="Buscá el cliente por nombre"
                      className="h-11 w-full rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta placeholder:text-tinta-suave focus:border-acento focus:outline-none"
                    />
                    <div className="flex flex-col overflow-hidden rounded-lg border border-linea">
                      {clientesFiltrados.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setClienteId(c.id)}
                          className="flex min-h-11 flex-col items-start justify-center border-b border-linea px-3 py-1.5 text-left text-sm text-tinta transition last:border-b-0 hover:bg-fondo"
                        >
                          {c.nombre}
                          {c.contacto && (
                            <span className="text-xs text-tinta-suave">{c.contacto}</span>
                          )}
                        </button>
                      ))}
                      {busquedaCliente.trim() && (
                        <button
                          type="button"
                          onClick={agregarCliente}
                          disabled={creandoCliente}
                          className="min-h-11 px-3 py-1.5 text-left text-sm font-medium text-acento transition hover:bg-fondo disabled:opacity-60"
                        >
                          {creandoCliente
                            ? "Agregando…"
                            : `Agregá a “${busquedaCliente.trim()}” como cliente`}
                        </button>
                      )}
                      {clientesFiltrados.length === 0 && !busquedaCliente.trim() && (
                        <p className="px-3 py-2 text-sm text-tinta-suave">
                          Escribí un nombre para buscar o agregar.
                        </p>
                      )}
                    </div>
                    {errorCliente && <p className="text-sm text-peligro">{errorCliente}</p>}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-baseline justify-between rounded-lg bg-fondo px-3 py-2.5">
            <span className="text-sm text-tinta-suave">Costo estimado</span>
            <span className="text-lg font-semibold tabular-nums text-tinta">
              {costo === 0 ? "Gratis" : pesos.format(costo)}
            </span>
          </div>
          <p className="-mt-2 text-xs text-tinta-suave">
            El costo final lo calcula el sistema al confirmar.
          </p>

          <button
            type="submit"
            disabled={enCurso || planesAplicables.length === 0}
            className="h-11 w-full rounded-lg bg-acento text-sm font-medium text-acento-tinta transition hover:opacity-90 disabled:opacity-60"
          >
            {enCurso ? "Reservando…" : "Confirmá la reserva"}
          </button>

          {planesAplicables.length === 0 && (
            <p className="text-sm text-tinta-suave">No hay planes que apliquen a esta sala.</p>
          )}
          {estado?.error && <p className="text-sm text-peligro">{estado.error}</p>}
        </form>
      </div>
    </>
  );
}
