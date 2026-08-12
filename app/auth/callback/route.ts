import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { destinoSeguro } from "@/lib/rutas";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // `next` viene de la URL: se valida como relativo antes de redirigir, si no
  // el callback sería un open redirect.
  const destino = destinoSeguro(searchParams.get("next"));
  if (code) {
    const supabase = await crearClienteServidor();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${destino}`);
    }
  }
  return NextResponse.redirect(`${origin}/ingresar?error=enlace`);
}
