// Skeleton genérico del shell: barra de título + filas, con la forma del
// contenido (DESIGN.md). Cada ruta puede definir uno propio si lo necesita.
export default function CargandoShell() {
  return (
    <div aria-hidden="true" className="flex animate-pulse flex-col gap-6 motion-reduce:animate-none">
      <div className="h-8 w-44 rounded-lg bg-panel" />
      <div className="flex gap-2">
        <div className="h-8 w-20 rounded-full bg-panel" />
        <div className="h-8 w-24 rounded-full bg-panel" />
        <div className="h-8 w-16 rounded-full bg-panel" />
      </div>
      <div className="flex flex-col gap-3">
        <div className="h-12 rounded-lg bg-panel" />
        <div className="h-12 rounded-lg bg-panel" />
        <div className="h-12 rounded-lg bg-panel" />
        <div className="h-12 w-3/4 rounded-lg bg-panel" />
      </div>
    </div>
  );
}
