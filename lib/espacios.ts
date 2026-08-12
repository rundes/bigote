import { crearClienteServidor } from "@/lib/supabase/server";

export type Sala = {
  id: string;
  nombre: string;
  tipo: "publica" | "privada";
  descripcion: string;
  activa: boolean;
};

export type Edificio = {
  id: string;
  nombre: string;
  direccion: string;
  descripcion: string;
  org_propietaria_id: string;
  org_gestora_id: string | null;
  destino_ingresos: "propietaria" | "gestora" | "reparto";
  porcentaje_propietaria: number | null;
};

export type Media = {
  id: string;
  tipo: "foto" | "video";
  url: string;
  orden: number;
};

export type Plan = {
  id: string;
  nombre: string;
  gratuito: boolean;
  precio_hora: number;
  solo_salas_publicas: boolean;
  requiere_pago_previo: boolean;
};

export type ReservaDia = {
  id: string;
  sala_id: string;
  hora_inicio: number;
  horas: number;
  titular: string;
  creada_por: string;
};

export type MiReserva = {
  id: string;
  fecha: string;
  hora_inicio: number;
  horas: number;
  costo: number;
  sala: string;
  edificio: string;
  titular: string | null;
};

// supabase-js tipa las relaciones anidadas belongs-to como objeto, pero en
// runtime a veces llegan envueltas en un array de un elemento según cómo se
// resuelva la FK; esta ayuda normaliza ambas formas (mismo patrón que
// lib/org.ts) sin cambiar las firmas exportadas.
function primero<T>(valor: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(valor)) return valor[0];
  return valor ?? undefined;
}

// "Hoy" como YYYY-MM-DD en Buenos Aires (el server puede correr en otra TZ).
export function hoyEnBuenosAires(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

type EdificioFila = Edificio & { salas: { id: string; activa: boolean }[] | null };

export async function listarEdificios(
  orgId: string
): Promise<(Edificio & { salasActivas: number })[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("edificios")
    .select(
      "id, nombre, direccion, descripcion, org_propietaria_id, org_gestora_id, destino_ingresos, porcentaje_propietaria, salas(id, activa)"
    )
    .or(`org_propietaria_id.eq.${orgId},org_gestora_id.eq.${orgId}`)
    .order("nombre")
    .returns<EdificioFila[]>();
  return (data ?? []).map(({ salas, ...edificio }) => ({
    ...edificio,
    salasActivas: (salas ?? []).filter((s) => s.activa).length,
  }));
}

function urlPublica(supabaseUrl: string, path: string): string {
  return `${supabaseUrl}/storage/v1/object/public/espacios/${path}`;
}

type MediaFila = {
  id: string;
  edificio_id: string | null;
  sala_id: string | null;
  tipo: "foto" | "video";
  storage_path: string;
  orden: number;
};

export async function obtenerEdificio(edificioId: string): Promise<{
  edificio: Edificio;
  propietaria: string;
  gestora: string | null;
  salas: (Sala & { media: Media[] })[];
  mediaEdificio: Media[];
  planes: Plan[];
} | null> {
  const supabase = await crearClienteServidor();

  const { data: edificio } = await supabase
    .from("edificios")
    .select(
      "id, nombre, direccion, descripcion, org_propietaria_id, org_gestora_id, destino_ingresos, porcentaje_propietaria"
    )
    .eq("id", edificioId)
    .maybeSingle<Edificio>();
  if (!edificio) return null;

  const idsOrgs = [edificio.org_propietaria_id, edificio.org_gestora_id].filter(
    (id): id is string => Boolean(id)
  );
  const { data: orgs } = await supabase
    .from("organizaciones")
    .select("id, nombre")
    .in("id", idsOrgs)
    .returns<{ id: string; nombre: string }[]>();
  const nombreOrg = new Map((orgs ?? []).map((o) => [o.id, o.nombre]));

  const { data: salasFilas } = await supabase
    .from("salas")
    .select("id, nombre, tipo, descripcion, activa")
    .eq("edificio_id", edificioId)
    .order("nombre")
    .returns<Sala[]>();
  const salas = salasFilas ?? [];

  const { data: mediaFilas } = await supabase
    .from("espacio_media")
    .select("id, edificio_id, sala_id, tipo, storage_path, orden")
    .or(
      salas.length > 0
        ? `edificio_id.eq.${edificioId},sala_id.in.(${salas.map((s) => s.id).join(",")})`
        : `edificio_id.eq.${edificioId}`
    )
    .order("orden")
    .returns<MediaFila[]>();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const aMedia = (m: MediaFila): Media => ({
    id: m.id,
    tipo: m.tipo,
    url: urlPublica(supabaseUrl, m.storage_path),
    orden: m.orden,
  });
  const mediaEdificio = (mediaFilas ?? []).filter((m) => m.edificio_id === edificioId).map(aMedia);
  const mediaPorSala = new Map<string, Media[]>();
  for (const m of mediaFilas ?? []) {
    if (!m.sala_id) continue;
    const lista = mediaPorSala.get(m.sala_id) ?? [];
    lista.push(aMedia(m));
    mediaPorSala.set(m.sala_id, lista);
  }

  const { data: planesFilas } = await supabase
    .from("planes_reserva")
    .select("id, nombre, gratuito, precio_hora, solo_salas_publicas, requiere_pago_previo")
    .eq("org_id", edificio.org_propietaria_id)
    .order("nombre")
    .returns<Plan[]>();

  return {
    edificio,
    propietaria: nombreOrg.get(edificio.org_propietaria_id) ?? "",
    gestora: edificio.org_gestora_id ? (nombreOrg.get(edificio.org_gestora_id) ?? "") : null,
    salas: salas.map((s) => ({ ...s, media: mediaPorSala.get(s.id) ?? [] })),
    mediaEdificio,
    planes: planesFilas ?? [],
  };
}

type ReservaDiaFila = {
  id: string;
  sala_id: string;
  hora_inicio: number;
  horas: number;
  creada_por: string;
  clientes: { nombre: string }[] | { nombre: string } | null;
  perfiles: { nombre: string }[] | { nombre: string } | null;
};

export async function reservasDelDia(edificioId: string, fecha: string): Promise<ReservaDia[]> {
  const supabase = await crearClienteServidor();

  const { data: salas } = await supabase
    .from("salas")
    .select("id")
    .eq("edificio_id", edificioId)
    .returns<{ id: string }[]>();
  const idsSalas = (salas ?? []).map((s) => s.id);
  if (idsSalas.length === 0) return [];

  const { data } = await supabase
    .from("reservas")
    .select(
      "id, sala_id, hora_inicio, horas, creada_por, clientes(nombre), perfiles!reservas_para_perfil_id_fkey(nombre)"
    )
    .in("sala_id", idsSalas)
    .eq("fecha", fecha)
    .eq("estado", "confirmada")
    .returns<ReservaDiaFila[]>();

  return (data ?? []).map((r) => ({
    id: r.id,
    sala_id: r.sala_id,
    hora_inicio: r.hora_inicio,
    horas: r.horas,
    titular: primero(r.clientes)?.nombre ?? primero(r.perfiles)?.nombre ?? "",
    creada_por: r.creada_por,
  }));
}

type MiReservaFila = {
  id: string;
  fecha: string;
  hora_inicio: number;
  horas: number;
  costo: number;
  creada_por: string;
  para_perfil_id: string | null;
  clientes: { nombre: string }[] | { nombre: string } | null;
  salas:
    | { nombre: string; edificios: { nombre: string }[] | { nombre: string } | null }[]
    | { nombre: string; edificios: { nombre: string }[] | { nombre: string } | null }
    | null;
};

export async function misReservas(perfilId: string): Promise<MiReserva[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("reservas")
    .select(
      "id, fecha, hora_inicio, horas, costo, creada_por, para_perfil_id, clientes(nombre), salas(nombre, edificios(nombre))"
    )
    .or(`creada_por.eq.${perfilId},para_perfil_id.eq.${perfilId}`)
    .eq("estado", "confirmada")
    .gte("fecha", hoyEnBuenosAires())
    .order("fecha")
    .order("hora_inicio")
    .returns<MiReservaFila[]>();

  return (data ?? []).map((r) => {
    const sala = primero(r.salas);
    return {
      id: r.id,
      fecha: r.fecha,
      hora_inicio: r.hora_inicio,
      horas: r.horas,
      costo: Number(r.costo),
      sala: sala?.nombre ?? "",
      edificio: primero(sala?.edificios)?.nombre ?? "",
      titular: primero(r.clientes)?.nombre ?? null,
    };
  });
}

export async function listarClientes(
  orgId: string
): Promise<{ id: string; nombre: string; contacto: string | null }[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("clientes")
    .select("id, nombre, contacto")
    .eq("org_id", orgId)
    .order("nombre")
    .returns<{ id: string; nombre: string; contacto: string | null }[]>();
  return data ?? [];
}
