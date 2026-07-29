import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { crearClienteServidor } from "@/lib/supabase/server";

const TIPOS_VALIDOS: EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

function parsearTipo(valor: string | null): EmailOtpType {
  if (valor && (TIPOS_VALIDOS as string[]).includes(valor)) {
    return valor as EmailOtpType;
  }
  return "email";
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = parsearTipo(searchParams.get("type"));

  if (tokenHash) {
    const supabase = await crearClienteServidor();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(`${origin}/`);
    }
  }

  return NextResponse.redirect(`${origin}/ingresar?error=enlace`);
}
