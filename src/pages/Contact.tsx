import { ArrowLeft, CheckCircle2, ClipboardCopy, Mail, NotebookPen, Pencil, Phone, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLookups, useStore } from "../data/store";
import { NOTE_KIND_LABEL, type Id, type Person, type Task } from "../data/types";
import { agendaText, buildBriefing, type Briefing, type MeetingTarget } from "../logic/briefing";
import { formatDate, todayIso } from "../logic/dates";
import { isOpen, stepPersons } from "../logic/tasks";
import { ageLabel, categoryDef, isOpenItem, statusDef } from "../logic/vendor";
import { Avatar, CompanyBadge, CompanyLogo, CompanySelect, Empty } from "../ui/common";
import { LinkRow } from "../ui/links";
import { CompanyMilestones } from "../ui/milestones";
import { TaskList, TaskRow, UpdateInput } from "../ui/tasks";
import { TrafficDialog, TrafficHistoryList, TrafficStatus } from "../ui/traffic";
import { NoteLink, useCaptureContext, useUi } from "../ui/uiState";
import { useVendor } from "../ui/vendor";
import { KIND_ICON } from "./Notes";
import { CATEGORY_ICON } from "./Tacto";

// Eine Ansicht für Firmen und Personen (auch auf der Meeting-Seite):
// Kopf mit Eckdaten, „Protokoll starten“/„Agenda kopieren“, darunter gleiche Reiter.

type Tab = "open" | "notes" | "links" | "ms" | "vendor" | "ampel";

export function CompanyDetailPage() {
  const { id } = useParams();
  const { db } = useStore();
  const c = db.companies.find((x) => x.id === id && x.deleted_at === null);
  if (!c) return <Empty>Firma nicht gefunden.</Empty>;
  return <DetailPage key={c.id} target={{ kind: "company", id: c.id }} />;
}

export function PersonDetailPage() {
  const { id } = useParams();
  const { db } = useStore();
  const p = db.people.find((x) => x.id === id && x.deleted_at === null);
  if (!p) return <Empty>Person nicht gefunden.</Empty>;
  return <DetailPage key={p.id} target={{ kind: "person", id: p.id }} />;
}

function DetailPage({ target }: { target: MeetingTarget }) {
  return (
    <div className="page">
      <div className="page-head">
        <Link to="/firmen" className="back-link">
          <ArrowLeft size={16} /> Firmen &amp; Personen
        </Link>
      </div>
      <ContactView target={target} />
    </div>
  );
}

export function ContactView({ target }: { target: MeetingTarget }) {
  const { db, insert, toast } = useStore();
  const { companies, personById } = useLookups();
  const { openNote } = useUi();
  const vendor = useVendor();
  const today = todayIso();
  const [tab, setTab] = useState<Tab>("open");
  const [trafficOpen, setTrafficOpen] = useState(false);
  const b = useMemo(() => buildBriefing(db, target, today), [db, target, today]);
  useCaptureContext(b.company?.id);

  const personName = (id: Id | null) => (id ? (personById.get(id)?.name ?? "") : "");

  const copyAgenda = async () => {
    try {
      await navigator.clipboard.writeText(agendaText(b, personName));
      toast("Agenda kopiert");
    } catch {
      toast("Kopieren nicht möglich – Browser hat den Zugriff verweigert", "error");
    }
  };

  const startProtocol = async () => {
    const companyId = b.company?.id ?? companies.find((c) => c.is_overarching)?.id ?? companies[0]?.id;
    if (!companyId) return;
    const who = b.person?.name ?? b.company?.name ?? "";
    try {
      const [n] = await insert("notes", [
        {
          title: `Meeting ${who} – ${formatDate(today)}`,
          body: agendaText(b, personName),
          kind: "meeting",
          company_ids: [companyId],
          topic_id: null,
          meeting_date: today,
          participant_ids: b.person ? [b.person.id] : [],
          participants_text: "",
        },
      ]);
      openNote(n.id);
    } catch {
      /* Fehler wurde gemeldet */
    }
  };

  const openCount = b.delegatedToPerson.length + b.myTasks.length + b.otherTasks.length;
  const company = target.kind === "company" ? b.company : undefined;
  // Anbieter-Punkte: auf der Anbieter-Firma selbst alle offenen, sonst die betroffenen
  const vendorItems = company?.is_external ? db.vendor_items.filter((i) => i.deleted_at === null && isOpenItem(i)) : b.vendorItems;

  const tabs: [Tab, string][] = [
    ["open", `Offen (${openCount})`],
    ["notes", `Notizen (${b.notes.length})`],
    ["links", `Links (${b.links.length})`],
    ...(company
      ? ([
          ["ms", "Meilensteine"],
          ...(vendor ? ([["vendor", `${vendor.name} (${vendorItems.length})`]] as [Tab, string][]) : []),
          ["ampel", "Ampel-Verlauf"],
        ] as [Tab, string][])
      : []),
  ];

  return (
    <>
      <div className="card contact-head">
        {b.person ? (
          <PersonHead person={b.person} />
        ) : company ? (
          <>
            <CompanyLogo company={company} size={56} />
            <div className="grow">
              <h1>{company.name}</h1>
              <div className="row">
                <TrafficStatus company={company} />
                <button className="btn small" onClick={() => setTrafficOpen(true)}>
                  Ampel ändern
                </button>
              </div>
              {company.traffic_comment && <p className="traffic-comment-text">{company.traffic_comment}</p>}
            </div>
          </>
        ) : null}
        <div className="contact-actions">
          <button className="btn" onClick={() => void copyAgenda()} title="Offene Punkte als Agenda kopieren">
            <ClipboardCopy size={16} /> <span className="btn-label">Agenda kopieren</span>
          </button>
          <button className="btn primary" onClick={() => void startProtocol()} title="Meeting-Protokoll mit Agenda anlegen">
            <NotebookPen size={16} /> Protokoll starten
          </button>
        </div>
        {company && <CompanyPeople companyId={company.id} people={b.contacts} />}
      </div>

      <div className="tabs">
        {tabs.map(([k, label]) => (
          <button key={k} className={`tab${tab === k ? " active" : ""}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "open" && <OpenTab b={b} />}
      {tab === "notes" &&
        (b.notes.length === 0 ? (
          <Empty>Keine Notizen.</Empty>
        ) : (
          <div className="card list-card">
            {b.notes.map((n) => {
              const Icon = KIND_ICON[n.kind];
              return (
                <NoteLink key={n.id} id={n.id} className="note-row">
                  <Icon size={18} className={`row-icon${n.kind === "decision" ? " tone-blue" : ""}`} aria-label={NOTE_KIND_LABEL[n.kind]} />
                  <span className="note-main">
                    <span className="task-title">{n.title}</span>
                    {n.body && <span className="task-sub">{n.body.replace(/[#*_>`[\]-]/g, "").replace(/\s+/g, " ").slice(0, 90)}</span>}
                  </span>
                  <span className="due">{formatDate(n.meeting_date ?? n.created_at.slice(0, 10))}</span>
                </NoteLink>
              );
            })}
          </div>
        ))}
      {tab === "links" &&
        (b.links.length === 0 ? (
          <Empty>Keine Links.</Empty>
        ) : (
          <div className="card">
            {b.links.map((l) => (
              <LinkRow key={l.id} link={l} />
            ))}
          </div>
        ))}
      {tab === "vendor" &&
        (vendorItems.length === 0 ? (
          <Empty>Keine offenen Punkte.</Empty>
        ) : (
          <div className="card list-card">
            {vendorItems.map((i) => {
              const Icon = CATEGORY_ICON[i.category];
              const sd = statusDef(i);
              return (
                <Link key={i.id} to={`/anbieter?id=${i.id}`} className="vendor-row">
                  <Icon size={18} className="row-icon" />
                  <span className="note-main">
                    <span className="task-title">{i.title}</span>
                    <span className="task-sub">{categoryDef(i.category).label}</span>
                  </span>
                  {sd && <span className={`status-pill${sd.tone ? ` tone-${sd.tone}` : ""}`}>{sd.label}</span>}
                  <span className="age">{ageLabel(i, today, vendor?.name)}</span>
                </Link>
              );
            })}
          </div>
        ))}
      {tab === "ms" && company && (
        <div className="card">
          <CompanyMilestones company={company} />
        </div>
      )}
      {tab === "ampel" && company && (
        <div className="card">
          <TrafficHistoryList companyId={company.id} />
        </div>
      )}
      {trafficOpen && company && <TrafficDialog company={company} onClose={() => setTrafficOpen(false)} />}
    </>
  );
}

/** Offene Punkte wie im Meeting: mit Update-Feld je Aufgabe; Erledigte auf Wunsch. */
function OpenTab({ b }: { b: Briefing }) {
  const { openCapture } = useUi();
  const [showDone, setShowDone] = useState(false);
  const hasTasks = b.delegatedToPerson.length + b.myTasks.length + b.otherTasks.length > 0;
  return (
    <div className="contact-open">
      {b.person && b.delegatedToPerson.length > 0 && (
        <Section title={`Offen bei ${b.person.name.split(" ")[0]}`} count={b.delegatedToPerson.length}>
          <UpdatableTasks tasks={b.delegatedToPerson} />
        </Section>
      )}
      {b.myTasks.length > 0 && (
        <Section title="Meine offenen Punkte" count={b.myTasks.length}>
          <UpdatableTasks tasks={b.myTasks} />
        </Section>
      )}
      {b.otherTasks.length > 0 && (
        <Section title={b.person ? "Weitere Offene der Firma" : "Delegiert"} count={b.otherTasks.length}>
          <UpdatableTasks tasks={b.otherTasks} />
        </Section>
      )}
      {!hasTasks && (
        <div className="card meeting-empty">
          <CheckCircle2 size={28} className="meeting-empty-icon" />
          <div className="grow">
            <div className="meeting-empty-title">Mit {b.person?.name.split(" ")[0] ?? b.company?.name} ist gerade nichts offen</div>
            <div className="muted small">Neue Punkte aus dem Gespräch legst du direkt hier an.</div>
          </div>
          <button className="btn" onClick={() => openCapture({ type: "task", companyId: b.company?.id })}>
            <Plus size={16} /> Aufgabe anlegen
          </button>
        </div>
      )}
      {b.doneTasks.length > 0 && (
        <>
          <button className="link-btn small" onClick={() => setShowDone(!showDone)}>
            {showDone ? "Erledigte ausblenden" : `${b.doneTasks.length} erledigte anzeigen`}
          </button>
          {showDone && (
            <div className="card done-list">
              <TaskList tasks={b.doneTasks} showCompany={!b.company || b.person !== undefined} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Kopf einer Person: Eckdaten, auf Klick bearbeitbar. */
function PersonHead({ person }: { person: Person }) {
  const { db, update, trash, toast } = useStore();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(person);
  const save = (patch: Partial<Person>) => void update("people", person.id, patch).catch(() => {});
  const blur = (k: "name" | "role" | "email" | "phone") => () => {
    if (k === "name" && !v.name.trim()) return setV({ ...v, name: person.name });
    if (v[k] !== person[k]) save({ [k]: v[k].trim() });
  };

  const remove = () => {
    const open = db.tasks.filter((t) => t.deleted_at === null && isOpen(t) && t.assignee_person_ids.includes(person.id)).length;
    if (open > 0) {
      toast(`${person.name} hat noch ${open} offene Aufgabe(n) – bitte stattdessen auf „inaktiv“ setzen.`, "error");
      return;
    }
    void trash("people", person.id, person.name).then(() => navigate("/firmen"));
  };

  return (
    <>
      <span className="contact-avatar">
        <Avatar name={person.name} />
      </span>
      <div className="grow">
        <h1>
          {person.name} {!person.active && <span className="badge">inaktiv</span>}
        </h1>
        <div className="row contact-meta">
          {person.company_id && (
            <Link to={`/firmen/${person.company_id}`}>
              <CompanyBadge id={person.company_id} />
            </Link>
          )}
          {person.role && <span className="muted">{person.role}</span>}
          {person.email && (
            <a href={`mailto:${encodeURIComponent(person.email)}`} className="muted">
              <Mail size={14} /> {person.email}
            </a>
          )}
          {person.phone && (
            <a href={`tel:${person.phone}`} className="muted">
              <Phone size={14} /> {person.phone}
            </a>
          )}
          <button className="link-btn small" onClick={() => setEditing(!editing)}>
            <Pencil size={13} /> {editing ? "Fertig" : "Bearbeiten"}
          </button>
        </div>
        {editing && (
          <div className="contact-edit">
            <div className="grid2">
              <label className="field">
                <span className="muted small">Name</span>
                <input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} onBlur={blur("name")} />
              </label>
              <label className="field">
                <span className="muted small">Firma</span>
                <CompanySelect value={person.company_id ?? ""} onChange={(c) => save({ company_id: c || null })} allowAll="– keine –" />
              </label>
              <label className="field">
                <span className="muted small">Rolle</span>
                <input value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })} onBlur={blur("role")} placeholder="z. B. Key-User Einkauf" />
              </label>
              <label className="field">
                <span className="muted small">E-Mail</span>
                <input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} onBlur={blur("email")} />
              </label>
              <label className="field">
                <span className="muted small">Telefon</span>
                <input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} onBlur={blur("phone")} />
              </label>
            </div>
            <div className="row">
              <label className="inline">
                <input type="checkbox" className="check" checked={person.active} onChange={(e) => save({ active: e.target.checked })} /> aktiv
              </label>
              <span className="spacer" />
              <button className="btn ghost small" onClick={remove}>
                Person löschen
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/** Personen einer Firma als kleine Einträge; „+ Person“ legt direkt hier an. */
export function CompanyPeople({ companyId, people, compact = false }: { companyId: Id | null; people: Person[]; compact?: boolean }) {
  const { db, insert } = useStore();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const open = useMemo(() => openPerPerson(db.tasks), [db.tasks]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await insert("people", [{ name: name.trim(), company_id: companyId, role: "", email: "", phone: "", active: true }]).catch(() => {});
    setName("");
  };

  return (
    <div className={`company-people${compact ? " compact" : ""}`}>
      {people.map((p) => (
        <Link key={p.id} to={`/personen/${p.id}`} className={`person-pill${p.active ? "" : " inactive"}`} title={p.role || p.name}>
          <Avatar name={p.name} />
          <span className="person-name">{p.name}</span>
          {!compact && p.role && <span className="muted small">{p.role}</span>}
          {(open.get(p.id) ?? 0) > 0 && <span className="person-count">{open.get(p.id)}</span>}
        </Link>
      ))}
      {adding ? (
        <form className="person-add" onSubmit={(e) => void add(e)}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => !name.trim() && setAdding(false)}
            onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
            placeholder="Name, Enter"
          />
        </form>
      ) : (
        <button className="person-pill add" onClick={() => setAdding(true)}>
          <Plus size={14} /> Person
        </button>
      )}
    </div>
  );
}

/** Offene Aufgaben je Person (verantwortlich oder mit offenem Schritt). */
export function openPerPerson(tasks: Task[]): Map<Id, number> {
  const m = new Map<Id, number>();
  for (const t of tasks) {
    if (t.deleted_at !== null || !isOpen(t)) continue;
    const ids = new Set([...t.assignee_person_ids, ...t.checklist.filter((c) => !c.done).flatMap(stepPersons)]);
    for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
  }
  return m;
}

/** Im Gespräch: zu jeder Aufgabe direkt den neuen Stand notieren. */
function UpdatableTasks({ tasks }: { tasks: Task[] }) {
  return (
    <div className="task-list">
      {tasks.map((t) => (
        <div key={t.id} className="update-row">
          <TaskRow task={t} />
          <UpdateInput taskId={t.id} compact />
        </div>
      ))}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="card">
      <h2 className="group-title">
        {title} <span className="muted">{count}</span>
      </h2>
      {children}
    </section>
  );
}
