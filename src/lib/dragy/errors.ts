// Supabase (postgrest-js) wirft standardmäßig keine echten Error-Instanzen,
// sondern reicht das rohe {message, details, hint, code}-JSON der API als
// Objekt durch – ein simples "e instanceof Error"-Check verfehlt das und
// verdeckt die eigentliche Fehlermeldung.
export function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message;
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  return fallback;
}
