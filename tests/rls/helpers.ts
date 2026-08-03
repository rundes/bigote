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
  return (m.includes("issued") && m.includes("future")) || m.includes("clock");
}

// Cache de sesiones por email (los archivos de test corren en un solo
// proceso, ver vitest.config.ts): cada usuario se loguea una sola vez por
// corrida, lo que mantiene la suite lejos del rate limit de auth del
// proyecto hosted. Si un afterAll hizo signOut, se re-loguea solo.
const sesiones = new Map<string, SupabaseClient>();

export async function clienteComo(email: string): Promise<SupabaseClient> {
  const cacheada = sesiones.get(email);
  if (cacheada) {
    const { data, error } = await cacheada.auth.getUser();
    if (!error && data.user) return cacheada;
    sesiones.delete(email);
  }

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

  // El mismo desfasaje puede hacer que el primer getUser() con el JWT recién
  // emitido falle ("issued at future") aunque el sign-in haya andado. Se
  // verifica acá con un reintento corto, así los tests pueden llamar a
  // getUser() sin repetir esta danza en cada beforeAll.
  for (let intento = 0; intento < 3; intento++) {
    const { data, error: errorUser } = await cliente.auth.getUser();
    if (!errorUser && data.user) {
      sesiones.set(email, cliente);
      return cliente;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`Ingresé como ${email} pero getUser() no devolvió el usuario (clock skew).`);
}
