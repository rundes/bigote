/** Tipos y helpers puros de cobros. Sin imports de servidor: los usa el cliente. */

export type CobrosConfig = {
  org_id: string;
  alias: string;
  cbu: string;
  titular: string;
  cuit: string;
  banco: string;
  instrucciones: string;
  plazo_horas: number;
  activo: boolean;
};

export const CONFIG_VACIA: Omit<CobrosConfig, "org_id"> = {
  alias: "",
  cbu: "",
  titular: "",
  cuit: "",
  banco: "",
  instrucciones: "",
  plazo_horas: 48,
  activo: false,
};

export type ReservaEsperandoPago = {
  id: string;
  fecha: string;
  hora_inicio: number;
  horas: number;
  costo: number;
  vence_at: string;
  sala_nombre: string;
  quien: string;
};

/** Horas que faltan para que venza, redondeadas hacia abajo. Negativo = vencida. */
export function horasParaVencer(venceAt: string): number {
  return Math.floor((new Date(venceAt).getTime() - Date.now()) / 3_600_000);
}
