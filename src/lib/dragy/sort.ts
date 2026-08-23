// Einheitliche Sortierung für alle Listen und Diagramm-Serien.
//
// Ein gemeinsamer Collator statt verstreuter localeCompare-Aufrufe: nur so
// stehen Session-Liste, Legende und Tabellen garantiert in derselben Reihenfolge.

const collator = new Intl.Collator("de", {
  // "Lauf 2" vor "Lauf 10" – reiner Zeichenvergleich würde "Lauf 10" vorziehen,
  // weil "1" < "2" ist.
  numeric: true,
  // Groß-/Kleinschreibung und Akzente sollen die Reihenfolge nicht bestimmen.
  sensitivity: "base",
});

/**
 * Namen alphabetisch aufsteigend, Zahlen darin natürlich sortiert.
 *
 * Nur für Namen ohne eigene Zeitachse gedacht – Läufe („Lauf 1, 2, 10"),
 * Legenden-Texte, Stichentscheide. Sessions werden nicht hierüber sortiert,
 * sondern über compareSessionsDesc in sessionTime.ts: ihre Namen tragen
 * unterschiedliche Datumsformate, und numeric:true vergleicht dann beim einen
 * das Jahr mit dem Tag des anderen.
 */
export function compareNames(a: string, b: string): number {
  return collator.compare(a, b);
}

/** Gegenstück zu compareNames – absteigend, sonst dieselbe Ordnung. */
export function compareNamesDesc(a: string, b: string): number {
  return collator.compare(b, a);
}

/**
 * Vergleicher für benannte Objekte. Die id als Stichentscheid hält die
 * Reihenfolge auch bei doppelten Namen stabil – sonst hinge sie an der
 * Lesereihenfolge aus IndexedDB und könnte zwischen zwei Aufrufen wechseln.
 */
export function byName<T extends { name: string; id: string }>(a: T, b: T): number {
  return compareNames(a.name, b.name) || a.id.localeCompare(b.id);
}

/** Kopie der Liste, alphabetisch aufsteigend nach Name. */
export function sortedByName<T extends { name: string; id: string }>(items: T[]): T[] {
  return [...items].sort(byName);
}
