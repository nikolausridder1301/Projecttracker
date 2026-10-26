// KI-Vorschläge aus Protokollen/E-Mails: Kontext für die KI, Bereinigung der Antwort
// und ein einfacher Ersatz für den Demo-Modus. Angelegt wird erst nach Bestätigung.
import type { Company, Id, IsoDate, Person, Task } from "../data/types";
import { isActive, isOpen } from "./tasks";

export interface ProposedNote {
  title: string;
  kind: "meeting" | "note";
  summary: string;
  meeting_date: IsoDate | null;
  company_ids: Id[];
  participant_ids: Id[];
}
export interface ProposedDecision {
  title: string;
  body: string;
  company_ids: Id[];
  quote: string;
}
export interface ProposedTask {
  title: string;
  /** Hintergrund, damit die Aufgabe später ohne das Dokument verständlich ist */
  context: string;
  company_ids: Id[];
  assignee_person_ids: Id[];
  due_date: IsoDate | null;
  steps: string[];
  quote: string;
}
export interface ProposedStep {
  task_id: Id;
  text: string;
  person_ids: Id[];
  due: IsoDate | null;
  quote: string;
}
export interface Proposal {
  note: ProposedNote | null;
  decisions: ProposedDecision[];
  tasks: ProposedTask[];
  steps: ProposedStep[];
}

export interface AnalyzeContext {
  me: { id: Id | null; name: string };
  companies: { id: Id; name: string; short: string }[];
  people: { id: Id; name: string; company: string; role: string }[];
  open_tasks: { id: Id; title: string; companies: string[] }[];
  /** Vorauswahl aus der Meeting-Seite */
  focus: { person_id: Id | null; company_id: Id | null };
}

/** Was die KI über das Projekt wissen muss – nur Namen und IDs, keine Inhalte. */
export function buildContext(
  db: { companies: Company[]; people: Person[]; tasks: Task[] },
  me: Person | undefined,
  focus: { personId?: Id | null; companyId?: Id | null } = {},
): AnalyzeContext {
  const companies = db.companies.filter(isActive);
  const short = (id: Id | null) => companies.find((c) => c.id === id)?.short ?? "";
  return {
    me: { id: me?.id ?? null, name: me?.name ?? "Nikolaus Ridder" },
    companies: companies.map((c) => ({ id: c.id, name: c.name, short: c.short })),
    people: db.people.filter((p) => isActive(p) && p.active).map((p) => ({ id: p.id, name: p.name, company: short(p.company_id), role: p.role })),
    open_tasks: db.tasks.filter((t) => isActive(t) && isOpen(t)).map((t) => ({ id: t.id, title: t.title, companies: t.company_ids.map(short) })),
    focus: { person_id: focus.personId ?? null, company_id: focus.companyId ?? null },
  };
}

const iso = (v: unknown): IsoDate | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Antwort der KI absichern: nur bekannte IDs, gültige Daten, keine leeren Einträge. */
export function sanitizeProposal(raw: unknown, ctx: AnalyzeContext): Proposal {
  const r = (raw ?? {}) as Record<string, unknown>;
  const companyIds = new Set(ctx.companies.map((c) => c.id));
  const personIds = new Set(ctx.people.map((p) => p.id));
  const taskIds = new Set(ctx.open_tasks.map((t) => t.id));
  const ids = (v: unknown, known: Set<Id>) => [...new Set(arr(v).filter((x): x is string => typeof x === "string" && known.has(x)))];
  // Ich bin keine „andere Person“ – verantwortlich bin ich ohnehin, wenn niemand eingetragen ist
  const others = (v: unknown) => ids(v, personIds).filter((id) => id !== ctx.me.id);
  const fallbackCompanies = ctx.focus.company_id ? [ctx.focus.company_id] : [];
  const withCompany = (list: Id[]) => (list.length ? list : fallbackCompanies);

  const n = r.note as Record<string, unknown> | null | undefined;
  const note: ProposedNote | null =
    n && (str(n.title) || str(n.summary))
      ? {
          title: str(n.title),
          kind: n.kind === "note" ? "note" : "meeting",
          summary: str(n.summary),
          meeting_date: iso(n.meeting_date),
          company_ids: withCompany(ids(n.company_ids, companyIds)),
          participant_ids: ids(n.participant_ids, personIds),
        }
      : null;

  return {
    note,
    decisions: arr(r.decisions)
      .map((d) => d as Record<string, unknown>)
      .filter((d) => str(d.title))
      .map((d) => ({ title: str(d.title), body: str(d.body), company_ids: withCompany(ids(d.company_ids, companyIds)), quote: str(d.quote) })),
    tasks: arr(r.tasks)
      .map((t) => t as Record<string, unknown>)
      .filter((t) => str(t.title))
      .map((t) => ({
        title: str(t.title),
        context: str(t.context),
        company_ids: withCompany(ids(t.company_ids, companyIds)),
        assignee_person_ids: others(t.assignee_person_ids),
        due_date: iso(t.due_date),
        steps: arr(t.steps).map(str).filter(Boolean),
        quote: str(t.quote),
      })),
    steps: arr(r.steps)
      .map((s) => s as Record<string, unknown>)
      .filter((s) => typeof s.task_id === "string" && taskIds.has(s.task_id) && str(s.text))
      .map((s) => ({ task_id: s.task_id as Id, text: str(s.text), person_ids: others(s.person_ids), due: iso(s.due), quote: str(s.quote) })),
  };
}

/**
 * Demo-Modus ohne KI: Zeilen mit „Aufgabe:“, „Entscheidung:“ bzw. „Schritt <Aufgabe>:“
 * werden zu Vorschlägen – nur um den Ablauf lokal zu testen.
 */
export function demoProposal(text: string, ctx: AnalyzeContext, today: IsoDate): Proposal {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/^[-*•]\s*/, "").trim());
  const after = (l: string, p: string) => l.slice(p.length).trim();
  const company = ctx.focus.company_id ? [ctx.focus.company_id] : ctx.companies[0] ? [ctx.companies[0].id] : [];
  const firstTask = ctx.open_tasks[0];
  return {
    note: {
      title: lines.find(Boolean)?.slice(0, 80) || "Meeting",
      kind: "meeting",
      summary: lines.filter(Boolean).slice(0, 5).map((l) => `- ${l}`).join("\n"),
      meeting_date: today,
      company_ids: company,
      participant_ids: [ctx.me.id, ctx.focus.person_id].filter((x): x is Id => !!x),
    },
    decisions: lines.filter((l) => /^entscheidung:/i.test(l)).map((l) => ({ title: after(l, "Entscheidung:"), body: "", company_ids: company, quote: l })),
    tasks: lines
      .filter((l) => /^aufgabe:/i.test(l))
      .map((l) => ({ title: after(l, "Aufgabe:"), context: `Aus dem Dokument: ${l}`, company_ids: company, assignee_person_ids: ctx.focus.person_id ? [ctx.focus.person_id] : [], due_date: null, steps: [], quote: l })),
    steps: firstTask
      ? lines.filter((l) => /^schritt:/i.test(l)).map((l) => ({ task_id: firstTask.id, text: after(l, "Schritt:"), person_ids: [], due: null, quote: l }))
      : [],
  };
}
