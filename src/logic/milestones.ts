// Meilensteine (Themen) je Firma: Status und Fortschritt.
import type { IsoDate, MilestoneState, MilestoneStatus } from "../data/types";

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
