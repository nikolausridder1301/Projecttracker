// Meeting-Briefing: alles Relevante für ein Gespräch mit einer Person bzw. Firma.
import type { Company, Db, Id, IsoDate, Note, Person, Task, VendorItem } from "../data/types";
import { addDays, formatDate } from "./dates";
import { compareTasks, isActive } from "./tasks";
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
  notes: Note[];
  lastMeeting?: Note;
  topics: { id: Id; name: string; count: number }[];
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

  const delegatedToPerson = person ? open.filter((t) => t.assignee_person_id === person.id) : [];
  const delegatedIds = new Set(delegatedToPerson.map((t) => t.id));
  const myTasks = companyId ? open.filter((t) => t.company_id === companyId && t.assignee_person_id === null) : [];
  const otherTasks = companyId
    ? open.filter((t) => t.company_id === companyId && t.assignee_person_id !== null && !delegatedIds.has(t.id))
    : [];

  const vendorItems = companyId
    ? db.vendor_items.filter((v) => isActive(v) && isOpenItem(v) && affectsCompany(v, companyId))
    : [];

  // Letztes Treffen: jüngstes Protokoll mit der Person als Teilnehmer, sonst mit der Firma
  const meetings = db.notes
    .filter((n) => isActive(n) && n.kind === "meeting")
    .filter((n) => (person ? n.participant_ids.includes(person.id) : n.company_id === companyId))
    .sort((a, b) => noteDate(b).localeCompare(noteDate(a)));
  const lastMeeting = meetings.find((n) => noteDate(n) <= today);
  const doneSinceDate = lastMeeting ? noteDate(lastMeeting) : addDays(today, -14);

  const relevant = (t: Task) => (person && t.assignee_person_id === person.id) || (companyId !== null && t.company_id === companyId);
  const doneSince = tasks
    .filter((t) => t.status === "done" && relevant(t) && (t.done_at ?? t.updated_at).slice(0, 10) >= doneSinceDate)
    .sort((a, b) => ((a.done_at ?? "") < (b.done_at ?? "") ? 1 : -1));

  const notes = db.notes
    .filter(isActive)
    .filter((n) => (companyId !== null && n.company_id === companyId) || (person && n.participant_ids.includes(person.id)))
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
    notes: notes.filter(topicOk).slice(0, 6),
    lastMeeting,
    topics,
  };
}

const noteDate = (n: Note) => n.meeting_date ?? n.created_at.slice(0, 10);

/** Agenda als Markdown-Checkliste – für „Protokoll starten“ und „Agenda kopieren“. */
export function agendaText(b: Briefing, personName: (id: Id | null) => string): string {
  const line = (t: Task) => {
    const extra = [
      t.status === "blocked" ? `blockiert: ${t.blocked_reason}` : "",
      t.due_date ? `fällig ${formatDate(t.due_date)}` : "",
      t.assignee_person_id && t.assignee_person_id !== b.person?.id ? personName(t.assignee_person_id) : "",
    ].filter(Boolean);
    return `- [ ] ${t.title}${extra.length ? ` (${extra.join(", ")})` : ""}`;
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
