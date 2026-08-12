import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerContextoOrg } from "@/lib/org";
import { listarDestinatarios } from "@/lib/inventario";
import { crearDestinatario } from "../acciones";
import { FormSimple } from "@/componentes/inventario/FormSimple";

export default async function PaginaDestinatarios({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const contexto = await obtenerContextoOrg(orgId);
  if (!contexto) redirect("/");
  if (!contexto.permisos.inventario) redirect(`/o/${orgId}/sin-acceso`);

  const destinatarios = await listarDestinatarios(orgId);

  async function alta(formData: FormData) {
    "use server";
    return crearDestinatario(orgId, formData);
  }

  return (
    <>
      <Link
        href={`/o/${orgId}/inventario/paquetes`}
        className="text-sm text-tinta-suave underline decoration-linea underline-offset-4 hover:text-acento"
      >
        Paquetes
      </Link>

      <h1 className="mt-3 text-2xl font-bold text-tinta">Destinatarios</h1>
      <p className="mt-1 max-w-[70ch] text-sm text-tinta-suave">
        Grupos y organizaciones que reciben material. El email hace falta para poder
        avisarles del envío.
      </p>

      <FormSimple
        accion={alta}
        textoBoton="Agregar destinatario"
        campos={[
          { nombre: "nombre", etiqueta: "Nombre del grupo", requerido: true },
          { nombre: "localidad", etiqueta: "Localidad", ancho: "mitad" },
          { nombre: "provincia", etiqueta: "Provincia", ancho: "mitad" },
          { nombre: "contacto", etiqueta: "Persona de contacto", ancho: "mitad" },
          { nombre: "email", etiqueta: "Email", tipo: "email", ancho: "mitad" },
          { nombre: "direccion", etiqueta: "Dirección de envío" },
        ]}
      />

      {destinatarios.length === 0 ? (
        <p className="mt-8 text-sm text-tinta-suave">Todavía no cargaste ninguno.</p>
      ) : (
        <div className="mt-8 divide-y divide-linea border-y border-linea">
          {destinatarios.map((d) => (
            <div key={d.id} className="py-3">
              <p className="text-sm font-medium text-tinta">{d.nombre}</p>
              <p className="text-xs text-tinta-suave">
                {[d.localidad, d.provincia].filter(Boolean).join(", ") || "sin localidad"}
                {d.email ? ` · ${d.email}` : " · sin email"}
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
