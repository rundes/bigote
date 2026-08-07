import type { NextRequest } from "next/server";
import { actualizarSesion } from "@/lib/supabase/middleware";

export function middleware(request: NextRequest) {
  return actualizarSesion(request);
}

export const config = {
  // api/notificaciones/despachar excluido: lo llama pg_cron sin sesión de
  // usuario, autenticado con su propio Bearer CRON_SECRET (ver route.ts).
  // Anclado con $ para no excluir de paso subrutas o nombres con el mismo
  // prefijo (p.ej. "api/notificaciones/despacharX").
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/notificaciones/despachar$|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)",
  ],
};
