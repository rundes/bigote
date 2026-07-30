import { Sun, ListChecks, DoorOpen, Wallet, Menu, type LucideIcon } from "lucide-react";
import type { Permisos } from "@/lib/org";

export const ITEMS_NAV: {
  href: (orgId: string) => string;
  etiqueta: string;
  icono: LucideIcon;
  permiso: keyof Permisos | null;
}[] = [
  { href: (orgId) => `/o/${orgId}`, etiqueta: "Hoy", icono: Sun, permiso: null },
  { href: (orgId) => `/o/${orgId}/tareas`, etiqueta: "Tareas", icono: ListChecks, permiso: "proyectos" },
  { href: (orgId) => `/o/${orgId}/espacios`, etiqueta: "Espacios", icono: DoorOpen, permiso: null },
  { href: (orgId) => `/o/${orgId}/finanzas`, etiqueta: "Finanzas", icono: Wallet, permiso: "finanzas" },
  { href: (orgId) => `/o/${orgId}/mas`, etiqueta: "Más", icono: Menu, permiso: null },
];
