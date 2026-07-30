export function PipsDificultad({ valor }: { valor: number }) {
  return (
    <span
      aria-label={`Dificultad ${valor} de 5`}
      className="inline-flex items-center gap-0.5 text-sm leading-none"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} aria-hidden="true" className={n <= valor ? "text-acento" : "text-tinta-suave"}>
          ●
        </span>
      ))}
    </span>
  );
}
