// Meilensteine (Themen) je Firma: Status, Fortschritt und Ampel-Vorschlag.
import type { IsoDate, MilestoneState, MilestoneStatus, TrafficLight } from "../data/types";

export interface StateDef {
  value: MilestoneState;
  label: string;
  /** Farbton für Zelle/Chip */
  tone: "grey" | "green" | "yellow" | "red" | "done" | "na";
}

export const MILESTONE_STATES: StateDef[] = [
  { value: "not_started", label: "Nicht gestartet", tone: "grey" },
  { value: "on_track", label: "Läuft", tone: "green" },
  { value: "at_risk", label: "Kritisch", tone: "yellow" },
  { value: "delayed", label: "Verzögert", tone: "red" },
  { value: "done", label: "Abgeschlossen", tone: "done" },
  { value: "n_a", label: "Nicht relevant", tone: "na" },
];

export const stateDef = (s: MilestoneState): StateDef => MILESTONE_STATES.find((d) => d.value === s)!;

/** Zieldatum überschritten und noch nicht abgeschlossen? */
export function isOverdue(m: Pick<MilestoneStatus, "status" | "target_date">, today: IsoDate): boolean {
  return m.target_date !== null && m.target_date < today && m.status !== "done" && m.status !== "n_a";
}

/** Fortschritt einer Firma: abgeschlossene von relevanten Meilensteinen (fehlende Zellen = nicht gestartet). */
export function progress(cells: Pick<MilestoneStatus, "status">[], milestoneCount: number): { done: number; total: number } {
  const na = cells.filter((c) => c.status === "n_a").length;
  return { done: cells.filter((c) => c.status === "done").length, total: Math.max(0, milestoneCount - na) };
}

/**
 * Ampel-Vorschlag aus den Meilensteinen einer Firma: verzögert (oder Zieldatum
 * überschritten) → Rot, kritisch → Gelb, sonst Grün. Ohne Meilenstein-Daten kein Vorschlag.
 */
export function suggestTraffic(
  cells: Pick<MilestoneStatus, "status" | "target_date">[],
  today: IsoDate,
): { light: TrafficLight; reason: string } | null {
  const relevant = cells.filter((c) => c.status !== "n_a");
  if (relevant.length === 0) return null;
  const delayed = relevant.filter((c) => c.status === "delayed" || isOverdue(c, today)).length;
  const atRisk = relevant.filter((c) => c.status === "at_risk" && !isOverdue(c, today)).length;
  const parts = [
    delayed ? `${delayed} verzögert` : "",
    atRisk ? `${atRisk} kritisch` : "",
  ].filter(Boolean);
  if (delayed) return { light: "red", reason: parts.join(", ") };
  if (atRisk) return { light: "yellow", reason: parts.join(", ") };
  return { light: "green", reason: "keine kritischen Meilensteine" };
}
