import { FormIngreso } from "./FormIngreso";
import { Logo } from "@/componentes/marca/Logo";
import { destinoSeguro } from "@/lib/rutas";
import { APP_VERSION } from "@/lib/version";

export default async function PaginaIngresar({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const destino = destinoSeguro(next);
  const errorInicial =
    error === "enlace" ? "El enlace venció o ya se usó. Pedí uno nuevo." : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-fondo px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="overflow-hidden rounded-xl border border-linea bg-superficie shadow-sm">
          {/* Encabezado de la tarjeta: único lugar con el naranja institucional
              puro. El lockup amarillo sobre naranja es la firma de Centro
              Nueva Tierra, y su wordmark es texto real, así que hace de h1. */}
          <h1 className="bg-marca-pura px-6 py-8">
            <Logo className="text-[28px] text-amarillo" />
          </h1>

          <div className="p-6">
            <FormIngreso errorInicial={errorInicial} destino={destino} />
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-tinta-suave">v{APP_VERSION}</p>
      </div>
    </main>
  );
}
