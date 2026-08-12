import { Sun, ListChecks, DoorOpen, Wallet, Menu, Boxes, type LucideIcon } from "lucide-react";
import type { Permisos } from "@/lib/org";

export type ItemNav = {
  href: (orgId: string) => string;
  etiqueta: string;
  icono: LucideIcon;
  permiso: keyof Permisos | null;
  /**
   * Fuera de la barra inferior. Con seis ítems cada uno queda en ~63 px en una
   * pantalla de 380 px, por debajo del mínimo táctil de 44 px que pide
   * PRODUCT.md una vez descontado el padding. En mobile se llega desde "Más".
   */
  soloEscritorio?: boolean;
};

export const ITEMS_NAV: ItemNav[] = [
  { href: (orgId) => `/o/${orgId}`, etiqueta: "Hoy", icono: Sun, permiso: null },
  { href: (orgId) => `/o/${orgId}/tareas`, etiqueta: "Tareas", icono: ListChecks, permiso: "proyectos" },
  { href: (orgId) => `/o/${orgId}/espacios`, etiqueta: "Espacios", icono: DoorOpen, permiso: null },
  { href: (orgId) => `/o/${orgId}/finanzas`, etiqueta: "Finanzas", icono: Wallet, permiso: "finanzas" },
  { href: (orgId) => `/o/${orgId}/inventario`, etiqueta: "Inventario", icono: Boxes, permiso: "inventario", soloEscritorio: true },
  { href: (orgId) => `/o/${orgId}/mas`, etiqueta: "Más", icono: Menu, permiso: null },
];
