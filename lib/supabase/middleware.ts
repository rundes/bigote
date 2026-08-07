import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const RUTAS_PUBLICAS = ["/ingresar", "/auth"];

export async function actualizarSesion(request: NextRequest) {
  let respuesta = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (all) => {
          all.forEach(({ name, value }) => request.cookies.set(name, value));
          respuesta = NextResponse.next({ request });
          all.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options));
        },
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  const esPublica = RUTAS_PUBLICAS.some((r) => request.nextUrl.pathname.startsWith(r));
  if (!user && !esPublica) {
    // Rutas API sin sesión: 401 JSON, no el redirect HTML pensado para
    // navegación de usuario. Red de seguridad general para cualquier
    // endpoint machine-to-machine futuro que no quede excluido del matcher
    // (el dispatcher de notificaciones sí queda excluido del matcher y
    // nunca llega a este chequeo, pero otro endpoint futuro sin exclusión
    // caería acá en vez de recibir un 307 silencioso).
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "no autorizado" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/ingresar";
    return NextResponse.redirect(url);
  }
  return respuesta;
}
