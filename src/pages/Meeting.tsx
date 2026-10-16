import { CheckCircle2, ChevronDown, ClipboardCopy, NotebookPen, Plus } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLookups, useStore } from "../data/store";
import { NOTE_KIND_LABEL, type Id, type Task } from "../data/types";
import { agendaText, buildBriefing, type MeetingTarget } from "../logic/briefing";
import { formatDate, todayIso } from "../logic/dates";
import { ageLabel, statusDef } from "../logic/vendor";
import { Avatar, CompanyLogo, Dropdown, Empty, usePersisted } from "../ui/common";
import { TaskRow, UpdateInput } from "../ui/tasks";
import { NoteLink, useCaptureContext, useUi } from "../ui/uiState";
import { useVendor } from "../ui/vendor";
import { KIND_ICON } from "./Notes";
import { CATEGORY_ICON } from "./Tacto";

// Meeting-Vorbereitung: Person oder Firma wählen → alles Relevante auf einen Blick,
// mit Agenda und Protokoll-Start.

const parseTarget = (v: string): MeetingTarget | null =>
  v.startsWith("p:") ? { kind: "person", id: v.slice(2) } : v.startsWith("c:") ? { kind: "company", id: v.slice(2) } : null;

export function MeetingPage() {
  const { db, insert, toast } = useStore();
  const { people, companies, companyById, personById } = useLookups();
  const vendor = useVendor();
  const { openCapture, openNote } = useUi();
  const [params, setParams] = useSearchParams();
  const [saved, setSaved] = usePersisted<{ target: string }>("meeting", { target: "" });
  const today = todayIso();

  // Aufruf von Personen-/Firmenseite (?p=… / ?c=…) übernimmt die Auswahl
  useEffect(() => {
    const p = params.get("p");
    const c = params.get("c");
    if (p || c) {
      setSaved({ target: p ? `p:${p}` : `c:${c}` });
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // Nur gültige Auswahl im aktuellen Projekt
  const target = useMemo(() => {
    const t = parseTarget(saved.target);
    if (!t) return null;
    const exists = t.kind === "person" ? people.some((p) => p.id === t.id) : companies.some((c) => c.id === t.id);
    return exists ? t : null;
  }, [saved.target, people, companies]);

  const briefing = useMemo(() => (target ? buildBriefing(db, target, today) : null), [db, target, today]);
  useCaptureContext(briefing?.company?.id);

  const options = [
    ...people
      .filter((p) => p.active)
      .map((p) => ({ value: `p:${p.id}`, label: `${p.name}${p.company_id ? ` · ${companyById.get(p.company_id)?.short ?? ""}` : ""}` })),
    ...companies.map((c) => ({ value: `c:${c.id}`, label: `${c.name} (ganze Firma)` })),
  ];
  const currentLabel = briefing
    ? briefing.person
      ? `${briefing.person.name}${briefing.company ? ` · ${briefing.company.name}` : ""}`
      : `${briefing.company?.name ?? ""} (ganze Firma)`
    : "Mit wem triffst du dich?";

  const personName = (id: Id | null) => (id ? (personById.get(id)?.name ?? "") : "");

  const copyAgenda = async () => {
    if (!briefing) return;
    try {
      await navigator.clipboard.writeText(agendaText(briefing, personName));
      toast("Agenda kopiert");
    } catch {
      toast("Kopieren nicht möglich – Browser hat den Zugriff verweigert", "error");
    }
  };

  const startProtocol = async () => {
    if (!briefing) return;
    const companyId = briefing.company?.id ?? companies.find((c) => c.is_overarching)?.id ?? companies[0]?.id;
    if (!companyId) return;
    const who = briefing.person?.name ?? briefing.company?.name ?? "";
    try {
      const [n] = await insert("notes", [
        {
          title: `Meeting ${who} – ${formatDate(today)}`,
          body: agendaText(briefing, personName),
          kind: "meeting",
          company_ids: [companyId],
          topic_id: null,
          meeting_date: today,
          participant_ids: briefing.person ? [briefing.person.id] : [],
          participants_text: "",
        },
      ]);
      openNote(n.id);
    } catch {
      /* Fehler wurde gemeldet */
    }
  };

  const b = briefing;
  const hasTasks = b ? b.delegatedToPerson.length + b.myTasks.length + b.otherTasks.length > 0 : false;
  // Rechte Spalte nur, wenn es Anbieter-Punkte oder Notizen gibt – sonst volle Breite
  const hasSide = b ? (vendor !== undefined && b.vendorItems.length > 0) || b.notes.length > 0 : false;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Meeting</h1>
        <span className="spacer" />
        {b && (
          <>
            <button className="btn" onClick={() => void copyAgenda()} title="Offene Punkte als Agenda kopieren">
              <ClipboardCopy size={16} /> <span className="btn-label">Agenda kopieren</span>
            </button>
            <button className="btn primary" onClick={() => void startProtocol()} title="Meeting-Protokoll mit Agenda anlegen">
              <NotebookPen size={16} /> Protokoll starten
            </button>
          </>
        )}
      </div>

      <Dropdown value={saved.target} options={options} onChange={(v) => setSaved({ target: v })} title="Mit wem triffst du dich?">
        {(props) => (
          <button type="button" {...props} className={`meeting-picker${b ? "" : " empty"}`}>
            {b?.person ? <Avatar name={b.person.name} /> : b?.company ? <CompanyLogo company={b.company} size={24} /> : null}
            <span className="grow">{currentLabel}</span>
            <ChevronDown size={18} className="chip-caret" />
          </button>
        )}
      </Dropdown>

      {!b ? (
        <Empty>Wähle eine Person oder Firma – dann siehst du alle offenen Punkte und Notizen für das Gespräch.</Empty>
      ) : (
        <div className={`meeting-grid${hasSide ? "" : " single"}`}>
          <div className="meeting-col">
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
          </div>
          {hasSide && (
            <div className="meeting-col">
              {vendor && b.vendorItems.length > 0 && (
                <Section title={vendor.name} count={b.vendorItems.length}>
                  {b.vendorItems.map((v) => {
                    const Icon = CATEGORY_ICON[v.category];
                    const sd = statusDef(v);
                    return (
                      <Link key={v.id} to={`/anbieter?id=${v.id}`} className="vendor-row">
                        <Icon size={18} className="row-icon" />
                        <span className="note-main">
                          <span className="task-title">{v.title}</span>
                          <span className="task-sub">{ageLabel(v, today, vendor.name)}</span>
                        </span>
                        {sd && <span className={`status-pill${sd.tone ? ` tone-${sd.tone}` : ""}`}>{sd.label}</span>}
                      </Link>
                    );
                  })}
                </Section>
              )}
              {b.notes.length > 0 && (
                <Section title="Letzte Notizen" count={b.notes.length}>
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
                </Section>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Im Gespräch: zu jeder Aufgabe direkt den neuen Stand notieren. */
function UpdatableTasks({ tasks }: { tasks: Task[] }) {
  return (
    <div className="task-list">
      {tasks.map((t) => (
        <div key={t.id} className="update-row">
          <TaskRow task={t} showCompany={false} />
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
