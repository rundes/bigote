import { crearClienteServidor } from "@/lib/supabase/server";
import { CONFIG_VACIA } from "@/lib/cobros-tipos";
import type { CobrosConfig, ReservaEsperandoPago } from "@/lib/cobros-tipos";

// Tipos y helpers puros aparte: los usa el cliente y no deben arrastrar
// `next/headers` al bundle del navegador.
export * from "@/lib/cobros-tipos";

export async function obtenerCobrosConfig(orgId: string): Promise<CobrosConfig> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("cobros_config")
    .select("org_id, alias, cbu, titular, cuit, banco, instrucciones, plazo_horas, activo")
    .eq("org_id", orgId)
    .maybeSingle<CobrosConfig>();
  return data ?? { org_id: orgId, ...CONFIG_VACIA };
}


/**
 * Reservas con el horario retenido esperando que entre la transferencia.
 * Se filtra por los edificios que esta organización opera, igual que el resto
 * de finanzas.
 */
export async function listarEsperandoPago(orgId: string): Promise<ReservaEsperandoPago[]> {
  const supabase = await crearClienteServidor();

  const { data } = await supabase
    .from("reservas")
    .select(
      `id, fecha, hora_inicio, horas, costo, vence_at,
       salas!inner(nombre, edificios!inner(org_propietaria_id)),
       clientes(nombre),
       perfiles:para_perfil_id(nombre, email)`
    )
    .eq("estado", "esperando_pago")
    .order("vence_at", { ascending: true });

  type Fila = {
    id: string;
    fecha: string;
    hora_inicio: number;
    horas: number;
    costo: number;
    vence_at: string;
    salas: { nombre: string; edificios: { org_propietaria_id: string } | { org_propietaria_id: string }[] } | null;
    clientes: { nombre: string } | { nombre: string }[] | null;
    perfiles: { nombre: string; email: string } | { nombre: string; email: string }[] | null;
  };

  // supabase-js a veces envuelve las relaciones belongs-to en un array de un
  // elemento; misma ayuda que en lib/org.ts.
  const primero = <T,>(v: T | T[] | null | undefined): T | undefined =>
    Array.isArray(v) ? v[0] : v ?? undefined;

  return ((data ?? []) as unknown as Fila[])
    .filter((r) => {
      const sala = primero(r.salas);
      const edificio = primero(sala?.edificios);
      return edificio?.org_propietaria_id === orgId;
    })
    .map((r) => {
      const cliente = primero(r.clientes);
      const perfil = primero(r.perfiles);
      return {
        id: r.id,
        fecha: r.fecha,
        hora_inicio: r.hora_inicio,
        horas: r.horas,
        costo: Number(r.costo),
        vence_at: r.vence_at,
        sala_nombre: primero(r.salas)?.nombre ?? "",
        quien: cliente?.nombre ?? perfil?.nombre ?? perfil?.email ?? "—",
      };
    });
}

