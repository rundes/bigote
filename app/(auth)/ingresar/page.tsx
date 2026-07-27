import { FormIngreso } from "./FormIngreso";

export default function PaginaIngresar() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-fondo px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-tinta">bigote</h1>
          <p className="mt-2 text-sm text-tinta-suave">
            Gestión de tu organización
          </p>
        </div>
        <FormIngreso />
      </div>
    </main>
  );
}
