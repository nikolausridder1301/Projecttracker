// „Was gehört zu X?“ – eine Logik für Firmen, Personen und Meetings:
// Detailansicht, Meeting-Seite, Agenda und Protokoll nutzen alle buildBriefing.
import type { Company, Db, Id, IsoDate, Link, Note, Person, Task, TaskFollowup, VendorItem } from "../data/types";
import { addDays, formatDate } from "./dates";
import { compareTasks, hasStepFor, isActive, latestUpdates, standText, stepPersons } from "./tasks";
import { affectsCompany, isOpenItem, statusDef } from "./vendor";

export type MeetingTarget = { kind: "person"; id: Id } | { kind: "company"; id: Id };

export interface Briefing {
  person?: Person;
  company?: Company;
  /** an die Person delegiert, offen */
  delegatedToPerson: Task[];
  /** meine eigenen offenen Aufgaben für die Firma */
  myTasks: Task[];
  /** weitere offene Aufgaben der Firma (bei anderen Personen) */
  otherTasks: Task[];
  vendorItems: VendorItem[];
  /** seit dem letzten Treffen (bzw. 14 Tagen) erledigt */
  doneSince: Task[];
  doneSinceDate: IsoDate;
  /** alle erledigten Aufgaben zu X, neueste zuerst */
  doneTasks: Task[];
  /** Notizen, Protokolle, Entscheidungen zu X, neueste zuerst */
  notes: Note[];
  links: Link[];
  /** Personen der Firma (bei Firmen) */
  contacts: Person[];
  lastMeeting?: Note;
  topics: { id: Id; name: string; count: number }[];
  /** letzter Stand je Aufgabe (Verlauf) */
  lastUpdate: Map<Id, TaskFollowup>;
}

/** Blockierte zuerst, dann wie gewohnt nach Fälligkeit/Priorität. */
const byUrgency = (a: Task, b: Task) =>
  a.status === "blocked" && b.status !== "blocked" ? -1 : b.status === "blocked" && a.status !== "blocked" ? 1 : compareTasks(a, b);

export function buildBriefing(db: Db, target: MeetingTarget, today: IsoDate, topicFilter: Id | null = null): Briefing {
  const person = target.kind === "person" ? db.people.find((p) => p.id === target.id) : undefined;
  const companyId = target.kind === "company" ? target.id : (person?.company_id ?? null);
  const company = companyId ? db.companies.find((c) => c.id === companyId) : undefined;

  const topicOk = (t: { topic_id: Id | null }) => !topicFilter || t.topic_id === topicFilter;
  const tasks = db.tasks.filter(isActive);
  const open = tasks.filter((t) => t.status !== "done");

  // Bei der Person offen: ihr zugeordnet oder sie hat einen offenen nächsten Schritt
  const delegatedToPerson = person ? open.filter((t) => t.assignee_person_ids.includes(person.id) || hasStepFor(t, person.id)) : [];
  const delegatedIds = new Set(delegatedToPerson.map((t) => t.id));
  const myTasks = companyId ? open.filter((t) => t.company_ids.includes(companyId) && t.assignee_person_ids.length === 0) : [];
  const otherTasks = companyId
    ? open.filter((t) => t.company_ids.includes(companyId) && t.assignee_person_ids.length > 0 && !delegatedIds.has(t.id))
    : [];

  const vendorItems = companyId
    ? db.vendor_items.filter((v) => isActive(v) && isOpenItem(v) && affectsCompany(v, companyId))
    : [];

  // Letztes Treffen: jüngstes Protokoll mit der Person als Teilnehmer, sonst mit der Firma
  const meetings = db.notes
    .filter((n) => isActive(n) && n.kind === "meeting")
    .filter((n) => (person ? n.participant_ids.includes(person.id) : companyId !== null && n.company_ids.includes(companyId)))
    .sort((a, b) => noteDate(b).localeCompare(noteDate(a)));
  const lastMeeting = meetings.find((n) => noteDate(n) <= today);
  const doneSinceDate = lastMeeting ? noteDate(lastMeeting) : addDays(today, -14);

  // Person: verantwortlich oder mit Schritt; Firma: betroffen
  const relevant = (t: Task) =>
    person
      ? t.assignee_person_ids.includes(person.id) || t.checklist.some((c) => stepPersons(c).includes(person.id))
      : companyId !== null && t.company_ids.includes(companyId);
  const doneTasks = tasks.filter((t) => t.status === "done" && relevant(t)).sort((a, b) => ((a.done_at ?? "") < (b.done_at ?? "") ? 1 : -1));
  const doneSince = tasks
    .filter((t) => t.status === "done" && relevant(t) && (t.done_at ?? t.updated_at).slice(0, 10) >= doneSinceDate)
    .sort((a, b) => ((a.done_at ?? "") < (b.done_at ?? "") ? 1 : -1));

  const notes = db.notes
    .filter(isActive)
    .filter((n) => (companyId !== null && n.company_ids.includes(companyId)) || (person && n.participant_ids.includes(person.id)))
    .sort((a, b) => noteDate(b).localeCompare(noteDate(a)));

  // Themen, die im Briefing vorkommen (vor dem Filtern gezählt)
  const counts = new Map<Id, number>();
  for (const x of [...delegatedToPerson, ...myTasks, ...otherTasks, ...vendorItems]) {
    if (x.topic_id) counts.set(x.topic_id, (counts.get(x.topic_id) ?? 0) + 1);
  }
  const topics = [...counts.entries()]
    .map(([id, count]) => ({ id, name: db.topics.find((t) => t.id === id)?.name ?? "?", count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "de"));

  return {
    person,
    company,
    delegatedToPerson: delegatedToPerson.filter(topicOk).sort(byUrgency),
    myTasks: myTasks.filter(topicOk).sort(byUrgency),
    otherTasks: otherTasks.filter(topicOk).sort(byUrgency),
    vendorItems: vendorItems.filter(topicOk),
    doneSince: doneSince.filter(topicOk),
    doneSinceDate,
    doneTasks: doneTasks.filter(topicOk),
    notes: notes.filter(topicOk),
    links: companyId !== null ? db.links.filter((l) => isActive(l) && l.company_ids.includes(companyId)).sort((a, b) => a.title.localeCompare(b.title, "de")) : [],
    contacts: target.kind === "company" ? db.people.filter((p) => isActive(p) && p.company_id === companyId).sort((a, b) => a.name.localeCompare(b.name, "de")) : [],
    lastMeeting,
    topics,
    lastUpdate: latestUpdates(db.task_followups),
  };
}

const noteDate = (n: Note) => n.meeting_date ?? n.created_at.slice(0, 10);

/** Agenda als Markdown-Checkliste – für „Protokoll starten“ und „Agenda kopieren“. */
export function agendaText(b: Briefing, personName: (id: Id) => string): string {
  const line = (t: Task) => {
    const extra = [
      t.status === "blocked" ? `blockiert: ${t.blocked_reason}` : "",
      t.due_date ? `fällig ${formatDate(t.due_date)}` : "",
      t.assignee_person_ids
        .filter((id) => id !== b.person?.id)
        .map(personName)
        .join(", "),
    ].filter(Boolean);
    const stand = b.lastUpdate.get(t.id);
    const steps = t.checklist
      .filter((c) => !c.done)
      .map((c) => {
        const info = [stepPersons(c).map(personName).join(", "), c.due ? `bis ${formatDate(c.due)}` : ""].filter(Boolean);
        return `\n  - [ ] ${c.text}${info.length ? ` (${info.join(", ")})` : ""}`;
      })
      .join("");
    return `- [ ] ${t.title}${extra.length ? ` (${extra.join(", ")})` : ""}${stand ? `\n  ${standText(stand)}` : ""}${steps}`;
  };
  const parts: string[] = [];
  const section = (title: string, rows: string[]) => {
    if (rows.length) parts.push(`## ${title}`, ...rows, "");
  };
  section(b.person ? `Offen bei ${b.person.name}` : "Delegiert", b.delegatedToPerson.map(line));
  section("Meine offenen Punkte", b.myTasks.map(line));
  section("Weitere offene Punkte", b.otherTasks.map(line));
  section(
    "Anbieter-Themen",
    b.vendorItems.map((v) => `- [ ] ${v.title}${statusDef(v) ? ` (${statusDef(v)!.label})` : ""}`),
  );
  if (parts.length === 0) return "Keine offenen Punkte.";
  return parts.join("\n").trim();
}
