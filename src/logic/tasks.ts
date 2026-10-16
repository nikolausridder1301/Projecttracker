import type { ChecklistItem, Company, Id, IsoDate, Priority, Task } from "../data/types";
import { endOfWeek } from "./dates";

const PRIO_RANK: Record<Priority, number> = { high: 0, medium: 1 };

export const isActive = <T extends { deleted_at: string | null }>(r: T) => r.deleted_at === null;
export const isDelegated = (t: Task) => t.assignee_person_ids.length > 0;
export const isOpen = (t: Task) => t.status !== "done";

/** Sortierung: nächster Termin (Aufgabe oder offener Schritt; ohne Datum zuletzt), dann Wichtig, dann Titel. */
export function compareTasks(a: Task, b: Task): number {
  const da = effectiveDue(a) ?? "9999-99-99";
  const db = effectiveDue(b) ?? "9999-99-99";
  if (da !== db) return da < db ? -1 : 1;
  if (a.priority !== b.priority) return PRIO_RANK[a.priority] - PRIO_RANK[b.priority];
  return a.title.localeCompare(b.title, "de");
}

export interface TodayView {
  overdue: Task[];
  today: Task[];
  week: Task[];
  blocked: Task[];
}

/** Startseite "Heute": Fälliges (eigene und delegierte) und Blockiertes. */
export function todayView(tasks: Task[], today: IsoDate): TodayView {
  const open = tasks.filter((t) => isActive(t) && isOpen(t));
  const weekEnd = endOfWeek(today);
  // Fällig ist, was selbst fällig ist oder einen fälligen nächsten Schritt hat
  const due = open.filter((t) => t.status !== "blocked" && effectiveDue(t));
  const d = (t: Task) => effectiveDue(t)!;
  return {
    overdue: due.filter((t) => d(t) < today).sort(compareTasks),
    today: due.filter((t) => d(t) === today).sort(compareTasks),
    week: due.filter((t) => d(t) > today && d(t) <= weekEnd).sort(compareTasks),
    blocked: open.filter((t) => t.status === "blocked").sort(compareTasks),
  };
}

/** Anzahl für den Tab-Titel: überfällig + heute fällig. */
export function todayCount(v: TodayView): number {
  return v.overdue.length + v.today.length;
}

/** Schritt (kein Meilenstein)? */
export const isStep = (c: ChecklistItem) => !c.milestone;

/** Nächster offener Schritt: zuerst der mit dem frühesten Datum, sonst der erste offene. */
export function nextStep(t: Pick<Task, "checklist">): ChecklistItem | undefined {
  const open = t.checklist.filter((c) => isStep(c) && !c.done);
  const dated = open.filter((c) => c.due).sort((a, b) => (a.due! < b.due! ? -1 : 1));
  return dated[0] ?? open[0];
}

/** Aktueller Meilenstein: der erste noch nicht erreichte. */
export function currentMilestone(t: Pick<Task, "checklist">): ChecklistItem | undefined {
  return t.checklist.find((c) => c.milestone && !c.done);
}

export interface StepGroup {
  /** Index des Meilensteins in der Liste; null = Schritte ohne Meilenstein */
  milestone: number | null;
  /** Indizes der Schritte in der Liste */
  steps: number[];
}

/** Liste in Gruppen teilen: Schritte vor dem ersten Meilenstein, dann je Meilenstein seine Schritte. */
export function groupSteps(list: ChecklistItem[]): StepGroup[] {
  const groups: StepGroup[] = [{ milestone: null, steps: [] }];
  list.forEach((c, i) => {
    if (c.milestone) groups.push({ milestone: i, steps: [] });
    else groups[groups.length - 1].steps.push(i);
  });
  return groups;
}

/**
 * Neuen Schritt in eine Gruppe einfügen (ans Ende ihrer Schritte).
 * `milestone` = Index des Meilensteins, null = vor dem ersten Meilenstein,
 * "current" = beim aktuellen Meilenstein (sonst ohne Meilenstein).
 */
export function insertStep(list: ChecklistItem[], step: ChecklistItem, milestone: number | null | "current"): ChecklistItem[] {
  const target = milestone === "current" ? (list.findIndex((c) => c.milestone && !c.done) === -1 ? null : list.findIndex((c) => c.milestone && !c.done)) : milestone;
  const groups = groupSteps(list);
  const g = groups.find((x) => x.milestone === target) ?? groups[0];
  const after = g.steps.length > 0 ? g.steps[g.steps.length - 1] : (g.milestone ?? -1);
  const next = [...list];
  next.splice(after + 1, 0, step);
  return next;
}

/** Frühestes Datum aus Aufgabe, offenen Schritten und Zieldaten offener Meilensteine. */
export function effectiveDue(t: Pick<Task, "due_date" | "checklist">): IsoDate | null {
  const dates = [t.due_date, ...t.checklist.filter((c) => !c.done).map((c) => c.due ?? null)].filter((x): x is IsoDate => !!x);
  return dates.length ? dates.sort()[0] : null;
}

/** Personen eines Schritts (auch Altbestand mit einer Person). */
export const stepPersons = (c: ChecklistItem): Id[] => c.person_ids ?? (c.person_id ? [c.person_id] : []);

/** Personen, bei denen die Aufgabe offen ist: Verantwortliche und Personen in offenen Schritten. */
export function personsOf(t: Pick<Task, "assignee_person_ids" | "checklist">): Id[] {
  return [...new Set([...t.assignee_person_ids, ...t.checklist.filter((c) => !c.done).flatMap(stepPersons)])];
}

/** Wo eine Person noch vorkommt (für „Löschen“): offene Aufgaben bzw. irgendwo im Bestand. */
export function personRefs(
  db: { tasks: Task[]; notes: { participant_ids: Id[]; deleted_at: string | null }[]; vendor_items: { contact_person_ids: Id[] }[] },
  personId: Id,
): { open: number; any: boolean } {
  const tasks = db.tasks.filter((t) => personsOf(t).includes(personId) || t.assignee_person_ids.includes(personId));
  const open = tasks.filter((t) => t.deleted_at === null && t.status !== "done" && personsOf(t).includes(personId)).length;
  const any =
    tasks.length > 0 ||
    db.tasks.some((t) => t.checklist.some((c) => stepPersons(c).includes(personId))) ||
    db.notes.some((n) => n.participant_ids.includes(personId)) ||
    db.vendor_items.some((v) => v.contact_person_ids.includes(personId));
  return { open, any };
}

/** Hat die Person einen offenen Schritt in der Aufgabe? */
export const hasStepFor = (t: Pick<Task, "checklist">, personId: Id) => t.checklist.some((c) => !c.done && stepPersons(c).includes(personId));

/** Fortschritt der Schritte (Meilensteine zählen nicht mit). */
export function checklistProgress(t: Pick<Task, "checklist">): { done: number; total: number } {
  const steps = t.checklist.filter(isStep);
  return { done: steps.filter((c) => c.done).length, total: steps.length };
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

/** Offene und erledigte Aufgaben trennen; Erledigte nach Erledigt-Datum, neueste zuerst. */
export function splitDone(tasks: Task[]): { open: Task[]; done: Task[] } {
  const doneKey = (t: Task) => t.done_at ?? t.updated_at;
  return {
    open: tasks.filter((t) => t.status !== "done"),
    done: tasks.filter((t) => t.status === "done").sort((a, b) => (doneKey(a) < doneKey(b) ? 1 : -1)),
  };
}
