import Link from "next/link";

export default async function SinAcceso({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;

  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <p className="text-tinta">No tenés acceso a esta sección.</p>
      <Link href={`/o/${orgId}`} className="text-sm text-acento underline underline-offset-4">
        Volver a Hoy
      </Link>
    </div>
  );
}
