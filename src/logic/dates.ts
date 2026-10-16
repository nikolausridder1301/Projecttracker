// Datumslogik auf Basis lokaler ISO-Daten ("JJJJ-MM-TT"), ohne Zeitzonen-Fallen.
import type { IsoDate } from "../data/types";

function toDate(iso: IsoDate): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toIso(d: Date): IsoDate {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayIso(now = new Date()): IsoDate {
  return toIso(now);
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const d = toDate(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

/** Werktage Mo–Fr, Feiertage werden nicht berücksichtigt (SPEC 6.4). */
export function addWorkdays(iso: IsoDate, days: number): IsoDate {
  const d = toDate(iso);
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return toIso(d);
}

/** Sonntag der laufenden Woche (Woche beginnt Montag). */
export function endOfWeek(iso: IsoDate): IsoDate {
  const wd = toDate(iso).getDay(); // 0 = So
  return addDays(iso, wd === 0 ? 0 : 7 - wd);
}

/**
 * Kalendertag eines Zeitstempels in lokaler Zeit. `timestamptz` kommt als UTC –
 * einfaches Abschneiden auf 10 Zeichen ergäbe nachts den Vortag.
 */
export function localDate(value: string): IsoDate {
  return value.length <= 10 ? value : toIso(new Date(value));
}

export function formatDate(iso: IsoDate | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${formatDate(toIso(d))}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Kurzlabel relativ zu heute: "Heute", "Morgen", "Gestern", "vor 3 T.", sonst Datum. */
export function relativeLabel(iso: IsoDate, today: IsoDate): string {
  const diff = Math.round((toDate(iso).getTime() - toDate(today).getTime()) / 86_400_000);
  if (diff === 0) return "Heute";
  if (diff === 1) return "Morgen";
  if (diff === -1) return "Gestern";
  if (diff < 0 && diff > -14) return `vor ${-diff} T.`;
  return formatDate(iso);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000);
}
