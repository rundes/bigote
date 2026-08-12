/**
 * Valida el `next` que viaja en la URL de ingreso. Solo se aceptan rutas
 * relativas de esta misma app: sin esto, `?next=https://otro.sitio` convertiría
 * el login en un open redirect.
 */
export function destinoSeguro(next: string | undefined | null): string {
  if (!next) return "/";
  // Debe empezar con una sola barra. "//host" y "/\host" son URLs de red
  // que el navegador resuelve a otro dominio.
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
