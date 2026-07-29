import { FormIngreso } from "./FormIngreso";

export default async function PaginaIngresar({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorInicial =
    error === "enlace" ? "El enlace venció o ya se usó. Pedí uno nuevo." : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-fondo px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-tinta">bigote</h1>
          <p className="mt-2 text-sm text-tinta-suave">
            Gestión de tu organización
          </p>
        </div>
        <FormIngreso errorInicial={errorInicial} />
      </div>
    </main>
  );
}
