import { useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLookups, useStore } from "../data/store";
import { NOTE_KIND_LABEL, type Id, type Note, type NoteKind } from "../data/types";
import { formatDate } from "../logic/dates";
import { isActive } from "../logic/tasks";
import { AttachedLinks } from "../ui/links";
import { CompanyBadge, CompanySelect, Empty, Markdown, TopicSelect, usePersisted } from "../ui/common";
import { TaskList } from "../ui/tasks";
import { useCaptureContext, useUi } from "../ui/uiState";

interface NoteFilter {
  kind: NoteKind | "";
  company: Id | "";
  topic: Id | "";
  q: string;
}

const KIND_ICON: Record<NoteKind, string> = { note: "✎", meeting: "👥", decision: "⚖" };

export function NotesPage() {
  const { db } = useStore();
  const { topicById } = useLookups();
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
        <span className="muted">{notes.length} Einträge</span>
        <span className="spacer" />
        <button className="btn primary" onClick={() => openCapture({ type: "note" })}>
          + Notiz
        </button>
      </div>
      <div className="filters">
        <div className="seg-group">
          <button className={`seg${f.kind === "" ? " active" : ""}`} onClick={() => set({ kind: "" })}>
            Alle
          </button>
          {(Object.keys(NOTE_KIND_LABEL) as NoteKind[]).map((k) => (
            <button key={k} className={`seg${f.kind === k ? " active" : ""}`} onClick={() => set({ kind: k })}>
              {KIND_ICON[k]} {NOTE_KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <CompanySelect value={f.company} onChange={(v) => set({ company: v })} allowAll="Alle Firmen" />
        <TopicSelect value={f.topic} onChange={(v) => set({ topic: v })} emptyLabel="Alle Themen" />
        <input placeholder="Text filtern…" value={f.q} onChange={(e) => set({ q: e.target.value })} />
      </div>
      {notes.length === 0 ? (
        <Empty>Keine Notizen für diese Filter.</Empty>
      ) : (
        <div className="card">
          {notes.map((n) => (
            <Link key={n.id} to={`/notizen/${n.id}`} className="note-row">
              <span className="note-icon" title={NOTE_KIND_LABEL[n.kind]}>
                {KIND_ICON[n.kind]}
              </span>
              <span className="note-main">
                <span className="task-title">{n.title}</span>
                <span className="task-meta">
                  <CompanyBadge id={n.company_id} />
                  {n.topic_id && <span className="muted">{topicById.get(n.topic_id)?.name}</span>}
                  <span className="muted small">{excerpt(n.body)}</span>
                </span>
              </span>
              <span className="muted small">{formatDate(noteDate(n))}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const noteDate = (n: Note) => n.meeting_date ?? n.created_at.slice(0, 10);
const excerpt = (s: string) => s.replace(/[#*_>`[\]()-]/g, "").replace(/\s+/g, " ").slice(0, 90);

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
  const { people } = useLookups();
  const { openCapture } = useUi();
  const navigate = useNavigate();
  useCaptureContext(note.company_id, note.topic_id ?? undefined);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [editing, setEditing] = useState(note.body === "");
  const [participantsText, setParticipantsText] = useState(note.participants_text);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const save = (patch: Parameters<typeof update<"notes">>[2]) => void update("notes", note.id, patch).catch(() => {});

  const derived = db.tasks.filter((t) => isActive(t) && t.source_note_id === note.id);

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
      participant_ids: note.participant_ids.includes(pid)
        ? note.participant_ids.filter((x) => x !== pid)
        : [...note.participant_ids, pid],
    });

  return (
    <div className="page narrow">
      <div className="page-head">
        <Link to="/notizen" className="muted">
          ← Notizen
        </Link>
        <span className="spacer" />
        <button className="btn ghost" onClick={() => void trash("notes", note.id, note.title).then(() => navigate("/notizen"))}>
          Löschen
        </button>
      </div>

      <div className="card editor">
        <input
          className="title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => (title.trim() ? title !== note.title && save({ title: title.trim() }) : setTitle(note.title))}
        />
        <div className="grid4">
          <div className="field">
            <label>Art</label>
            <select value={note.kind} onChange={(e) => save({ kind: e.target.value as NoteKind })}>
              {(Object.keys(NOTE_KIND_LABEL) as NoteKind[]).map((k) => (
                <option key={k} value={k}>
                  {NOTE_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Firma</label>
            <CompanySelect value={note.company_id} onChange={(v) => save({ company_id: v })} />
          </div>
          <div className="field">
            <label>Thema</label>
            <TopicSelect value={note.topic_id ?? ""} onChange={(v) => save({ topic_id: v || null })} />
          </div>
          <div className="field">
            <label>{note.kind === "meeting" ? "Meeting-Datum" : "Datum"}</label>
            <input type="date" value={note.meeting_date ?? ""} onChange={(e) => save({ meeting_date: e.target.value || null })} />
          </div>
        </div>

        {note.kind === "meeting" && (
          <div className="field">
            <label>Teilnehmer</label>
            <div className="multi-companies">
              {people
                .filter((p) => p.active || note.participant_ids.includes(p.id))
                .map((p) => (
                  <label key={p.id} className="inline chip-check">
                    <input type="checkbox" checked={note.participant_ids.includes(p.id)} onChange={() => toggleParticipant(p.id)} />
                    {p.name}
                  </label>
                ))}
            </div>
            <input
              placeholder="Weitere Teilnehmer (Freitext)"
              value={participantsText}
              onChange={(e) => setParticipantsText(e.target.value)}
              onBlur={() => participantsText !== note.participants_text && save({ participants_text: participantsText })}
            />
          </div>
        )}

        <div className="section-head">
          <h3>Inhalt</h3>
          <span className="spacer" />
          {editing && (
            <button className="btn" onMouseDown={(e) => e.preventDefault()} onClick={taskFromSelection} title="Markierten Text als Aufgabe übernehmen">
              ✓ Aufgabe daraus
            </button>
          )}
          <button
            className="btn ghost"
            onClick={() => {
              if (editing && body !== note.body) save({ body });
              setEditing(!editing);
            }}
          >
            {editing ? "Vorschau" : "Bearbeiten"}
          </button>
        </div>
        {editing ? (
          <textarea
            ref={textRef}
            autoFocus
            rows={18}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onBlur={() => body !== note.body && save({ body })}
            placeholder={"Markdown möglich:\n## Überschrift\n- Punkt\n- [ ] offene Aktion\n**fett**, [Link](https://…)\n\nTipp: Text markieren → „Aufgabe daraus“"}
          />
        ) : body.trim() ? (
          <div onDoubleClick={() => setEditing(true)}>
            <Markdown text={body} />
          </div>
        ) : (
          <button className="link-btn muted" onClick={() => setEditing(true)}>
            + Inhalt schreiben
          </button>
        )}
      </div>

      <section className="card">
        <div className="section-head">
          <h3>Aufgaben aus dieser Notiz</h3>
          <span className="spacer" />
          <button className="btn ghost" onClick={taskFromSelection}>
            + Aufgabe
          </button>
        </div>
        <TaskList tasks={derived} empty="Noch keine Aufgaben verknüpft." />
      </section>

      <section className="card">
        <div className="section-head">
          <h3>Links</h3>
          <span className="spacer" />
          <button
            className="btn ghost"
            onClick={() => openCapture({ type: "link", companyId: note.company_id, topicId: note.topic_id ?? undefined, attachTo: { noteId: note.id } })}
          >
            + Neuer Link
          </button>
        </div>
        <AttachedLinks target={{ noteId: note.id }} />
      </section>
    </div>
  );
}
