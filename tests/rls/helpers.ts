import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export function clienteAdmin(): SupabaseClient {
  return createClient(URL, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  });
}

export async function clienteComo(email: string): Promise<SupabaseClient> {
  const cliente = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await cliente.auth.signInWithPassword({ email, password: "demo1234" });
  if (error) throw new Error(`No pude ingresar como ${email}: ${error.message}`);
  return cliente;
}
