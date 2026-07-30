import Link from "next/link";
import { Users } from "lucide-react";

export default async function PaginaMas({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-tinta">Más</h1>

      <div className="flex flex-col">
        <Link
          href={`/o/${orgId}/equipo`}
          className="flex h-11 items-center gap-3 text-sm font-medium text-tinta"
        >
          <Users size={20} strokeWidth={1.75} />
          Equipo
        </Link>
      </div>

      <p className="text-sm text-tinta-suave">Más opciones, próximamente.</p>
    </div>
  );
}
