// Reihenfolge der Menüpunkte: gespeicherte Reihenfolge anwenden, unbekannte
// Schlüssel ignorieren, fehlende (z. B. neuer Menüpunkt) an Standardposition ergänzen.

export function orderNav<T extends { key: string }>(items: T[], saved: string[]): T[] {
  if (saved.length === 0) return items;
  const byKey = new Map(items.map((i) => [i.key, i]));
  const result: T[] = [];
  for (const k of saved) {
    const item = byKey.get(k);
    if (item) {
      result.push(item);
      byKey.delete(k);
    }
  }
  // Nicht gespeicherte Punkte hinter ihrem Vorgänger aus der Standardliste einfügen
  items.forEach((item, idx) => {
    if (!byKey.has(item.key)) return;
    const prev = items.slice(0, idx).reverse().find((p) => result.includes(p));
    result.splice(prev ? result.indexOf(prev) + 1 : 0, 0, item);
  });
  return result;
}

/** Element von Position `from` nach `to` verschieben (neues Array). */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
