import type { Company, Id, IsoDate, Priority, Task } from "../data/types";
import { endOfWeek } from "./dates";

const PRIO_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export const isActive = <T extends { deleted_at: string | null }>(r: T) => r.deleted_at === null;
export const isDelegated = (t: Task) => t.assignee_person_id !== null;
export const isOpen = (t: Task) => t.status !== "done";

/** Sortierung: Fälligkeit (ohne Datum zuletzt), dann Priorität, dann Titel. */
export function compareTasks(a: Task, b: Task): number {
  const da = a.due_date ?? "9999-99-99";
  const db = b.due_date ?? "9999-99-99";
  if (da !== db) return da < db ? -1 : 1;
  if (a.priority !== b.priority) return PRIO_RANK[a.priority] - PRIO_RANK[b.priority];
  return a.title.localeCompare(b.title, "de");
}

export interface TodayView {
  overdue: Task[];
  today: Task[];
  week: Task[];
  followUp: Task[];
  blocked: Task[];
}

/** Startseite "Heute" (SPEC 6.2). */
export function todayView(tasks: Task[], today: IsoDate): TodayView {
  const open = tasks.filter((t) => isActive(t) && isOpen(t));
  const weekEnd = endOfWeek(today);
  const mine = open.filter((t) => !isDelegated(t) && t.status !== "blocked" && t.due_date);
  const followUp = open
    .filter(
      (t) =>
        isDelegated(t) &&
        t.status !== "blocked" &&
        ((t.follow_up_date !== null && t.follow_up_date <= today) || (t.due_date !== null && t.due_date < today)),
    )
    .sort((a, b) => {
      const ka = minDate(a.follow_up_date, a.due_date);
      const kb = minDate(b.follow_up_date, b.due_date);
      return ka === kb ? compareTasks(a, b) : ka < kb ? -1 : 1;
    });
  return {
    overdue: mine.filter((t) => t.due_date! < today).sort(compareTasks),
    today: mine.filter((t) => t.due_date === today).sort(compareTasks),
    week: mine.filter((t) => t.due_date! > today && t.due_date! <= weekEnd).sort(compareTasks),
    followUp,
    blocked: open.filter((t) => t.status === "blocked").sort(compareTasks),
  };
}

function minDate(a: IsoDate | null, b: IsoDate | null): IsoDate {
  if (!a) return b ?? "9999-99-99";
  if (!b) return a;
  return a < b ? a : b;
}

/** Anzahl für den Tab-Titel: eigene fällige (überfällig + heute) + Nachhaken. */
export function todayCount(v: TodayView): number {
  return v.overdue.length + v.today.length + v.followUp.length;
}

export interface GroupProgress {
  done: number;
  total: number;
  openCompanyIds: Id[];
}

/** Fortschritt einer "Für mehrere Firmen"-Gruppe (SPEC 6.3). */
export function groupProgress(tasks: Task[], groupId: Id): GroupProgress {
  const members = tasks.filter((t) => isActive(t) && t.group_id === groupId);
  return {
    done: members.filter((t) => t.status === "done").length,
    total: members.length,
    openCompanyIds: members.filter((t) => t.status !== "done").map((t) => t.company_id),
  };
}

export function checklistProgress(t: Task): { done: number; total: number } {
  return { done: t.checklist.filter((c) => c.done).length, total: t.checklist.length };
}

export function overarchingCompany(companies: Company[]): Company | undefined {
  return companies.find((c) => c.is_overarching && isActive(c)) ?? companies.find(isActive);
}

/** Validierung vor dem Speichern (SPEC 6.3: Blockiert braucht Grund). */
export function validateTask(t: Pick<Task, "title" | "status" | "blocked_reason">): string | null {
  if (!t.title.trim()) return "Bitte einen Titel eingeben.";
  if (t.status === "blocked" && !t.blocked_reason.trim()) return "Bitte einen Grund für „Blockiert“ angeben.";
  return null;
}

export function isValidUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url.trim())) return false;
  try {
    new URL(url.trim());
    return true;
  } catch {
    return false;
  }
}

export interface FollowUpReason {
  label: string;
  /** rot hervorheben */
  urgent: boolean;
}

/**
 * Warum steht eine delegierte Aufgabe unter „Heute nachhaken“?
 * Überschrittene Frist hat Vorrang vor dem geplanten Nachhak-Datum.
 */
export function followUpReason(t: Pick<Task, "due_date" | "follow_up_date">, today: IsoDate): FollowUpReason | null {
  if (t.due_date && t.due_date < today) {
    const days = Math.round((Date.parse(today) - Date.parse(t.due_date)) / 86_400_000);
    return { label: days === 1 ? "Frist seit gestern überschritten" : `Frist seit ${days} T. überschritten`, urgent: true };
  }
  if (t.follow_up_date && t.follow_up_date < today) {
    const days = Math.round((Date.parse(today) - Date.parse(t.follow_up_date)) / 86_400_000);
    return { label: days === 1 ? "Nachhaken seit gestern fällig" : `Nachhaken seit ${days} T. fällig`, urgent: true };
  }
  if (t.follow_up_date === today) return { label: "Heute nachhaken", urgent: false };
  if (t.due_date === today) return { label: "Frist endet heute", urgent: false };
  return null;
}

/** Offene und erledigte Aufgaben trennen; Erledigte nach Erledigt-Datum, neueste zuerst. */
export function splitDone(tasks: Task[]): { open: Task[]; done: Task[] } {
  const doneKey = (t: Task) => t.done_at ?? t.updated_at;
  return {
    open: tasks.filter((t) => t.status !== "done"),
    done: tasks.filter((t) => t.status === "done").sort((a, b) => (doneKey(a) < doneKey(b) ? 1 : -1)),
  };
}
