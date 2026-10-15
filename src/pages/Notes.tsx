import { ArrowLeft, CalendarDays, CheckSquare, Gavel, NotebookPen, Plus, Trash2, Users, type LucideIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLookups, useStore } from "../data/store";
import { NOTE_KIND_LABEL, type Id, type Note, type NoteKind } from "../data/types";
import { formatDate } from "../logic/dates";
import { isActive } from "../logic/tasks";
import { AttachedLinks } from "../ui/links";
import { AutoText, ChipDate, ChipSelect, CompanyBadge, CompanySelect, Disclosure, Empty, TopicSelect, usePersisted } from "../ui/common";
import { TaskList } from "../ui/tasks";
import { useCaptureContext, useUi } from "../ui/uiState";

interface NoteFilter {
  kind: NoteKind | "";
  company: Id | "";
  topic: Id | "";
  q: string;
}

export const KIND_ICON: Record<NoteKind, LucideIcon> = { note: NotebookPen, meeting: Users, decision: Gavel };

export function NotesPage() {
  const { db } = useStore();
  const { openCapture } = useUi();
  const [f, setF] = usePersisted<NoteFilter>("notes", { kind: "", company: "", topic: "", q: "" });
  useCaptureContext(f.company || undefined, f.topic || undefined);
  const set = (p: Partial<NoteFilter>) => setF({ ...f, ...p });

  const notes = useMemo(() => {
    const q = f.q.toLowerCase();
    return db.notes
      .filter(isActive)
      .filter((n) => !f.kind || n.kind === f.kind)
      .filter((n) => !f.company || n.company_id === f.company)
      .filter((n) => !f.topic || n.topic_id === f.topic)
      .filter((n) => !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q))
      .sort((a, b) => noteDate(b).localeCompare(noteDate(a)));
  }, [db.notes, f]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Notizen</h1>
        <span className="muted">{notes.length}</span>
        <span className="spacer" />
        <button className="btn primary" onClick={() => openCapture({ type: "note" })}>
          <Plus size={16} /> Notiz
        </button>
      </div>
      <div className="filters">
        <div className="seg-group">
          <button className={`seg${f.kind === "" ? " active" : ""}`} onClick={() => set({ kind: "" })}>
            Alle
          </button>
          {(Object.keys(NOTE_KIND_LABEL) as NoteKind[]).map((k) => (
            <button key={k} className={`seg${f.kind === k ? " active" : ""}`} onClick={() => set({ kind: k })}>
              {k === "meeting" ? "Protokolle" : k === "decision" ? "Entscheidungen" : "Notizen"}
            </button>
          ))}
        </div>
        <CompanySelect className="compact" value={f.company} onChange={(v) => set({ company: v })} allowAll="Alle Firmen" />
        <TopicSelect className="compact" value={f.topic} onChange={(v) => set({ topic: v })} emptyLabel="Alle Themen" />
        <input className="compact" placeholder="Filtern…" value={f.q} onChange={(e) => set({ q: e.target.value })} />
      </div>
      {notes.length === 0 ? (
        <Empty>Keine Notizen.</Empty>
      ) : (
        <div className="card list-card">
          {notes.map((n) => {
            const Icon = KIND_ICON[n.kind];
            return (
              <Link key={n.id} to={`/notizen/${n.id}`} className="note-row">
                <Icon size={18} className="row-icon" aria-label={NOTE_KIND_LABEL[n.kind]} />
                <span className="note-main">
                  <span className="task-title">{n.title}</span>
                  {n.body && <span className="task-sub">{excerpt(n.body)}</span>}
                </span>
                <CompanyBadge id={n.company_id} />
                <span className="due">{formatDate(noteDate(n))}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

const noteDate = (n: Note) => n.meeting_date ?? n.created_at.slice(0, 10);
const excerpt = (s: string) => s.replace(/[#*_>`[\]()-]/g, "").replace(/\s+/g, " ").slice(0, 100);

// ---------------------------------------------------------------------------

export function NoteDetailPage() {
  const { id } = useParams();
  const { db } = useStore();
  const note = db.notes.find((n) => n.id === id);
  if (!note) return <Empty>Notiz nicht gefunden.</Empty>;
  if (note.deleted_at) return <Empty>Diese Notiz liegt im Papierkorb.</Empty>;
  return <NoteEditor key={note.id} note={note} />;
}

function NoteEditor({ note }: { note: Note }) {
  const { db, update, trash } = useStore();
  const { people, companies, topics } = useLookups();
  const { openCapture } = useUi();
  const navigate = useNavigate();
  useCaptureContext(note.company_id, note.topic_id ?? undefined);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [participantsText, setParticipantsText] = useState(note.participants_text);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const save = (patch: Parameters<typeof update<"notes">>[2]) => void update("notes", note.id, patch).catch(() => {});

  const derived = db.tasks.filter((t) => isActive(t) && t.source_note_id === note.id);
  const attachedCount = db.attachments.filter((a) => a.deleted_at === null && a.note_id === note.id).length;

  const taskFromSelection = () => {
    const el = textRef.current;
    const sel = el ? el.value.slice(el.selectionStart, el.selectionEnd).trim() : "";
    openCapture({
      type: "task",
      title: sel.replace(/^[-*]\s*(\[ \]\s*)?/, "").split("\n")[0],
      companyId: note.company_id,
      topicId: note.topic_id ?? undefined,
      sourceNoteId: note.id,
    });
  };

  const toggleParticipant = (pid: Id) =>
    save({
      participant_ids: note.participant_ids.includes(pid) ? note.participant_ids.filter((x) => x !== pid) : [...note.participant_ids, pid],
    });

  const participantCount = note.participant_ids.length + (note.participants_text.trim() ? 1 : 0);

  return (
    <div className="page narrow">
      <div className="page-head">
        <Link to="/notizen" className="back-link">
          <ArrowLeft size={16} /> Notizen
        </Link>
        <span className="spacer" />
        <button className="icon-btn" title="In den Papierkorb" onClick={() => void trash("notes", note.id, note.title).then(() => navigate("/notizen"))}>
          <Trash2 size={16} />
        </button>
      </div>

      <div className="card editor">
        <div className="title-field">
          <AutoText
            value={title}
            onChange={(v) => setTitle(v.replace(/\n/g, " "))}
            onBlur={() => (title.trim() ? title !== note.title && save({ title: title.trim() }) : setTitle(note.title))}
            minRows={1}
            placeholder="Titel"
          />
        </div>
        <div className="chips">
          <ChipSelect
            title="Art"
            value={note.kind}
            options={(Object.keys(NOTE_KIND_LABEL) as NoteKind[]).map((k) => ({ value: k, label: NOTE_KIND_LABEL[k] }))}
            onChange={(v) => save({ kind: v as NoteKind })}
          />
          <ChipSelect
            title="Firma"
            value={note.company_id}
            options={companies.map((c) => ({ value: c.id, label: c.short }))}
            onChange={(v) => save({ company_id: v })}
          />
          <ChipSelect
            title="Thema"
            value={note.topic_id ?? ""}
            placeholder="Thema"
            options={[
              { value: "", label: "Kein Thema" },
              ...topics.filter((t) => !t.archived || t.id === note.topic_id).map((t) => ({ value: t.id, label: t.name })),
            ]}
            onChange={(v) => save({ topic_id: v || null })}
          />
          <ChipDate
            icon={<CalendarDays size={14} />}
            title="Datum"
            value={note.meeting_date}
            onChange={(v) => save({ meeting_date: v })}
            placeholder="Datum"
            format={formatDate}
          />
          <button className="chip" onClick={taskFromSelection} title="Markierten Text als Aufgabe übernehmen" onMouseDown={(e) => e.preventDefault()}>
            <CheckSquare size={14} />
            <span className="chip-text">Aufgabe daraus</span>
          </button>
        </div>

        <AutoText
          textRef={textRef}
          value={body}
          onChange={setBody}
          onBlur={() => body !== note.body && save({ body })}
          minRows={10}
          placeholder={"Schreiben…\n\nTipp: Zeile markieren und „Aufgabe daraus“ klicken."}
        />

        {note.kind === "meeting" && (
          <Disclosure title="Teilnehmer" meta={participantCount > 0 ? participantCount : undefined} defaultOpen={participantCount === 0}>
            <div className="chip-checks">
              {people
                .filter((p) => p.active || note.participant_ids.includes(p.id))
                .map((p) => (
                  <label key={p.id} className={`chip${note.participant_ids.includes(p.id) ? " tone-blue" : " chip-empty"}`}>
                    <input type="checkbox" className="sr-only" checked={note.participant_ids.includes(p.id)} onChange={() => toggleParticipant(p.id)} />
                    <span className="chip-text">{p.name}</span>
                  </label>
                ))}
            </div>
            <input
              className="plain-input"
              placeholder="Weitere Teilnehmer…"
              value={participantsText}
              onChange={(e) => setParticipantsText(e.target.value)}
              onBlur={() => participantsText !== note.participants_text && save({ participants_text: participantsText })}
            />
          </Disclosure>
        )}

        <Disclosure title="Aufgaben" meta={derived.length > 0 ? derived.length : undefined} defaultOpen={derived.length > 0}>
          <TaskList tasks={derived} empty="Noch keine. Text markieren und „Aufgabe daraus“ klicken." />
        </Disclosure>

        <Disclosure
          title="Links"
          meta={attachedCount > 0 ? attachedCount : undefined}
          defaultOpen={attachedCount > 0}
          action={
            <button
              className="icon-btn"
              title="Neuer Link"
              onClick={() =>
                openCapture({ type: "link", companyId: note.company_id, topicId: note.topic_id ?? undefined, attachTo: { noteId: note.id } })
              }
            >
              <Plus size={16} />
            </button>
          }
        >
          <AttachedLinks target={{ noteId: note.id }} />
        </Disclosure>
      </div>
    </div>
  );
}
