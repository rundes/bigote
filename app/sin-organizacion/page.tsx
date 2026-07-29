import Link from "next/link";
import { crearClienteServidor } from "@/lib/supabase/server";

export default async function SinOrganizacion() {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();

  let esSuperAdmin = false;
  if (user) {
    const { data } = await supabase
      .from("super_admins")
      .select("perfil_id")
      .eq("perfil_id", user.id)
      .maybeSingle();
    esSuperAdmin = Boolean(data);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-fondo px-4 text-center">
      <h1 className="text-xl font-semibold text-tinta">
        Todavía no te invitaron a ninguna organización.
      </h1>
      <p className="text-sm text-tinta-suave">
        Pedile la invitación a quien administra la tuya.
      </p>

      {esSuperAdmin && (
        <Link href="/plataforma" className="text-sm text-acento underline underline-offset-4">
          Ir al panel de plataforma
        </Link>
      )}

      <form action="/auth/salir" method="POST" className="mt-4">
        <button
          type="submit"
          className="h-11 rounded-lg border border-linea bg-panel px-6 text-sm font-medium text-tinta transition hover:bg-linea/40"
        >
          Salir
        </button>
      </form>
    </main>
  );
}
