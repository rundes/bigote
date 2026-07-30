import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export function clienteAdmin(): SupabaseClient {
  return createClient(URL, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  });
}

// Flakiness conocida: contra el auth hosteado, a veces el JWT recién emitido
// llega con "issued at" en el futuro por un pequeño desfasaje de reloj entre
// el server y el runner, y el sign-in falla. Reintentamos una sola vez tras
// una pequeña espera antes de darnos por vencidos.
function esErrorDeDesfasajeDeReloj(mensaje: string): boolean {
  const m = mensaje.toLowerCase();
  return m.includes("issued") || m.includes("clock") || m.includes("jwt");
}

export async function clienteComo(email: string): Promise<SupabaseClient> {
  const cliente = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await cliente.auth.signInWithPassword({ email, password: "demo1234" });
  if (error) {
    if (!esErrorDeDesfasajeDeReloj(error.message)) {
      throw new Error(`No pude ingresar como ${email}: ${error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const { error: errorReintento } = await cliente.auth.signInWithPassword({
      email,
      password: "demo1234",
    });
    if (errorReintento) {
      throw new Error(`No pude ingresar como ${email} (tras reintento): ${errorReintento.message}`);
    }
  }
  return cliente;
}
