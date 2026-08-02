"use client";

import { useState } from "react";
import type { Plan, ReservaDia, Sala } from "@/lib/espacios";
import { SheetReserva, formatearHora, type Cliente } from "@/componentes/espacios/SheetReserva";

const HORAS = Array.from({ length: 14 }, (_, i) => 8 + i);

type Franja = { sala: Sala; hora: number };

function reservaEn(reservas: ReservaDia[], salaId: string, hora: number): ReservaDia | undefined {
  return reservas.find(
    (r) => r.sala_id === salaId && hora >= r.hora_inicio && hora < r.hora_inicio + r.horas
  );
}

function CeldaOcupada({
  reserva,
  hora,
  perfilId,
}: {
  reserva: ReservaDia;
  hora: number;
  perfilId: string;
}) {
  const esMia = reserva.creada_por === perfilId;
  return (
    <div
      className={`flex h-11 items-center rounded-lg px-3 text-sm ${
        esMia ? "border border-acento/50 bg-acento/10 text-tinta" : "bg-panel text-tinta-suave"
      }`}
    >
      <span className="truncate">
        {hora === reserva.hora_inicio ? (reserva.titular || "Reservada") : "·"}
      </span>
    </div>
  );
}

export function GrillaDia({
  orgId,
  orgPropietariaId,
  salas,
  reservas,
  planes,
  clientes,
  fecha,
  hoy,
  perfilId,
}: {
  orgId: string;
  orgPropietariaId: string;
  salas: Sala[];
  reservas: ReservaDia[];
  planes: Plan[];
  clientes: Cliente[];
  fecha: string;
  hoy: string;
  perfilId: string;
}) {
  const activas = salas.filter((s) => s.activa);
  const [salaElegidaId, setSalaElegidaId] = useState(activas[0]?.id ?? "");
  const [franja, setFranja] = useState<Franja | null>(null);

  const pasado = fecha < hoy;
  // Si cambió el edificio (y con él las salas), el id elegido puede no
  // existir más: el fallback a la primera sala lo cubre sin resincronizar.
  const salaElegida = activas.find((s) => s.id === salaElegidaId) ?? activas[0];

  if (activas.length === 0) {
    return <p className="text-sm text-tinta-suave">Este edificio todavía no tiene salas activas.</p>;
  }

  function BotonLibre({ sala, hora }: { sala: Sala; hora: number }) {
    if (pasado) {
      return <div className="h-11 rounded-lg border border-dashed border-linea" aria-hidden="true" />;
    }
    return (
      <button
        type="button"
        onClick={() => setFranja({ sala, hora })}
        className="group flex h-11 w-full items-center rounded-lg border border-dashed border-linea px-3 text-sm text-tinta-suave transition hover:border-acento hover:text-acento"
        aria-label={`Reservá ${sala.nombre} a las ${formatearHora(hora)}`}
      >
        <span className="lg:opacity-0 lg:transition lg:group-hover:opacity-100">Reservá</span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Mobile: chips de sala + columna vertical */}
      <div className="flex flex-col gap-3 lg:hidden">
        {activas.length > 1 && (
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Salas">
            {activas.map((s) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={s.id === salaElegida?.id}
                onClick={() => setSalaElegidaId(s.id)}
                className={`h-8 rounded-full px-3 text-sm transition ${
                  s.id === salaElegida?.id
                    ? "bg-acento/10 font-medium text-acento"
                    : "border border-linea text-tinta-suave"
                }`}
              >
                {s.nombre}
              </button>
            ))}
          </div>
        )}
        {salaElegida?.descripcion && (
          <p className="text-sm text-tinta-suave">{salaElegida.descripcion}</p>
        )}
        {salaElegida && (
          <div className="flex flex-col gap-1.5">
            {HORAS.map((hora) => {
              const reserva = reservaEn(reservas, salaElegida.id, hora);
              return (
                <div key={hora} className="flex items-center gap-2">
                  <span className="w-12 shrink-0 text-right text-sm tabular-nums text-tinta-suave">
                    {formatearHora(hora)}
                  </span>
                  <div className="min-w-0 flex-1">
                    {reserva ? (
                      <CeldaOcupada reserva={reserva} hora={hora} perfilId={perfilId} />
                    ) : (
                      <BotonLibre sala={salaElegida} hora={hora} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Desktop: grilla salas × horas */}
      <div className="hidden overflow-x-auto lg:block">
        <div
          className="grid min-w-[640px] gap-x-3 gap-y-1.5"
          style={{ gridTemplateColumns: `56px repeat(${activas.length}, minmax(140px, 1fr))` }}
        >
          <div />
          {activas.map((s) => (
            <div key={s.id} className="pb-1 text-sm font-medium text-tinta">
              {s.nombre}
              <span className="ml-2 text-xs font-normal text-tinta-suave">
                {s.tipo === "privada" ? "Privada" : "Pública"}
              </span>
            </div>
          ))}
          {HORAS.map((hora) => (
            <div key={hora} className="contents">
              <div className="flex h-11 items-center justify-end text-sm tabular-nums text-tinta-suave">
                {formatearHora(hora)}
              </div>
              {activas.map((s) => {
                const reserva = reservaEn(reservas, s.id, hora);
                return (
                  <div key={s.id}>
                    {reserva ? (
                      <CeldaOcupada reserva={reserva} hora={hora} perfilId={perfilId} />
                    ) : (
                      <BotonLibre sala={s} hora={hora} />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {franja && (
        <SheetReserva
          orgId={orgId}
          orgPropietariaId={orgPropietariaId}
          sala={franja.sala}
          fecha={fecha}
          horaInicial={franja.hora}
          planes={planes}
          clientes={clientes}
          onCerrar={() => setFranja(null)}
        />
      )}
    </div>
  );
}
