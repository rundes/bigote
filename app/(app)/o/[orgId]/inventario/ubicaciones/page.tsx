import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerContextoOrg } from "@/lib/org";
import { listarUbicaciones } from "@/lib/inventario";
import { crearUbicacion } from "../acciones";
import { FormSimple } from "@/componentes/inventario/FormSimple";

export default async function PaginaUbicaciones({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto) redirect("/");
  if (!contexto.permisos.inventario) redirect(`/o/${orgId}/sin-acceso`);

  const ubicaciones = await listarUbicaciones(orgId);

  async function alta(formData: FormData) {
    "use server";
    return crearUbicacion(orgId, formData);
  }

  return (
    <>
      <Link
        href={`/o/${orgId}/inventario`}
        className="text-sm text-tinta-suave underline decoration-linea underline-offset-4 hover:text-acento"
      >
        Inventario
      </Link>

      <h1 className="mt-3 text-2xl font-bold text-tinta">Ubicaciones</h1>
      <p className="mt-1 max-w-[70ch] text-sm text-tinta-suave">
        Dónde se guardan las cosas: &ldquo;Depósito A&rdquo;, &ldquo;Biblioteca&rdquo;,
        &ldquo;Oficina&rdquo;. Sirven para filtrar y para que la ficha diga dónde buscar.
      </p>

      <FormSimple
        accion={alta}
        textoBoton="Agregar ubicación"
        campos={[{ nombre: "nombre", etiqueta: "Nombre", requerido: true }]}
      />

      {ubicaciones.length === 0 ? (
        <p className="mt-8 text-sm text-tinta-suave">Todavía no cargaste ninguna.</p>
      ) : (
        <div className="mt-8 divide-y divide-linea border-y border-linea">
          {ubicaciones.map((u) => (
            <div key={u.id} className="py-3 text-sm text-tinta">
              {u.nombre}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
