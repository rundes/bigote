import Link from "next/link";
import { redirect } from "next/navigation";
import { resolverCodigo } from "@/lib/inventario";

/**
 * Destino de los QR de las etiquetas. Vive fuera de `(app)/o/[orgId]` porque el
 * código resuelve su propia organización.
 *
 * Sin sesión, el middleware manda a /ingresar?next=/q/<codigo> y se vuelve acá
 * después de entrar.
 */
export default async function ResolverCodigo({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  const destino = await resolverCodigo(codigo);

  if (destino?.tipo === "articulo") {
    redirect(`/o/${destino.orgId}/inventario/${destino.id}`);
  }
  if (destino?.tipo === "paquete") {
    redirect(`/o/${destino.orgId}/inventario/paquetes/${destino.id}`);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-fondo px-4">
      <div className="w-full max-w-sm text-center">
        <p className="text-sm text-tinta-suave">Código</p>
        <p className="mt-1 font-mono text-lg font-semibold text-tinta">
          {codigo.toUpperCase()}
        </p>
        <h1 className="mt-6 text-xl font-bold text-tinta">No encontramos esta etiqueta</h1>
        <p className="mt-2 text-sm text-tinta-suave">
          Puede que el código esté mal leído, que el ítem se haya dado de baja, o
          que sea de otra organización.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center rounded-lg bg-acento px-4 text-sm font-medium text-acento-tinta"
        >
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
