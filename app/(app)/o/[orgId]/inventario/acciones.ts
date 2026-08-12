"use server";

import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";
import { obtenerContextoOrg } from "@/lib/org";

type Resultado = { error?: string; id?: string };

const CATEGORIAS = ["libro", "grafico", "equipamiento", "mobiliario", "cable", "otro"];

/** Las RPC ya validan permiso y reglas; acá se traduce el error a algo legible. */
function mensaje(error: { message?: string } | null, porDefecto: string): string {
  const m = error?.message ?? "";
  // postgres antepone contexto al raise exception; nos quedamos con lo nuestro.
  const limpio = m.replace(/^.*?:\s*/, "").trim();
  return limpio || porDefecto;
}

export async function crearArticulo(orgId: string, formData: FormData): Promise<Resultado> {
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto || !contexto.permisos.inventario) {
    return { error: "No tenés permiso para administrar el inventario." };
  }

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { error: "Poné un nombre." };

  const categoria = String(formData.get("categoria") ?? "");
  if (!CATEGORIAS.includes(categoria)) return { error: "Elegí una categoría." };

  const naturaleza = String(formData.get("naturaleza") ?? "");
  if (naturaleza !== "existencia" && naturaleza !== "activo") {
    return { error: "Elegí si se cuenta por cantidad o es una cosa única." };
  }

  const cantidad = naturaleza === "activo" ? 1 : Number(formData.get("cantidad") ?? 1);
  if (!Number.isInteger(cantidad) || cantidad < 1) {
    return { error: "La cantidad inicial tiene que ser 1 o más." };
  }

  const ubicacionRaw = String(formData.get("ubicacion") ?? "").trim();

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("inv_crear_articulo", {
    org: orgId,
    nombre,
    descripcion: String(formData.get("descripcion") ?? "").trim(),
    categoria,
    naturaleza,
    ubicacion: ubicacionRaw || null,
    cantidad_inicial: cantidad,
  });

  if (error) return { error: mensaje(error, "No pudimos crear el artículo.") };

  revalidatePath(`/o/${orgId}/inventario`);
  return { id: data as string };
}

export async function prestarArticulo(
  orgId: string,
  articuloId: string,
  formData: FormData
): Promise<Resultado> {
  const perfil = String(formData.get("perfil") ?? "").trim();
  if (!perfil) return { error: "Elegí a quién se lo prestás." };

  const devolucion = String(formData.get("devolucion") ?? "").trim();

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("inv_prestar", {
    articulo: articuloId,
    a_perfil: perfil,
    devolucion: devolucion || null,
    nota: String(formData.get("nota") ?? "").trim(),
  });
  if (error) return { error: mensaje(error, "No pudimos registrar el préstamo.") };

  revalidatePath(`/o/${orgId}/inventario/${articuloId}`);
  revalidatePath(`/o/${orgId}/inventario`);
  return {};
}

export async function devolverArticulo(orgId: string, articuloId: string): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("inv_devolver", { articulo: articuloId, nota: "" });
  if (error) return { error: mensaje(error, "No pudimos registrar la devolución.") };

  revalidatePath(`/o/${orgId}/inventario/${articuloId}`);
  revalidatePath(`/o/${orgId}/inventario`);
  return {};
}

export async function ajustarStock(
  orgId: string,
  articuloId: string,
  formData: FormData
): Promise<Resultado> {
  const delta = Number(formData.get("delta"));
  if (!Number.isInteger(delta) || delta === 0) {
    return { error: "Poné un ajuste distinto de cero." };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("inv_ajustar", {
    articulo: articuloId,
    delta,
    nota: String(formData.get("nota") ?? "").trim(),
  });
  if (error) return { error: mensaje(error, "No pudimos ajustar el stock.") };

  revalidatePath(`/o/${orgId}/inventario/${articuloId}`);
  revalidatePath(`/o/${orgId}/inventario`);
  return {};
}

export async function crearUbicacion(orgId: string, formData: FormData): Promise<Resultado> {
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto || !contexto.permisos.inventario) {
    return { error: "No tenés permiso para administrar el inventario." };
  }
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { error: "Poné un nombre." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("inventario_ubicaciones")
    .insert({ org_id: orgId, nombre });
  if (error) {
    return {
      error: error.code === "23505"
        ? "Ya existe una ubicación con ese nombre."
        : "No pudimos crear la ubicación.",
    };
  }

  revalidatePath(`/o/${orgId}/inventario/ubicaciones`);
  return {};
}

export async function crearDestinatario(orgId: string, formData: FormData): Promise<Resultado> {
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto || !contexto.permisos.inventario) {
    return { error: "No tenés permiso para administrar el inventario." };
  }
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { error: "Poné el nombre del grupo." };

  const email = String(formData.get("email") ?? "").trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "Ese email no parece válido." };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("inventario_destinatarios").insert({
    org_id: orgId,
    nombre,
    localidad: String(formData.get("localidad") ?? "").trim(),
    provincia: String(formData.get("provincia") ?? "").trim(),
    contacto_nombre: String(formData.get("contacto") ?? "").trim(),
    email: email || null,
    direccion: String(formData.get("direccion") ?? "").trim(),
  });
  if (error) {
    return {
      error: error.code === "23505"
        ? "Ya existe un destinatario con ese nombre."
        : "No pudimos crear el destinatario.",
    };
  }

  revalidatePath(`/o/${orgId}/inventario/destinatarios`);
  return {};
}

export async function crearPaquete(orgId: string, formData: FormData): Promise<Resultado> {
  const destinatario = String(formData.get("destinatario") ?? "").trim();
  if (!destinatario) return { error: "Elegí el destinatario." };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("inv_crear_paquete", {
    org: orgId,
    destinatario,
    nota: String(formData.get("nota") ?? "").trim(),
  });
  if (error) return { error: mensaje(error, "No pudimos crear el paquete.") };

  revalidatePath(`/o/${orgId}/inventario/paquetes`);
  return { id: data as string };
}

export async function agregarAPaquete(
  orgId: string,
  paqueteId: string,
  formData: FormData
): Promise<Resultado> {
  const articulo = String(formData.get("articulo") ?? "").trim();
  if (!articulo) return { error: "Elegí un artículo." };

  const cantidad = Number(formData.get("cantidad") ?? 1);
  if (!Number.isInteger(cantidad) || cantidad < 1) {
    return { error: "La cantidad tiene que ser 1 o más." };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("inv_agregar_a_paquete", {
    paquete: paqueteId,
    articulo,
    cantidad,
  });
  if (error) return { error: mensaje(error, "No pudimos agregarlo al paquete.") };

  revalidatePath(`/o/${orgId}/inventario/paquetes/${paqueteId}`);
  return {};
}

export async function despacharPaquete(orgId: string, paqueteId: string): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("inv_despachar_paquete", { paquete: paqueteId });
  if (error) return { error: mensaje(error, "No pudimos despachar el paquete.") };

  revalidatePath(`/o/${orgId}/inventario/paquetes/${paqueteId}`);
  revalidatePath(`/o/${orgId}/inventario`);
  return {};
}
