// „Was gehört zu X?“ – eine Logik für Firmen, Personen und Meetings:
// Detailansicht, Meeting-Seite, Agenda und Protokoll nutzen alle buildBriefing.
import type { Company, Db, Id, IsoDate, Link, Note, Person, Task, TaskFollowup, VendorItem } from "../data/types";
import { formatDate, localDate } from "./dates";
import { compareTasks, hasStepFor, isActive, latestUpdates, standText, stepPersons } from "./tasks";
import { affectsCompany, isOpenItem, statusDef } from "./vendor";

export type MeetingTarget = { kind: "person"; id: Id } | { kind: "company"; id: Id };

export interface Briefing {
  person?: Person;
  company?: Company;
  /** bei der Person offen: verantwortlich oder mit offenem Schritt */
  delegatedToPerson: Task[];
  /** meine eigenen offenen Aufgaben für die Firma */
  myTasks: Task[];
  /** weitere offene Aufgaben der Firma (bei anderen Personen) */
  otherTasks: Task[];
  /** offene Anbieter-Punkte, die zu X gehören */
  vendorItems: VendorItem[];
  /** alle erledigten Aufgaben zu X, neueste zuerst */
  doneTasks: Task[];
  /** Notizen, Protokolle, Entscheidungen zu X, neueste zuerst */
  notes: Note[];
  links: Link[];
  /** Personen der Firma (bei Firmen) */
  contacts: Person[];
  /** heutiges Protokoll mit X – „Protokoll starten“ öffnet dann dieses statt ein zweites */
  todayMeeting?: Note;
  /** letzter Stand je Aufgabe (Verlauf) */
  lastUpdate: Map<Id, TaskFollowup>;
}

/** Überschriften der Bereiche – gleich in Ansicht und Agenda. */
export function sectionTitles(b: Pick<Briefing, "person">) {
  return {
    delegated: b.person ? `Offen bei ${b.person.name.split(" ")[0]}` : "Offen bei Personen",
    mine: "Meine offenen Punkte",
    other: b.person ? "Weitere offene Punkte der Firma" : "Delegiert",
  };
}

/** Blockierte zuerst, dann wie gewohnt nach Fälligkeit/Wichtig. */
const byUrgency = (a: Task, b: Task) =>
  a.status === "blocked" && b.status !== "blocked" ? -1 : b.status === "blocked" && a.status !== "blocked" ? 1 : compareTasks(a, b);

const noteDate = (n: Note) => n.meeting_date ?? localDate(n.created_at);

export function buildBriefing(db: Db, target: MeetingTarget, today: IsoDate): Briefing {
  const person = target.kind === "person" ? db.people.find((p) => p.id === target.id) : undefined;
  const companyId = target.kind === "company" ? target.id : (person?.company_id ?? null);
  const company = companyId ? db.companies.find((c) => c.id === companyId) : undefined;

  const tasks = db.tasks.filter(isActive);
  const open = tasks.filter((t) => t.status !== "done");

  // Bei der Person offen: ihr zugeordnet oder sie hat einen offenen nächsten Schritt
  const delegatedToPerson = person ? open.filter((t) => t.assignee_person_ids.includes(person.id) || hasStepFor(t, person.id)) : [];
  const delegatedIds = new Set(delegatedToPerson.map((t) => t.id));
  const myTasks = companyId ? open.filter((t) => t.company_ids.includes(companyId) && t.assignee_person_ids.length === 0 && !delegatedIds.has(t.id)) : [];
  const otherTasks = companyId
    ? open.filter((t) => t.company_ids.includes(companyId) && t.assignee_person_ids.length > 0 && !delegatedIds.has(t.id))
    : [];

  // Anbieter-Punkte: Anbieter-Firma bzw. deren Leute → alle offenen; Firma → was sie betrifft;
  // Person einer Gesellschaft → wo sie Ansprechpartner ist oder ihre Firma ausdrücklich genannt ist
  const openItems = db.vendor_items.filter((v) => isActive(v) && isOpenItem(v));
  const isVendorCompany = company?.is_external === true;
  const vendorItems = person
    ? openItems.filter(
        (v) => isVendorCompany || v.contact_person_ids.includes(person.id) || (companyId !== null && v.company_ids.includes(companyId)),
      )
    : companyId
      ? openItems.filter((v) => isVendorCompany || affectsCompany(v, companyId))
      : [];

  // Person: verantwortlich oder mit Schritt; Firma: betroffen
  const relevant = (t: Task) =>
    person
      ? t.assignee_person_ids.includes(person.id) || t.checklist.some((c) => stepPersons(c).includes(person.id))
      : companyId !== null && t.company_ids.includes(companyId);
  const doneTasks = tasks.filter((t) => t.status === "done" && relevant(t)).sort((a, b) => ((a.done_at ?? "") < (b.done_at ?? "") ? 1 : -1));

  const notes = db.notes
    .filter(isActive)
    .filter((n) => (companyId !== null && n.company_ids.includes(companyId)) || (person && n.participant_ids.includes(person.id)))
    .sort((a, b) => noteDate(b).localeCompare(noteDate(a)));

  const todayMeeting = notes.find(
    (n) =>
      n.kind === "meeting" &&
      noteDate(n) === today &&
      (person ? n.participant_ids.includes(person.id) : companyId !== null && n.company_ids.includes(companyId)),
  );

  return {
    person,
    company,
    delegatedToPerson: delegatedToPerson.sort(byUrgency),
    myTasks: myTasks.sort(byUrgency),
    otherTasks: otherTasks.sort(byUrgency),
    vendorItems,
    doneTasks,
    notes,
    links: companyId !== null ? db.links.filter((l) => isActive(l) && l.company_ids.includes(companyId)).sort((a, b) => a.title.localeCompare(b.title, "de")) : [],
    contacts: target.kind === "company" ? db.people.filter((p) => isActive(p) && p.company_id === companyId).sort((a, b) => a.name.localeCompare(b.name, "de")) : [],
    todayMeeting,
    lastUpdate: latestUpdates(db.task_followups),
  };
}

/** Agenda als Markdown-Checkliste – für „Agenda kopieren“. */
export function agendaText(b: Briefing, personName: (id: Id) => string, vendorName = "Anbieter"): string {
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
  const titles = sectionTitles(b);
  const parts: string[] = [];
  const section = (title: string, rows: string[]) => {
    if (rows.length) parts.push(`## ${title}`, ...rows, "");
  };
  section(titles.delegated, b.delegatedToPerson.map(line));
  section(titles.mine, b.myTasks.map(line));
  section(titles.other, b.otherTasks.map(line));
  section(
    `${vendorName}-Punkte`,
    b.vendorItems.map((v) => `- [ ] ${v.title}${statusDef(v) ? ` (${statusDef(v)!.label})` : ""}`),
  );
  if (parts.length === 0) return "Keine offenen Punkte.";
  return parts.join("\n").trim();
}
