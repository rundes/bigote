/**
 * Tipos y helpers puros de inventario. Sin imports de servidor a propósito:
 * los componentes cliente importan valores de acá (etiquetas, derivación de
 * estado), y si este módulo tocara `lib/supabase/server.ts` el bundler
 * arrastraría `next/headers` al bundle del navegador y el build rompe.
 */

export type Categoria =
  | "libro" | "grafico" | "equipamiento" | "mobiliario" | "cable" | "otro";
export type Naturaleza = "existencia" | "activo";
export type EstadoActivo = "disponible" | "prestado" | "salido";

export const ETIQUETAS_CATEGORIA: Record<Categoria, string> = {
  libro: "Libro",
  grafico: "Material gráfico",
  equipamiento: "Equipamiento",
  mobiliario: "Mobiliario",
  cable: "Cable",
  otro: "Otro",
};

export type Ubicacion = {
  id: string;
  nombre: string;
  edificio_id: string | null;
  activa: boolean;
};

export type Destinatario = {
  id: string;
  nombre: string;
  localidad: string;
  provincia: string;
  contacto_nombre: string;
  email: string | null;
  direccion: string;
};

export type Articulo = {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  categoria: Categoria;
  naturaleza: Naturaleza;
  ubicacion_id: string | null;
  activo: boolean;
};

export type ArticuloConStock = Articulo & {
  stock: number;
  ubicacion_nombre: string | null;
};

export type Movimiento = {
  id: string;
  tipo: "alta" | "prestamo" | "devolucion" | "despacho" | "ajuste" | "baja";
  cantidad: number;
  nota: string;
  devolucion_esperada: string | null;
  created_at: string;
  perfil_id: string | null;
  destinatario_id: string | null;
};

export type Paquete = {
  id: string;
  codigo: string;
  estado: "abierto" | "despachado";
  nota: string;
  despachado_at: string | null;
  destinatario_id: string;
};

export type PaqueteConDestinatario = Paquete & {
  destinatario_nombre: string;
  total_items: number;
};

export type ItemDePaquete = {
  articulo_id: string;
  cantidad: number;
  nombre: string;
  codigo: string;
};

/** El estado de un activo se deriva del último movimiento, igual que en la base. */
export function estadoDeActivo(movs: Movimiento[]): EstadoActivo {
  const ultimo = movs[0];
  if (!ultimo) return "disponible";
  if (ultimo.tipo === "prestamo") return "prestado";
  if (ultimo.tipo === "despacho" || ultimo.tipo === "baja") return "salido";
  return "disponible";
}
