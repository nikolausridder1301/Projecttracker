import type { ChecklistItem, Company, Id, IsoDate, Priority, Task, TaskFollowup } from "../data/types";
import { endOfWeek, localDate } from "./dates";

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

/** Nächster offener Schritt: zuerst der mit dem frühesten Datum, sonst der erste offene. */
export function nextStep(t: Pick<Task, "checklist">): ChecklistItem | undefined {
  const open = t.checklist.filter((c) => !c.done);
  const dated = open.filter((c) => c.due).sort((a, b) => (a.due! < b.due! ? -1 : 1));
  return dated[0] ?? open[0];
}

/** Frühestes Datum aus Aufgabe und offenen Schritten. */
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

// ---------------------------------------------------------------------------
// Verlauf: datierte Updates je Aufgabe (Tabelle task_followups)
// ---------------------------------------------------------------------------

/** Automatische Verlaufszeilen (Statuswechsel) – im Verlauf sichtbar, aber kein „Stand“. */
export function isStatusNote(note: string): boolean {
  return /^(✓ Erledigt|Wieder geöffnet|Blockiert: |Nicht mehr blockiert|Verantwortlich: )/.test(note);
}

/** Jüngstes Update je Aufgabe (ohne automatische Statuszeilen). */
export function latestUpdates(updates: TaskFollowup[]): Map<Id, TaskFollowup> {
  const m = new Map<Id, TaskFollowup>();
  for (const u of updates) {
    if (u.deleted_at !== null || isStatusNote(u.note)) continue;
    const cur = m.get(u.task_id);
    if (!cur || u.date > cur.date || (u.date === cur.date && u.created_at > cur.created_at)) m.set(u.task_id, u);
  }
  return m;
}

/** Tage seit dem letzten Update – ohne Update seit dem Anlegen. */
export function daysSinceUpdate(t: Pick<Task, "created_at">, last: Pick<TaskFollowup, "date"> | undefined, today: IsoDate): number {
  const since = last?.date ?? localDate(t.created_at);
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(since)) / 86_400_000));
}

/** „Update heute“, „Update gestern“, „seit 23 T. kein Update“ */
export function staleLabel(days: number, hasUpdate: boolean): string {
  if (!hasUpdate) return days === 0 ? "noch kein Update" : `seit ${days} T. kein Update`;
  if (days === 0) return "Update heute";
  if (days === 1) return "Update gestern";
  return `seit ${days} T. kein Update`;
}

/** Ab so vielen Tagen ohne Update wird es rot markiert. */
export const STALE_DAYS = 14;

/** „Stand 12.10.: …“ für Listen und Agenda. */
export function standText(u: Pick<TaskFollowup, "date" | "note">): string {
  const [, m, d] = u.date.split("-");
  return `Stand ${d}.${m}.: ${u.note}`;
}

/** Offene und erledigte Aufgaben trennen; Erledigte nach Erledigt-Datum, neueste zuerst. */
export function splitDone(tasks: Task[]): { open: Task[]; done: Task[] } {
  const doneKey = (t: Task) => t.done_at ?? t.updated_at;
  return {
    open: tasks.filter((t) => t.status !== "done"),
    done: tasks.filter((t) => t.status === "done").sort((a, b) => (doneKey(a) < doneKey(b) ? 1 : -1)),
  };
}
