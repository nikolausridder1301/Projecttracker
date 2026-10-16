// Firmen-Ampel: Änderungen nur bewusst und mit Begründung.
import type { IsoDate, TrafficLight } from "../data/types";
import { daysBetween, localDate } from "./dates";

/** Gelb und Rot brauchen eine Begründung; ohne Änderung wird nichts gespeichert. */
export function validateTrafficChange(
  current: { light: TrafficLight; comment: string },
  next: { light: TrafficLight; comment: string },
): string | null {
  const comment = next.comment.trim();
  if (next.light !== "green" && !comment) return "Bitte kurz begründen, warum die Ampel auf Gelb oder Rot steht.";
  if (next.light === current.light && comment === current.comment.trim()) return "Keine Änderung.";
  return null;
}

/** „seit heute“, „seit gestern“, „seit 3 T.“ */
export function sinceLabel(changedAt: string | null, today: IsoDate): string {
  if (!changedAt) return "";
  const days = daysBetween(localDate(changedAt), today);
  if (days <= 0) return "seit heute";
  if (days === 1) return "seit gestern";
  return `seit ${days} T.`;
}
