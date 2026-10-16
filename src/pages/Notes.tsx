import { CalendarDays, CheckSquare, Gavel, NotebookPen, Plus, Trash2, Users, X, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLookups, useStore } from "../data/store";
import { NOTE_KIND_LABEL, type Id, type Note, type NoteKind } from "../data/types";
import { formatDate } from "../logic/dates";
import { isActive } from "../logic/tasks";
import { AttachedLinks } from "../ui/links";
import { AutoText, ChipDate, ChipSelect, CompanyBadge, CompanyFilter, Disclosure, Empty, usePersisted } from "../ui/common";
import { TaskList } from "../ui/tasks";
import { NoteLink, useCaptureContext, useUi } from "../ui/uiState";

interface NoteFilter {
  kind: NoteKind | "";
  /** leer = alle Firmen */
  companies: Id[];
  topic: Id | "";
  q: string;
}

export const KIND_ICON: Record<NoteKind, LucideIcon> = { note: NotebookPen, meeting: Users, decision: Gavel };

export function NotesPage() {
  const { db } = useStore();
  const [stored, setF] = usePersisted<NoteFilter>("notes", { kind: "", companies: [], topic: "", q: "" });
  const f = { ...stored, companies: Array.isArray(stored.companies) ? stored.companies : [] };
  useCaptureContext(f.companies.length === 1 ? f.companies[0] : undefined);
  const set = (p: Partial<NoteFilter>) => setF({ ...f, ...p });

  const notes = useMemo(() => {
    const q = f.q.toLowerCase();
    return db.notes
      .filter(isActive)
      .filter((n) => !f.kind || n.kind === f.kind)
      .filter((n) => f.companies.length === 0 || f.companies.includes(n.company_id))
      .filter((n) => !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q))
      .sort((a, b) => noteDate(b).localeCompare(noteDate(a)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.notes, stored]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Notizen</h1>
        <span className="muted">{notes.length}</span>
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
        <CompanyFilter value={f.companies} onChange={(v) => set({ companies: v })} />
        <input className="compact" placeholder="Filtern…" value={f.q} onChange={(e) => set({ q: e.target.value })} />
      </div>
      {notes.length === 0 ? (
        <Empty>Keine Notizen.</Empty>
      ) : (
        <div className="card list-card">
          {notes.map((n) => {
            const Icon = KIND_ICON[n.kind];
            return (
              <NoteLink key={n.id} id={n.id} className="note-row">
                <Icon size={18} className="row-icon" aria-label={NOTE_KIND_LABEL[n.kind]} />
                <span className="note-main">
                  <span className="task-title">{n.title}</span>
                  {n.body && <span className="task-sub">{excerpt(n.body)}</span>}
                </span>
                <CompanyBadge id={n.company_id} />
                <span className="due">{formatDate(noteDate(n))}</span>
              </NoteLink>
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

/** Direktlink /notizen/:id: Liste zeigen und die Notiz als Pop-up öffnen. */
export function NoteDetailPage() {
  const { id } = useParams();
  const { openNote } = useUi();
  const navigate = useNavigate();
  useEffect(() => {
    if (id) openNote(id);
    navigate("/notizen", { replace: true });
  }, [id, openNote, navigate]);
  return null;
}

/**
 * Gerade über „+ Neu“ angelegte Notizen: Wird so eine Notiz unverändert
 * wieder geschlossen, verschwindet sie – es bleiben keine leeren Einträge.
 */
export const freshNotes = new Set<Id>();

/** Notiz, Protokoll oder Entscheidung als Pop-up-Panel – gleich wie bei Aufgaben. */
export function NotePanel() {
  const { openNoteId, openNote, openTaskId, capture } = useUi();
  const { db } = useStore();
  const note = db.notes.find((n) => n.id === openNoteId && n.deleted_at === null);
  // Der Editor hängt hier ein, was beim Schließen noch zu tun ist (Ungespeichertes sichern)
  const beforeClose = useRef<(() => void) | null>(null);
  const close = useRef(() => {});
  close.current = () => {
    beforeClose.current?.();
    beforeClose.current = null;
    openNote(null);
  };

  useEffect(() => {
    if (!openNoteId) return;
    // Esc schließt zuerst Erfassung bzw. eine darüber geöffnete Aufgabe
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !openTaskId && !capture && close.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openNoteId, openTaskId, capture]);

  if (!note) return null;
  return (
    <>
      <div className="panel-backdrop" onClick={() => close.current()} />
      <aside className="panel wide" aria-label="Notiz">
        <NoteEditor key={note.id} note={note} onClose={() => close.current()} beforeClose={beforeClose} />
      </aside>
    </>
  );
}

function NoteEditor({
  note,
  onClose,
  beforeClose,
}: {
  note: Note;
  onClose: () => void;
  beforeClose: React.MutableRefObject<(() => void) | null>;
}) {
  const { db, update, trash, purge } = useStore();
  const { people, companies } = useLookups();
  const { openCapture } = useUi();
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [participantsText, setParticipantsText] = useState(note.participants_text);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const fresh = freshNotes.has(note.id);

  const save = (patch: Parameters<typeof update<"notes">>[2]) => void update("notes", note.id, patch).catch(() => {});

  const derived = db.tasks.filter((t) => isActive(t) && t.source_note_id === note.id);
  const attachedCount = db.attachments.filter((a) => a.deleted_at === null && a.note_id === note.id).length;

  // Neu angelegt: Titel markiert – einfach lostippen, Tab springt in den Text
  useEffect(() => {
    if (!fresh) return;
    titleRef.current?.focus();
    titleRef.current?.select();
  }, [fresh]);

  // Beim Schließen: unverändert neue Notiz verwerfen, sonst noch nicht Gespeichertes sichern
  beforeClose.current = () => {
    const untouched =
      fresh &&
      !body.trim() &&
      title.trim() === note.title &&
      !participantsText.trim() &&
      note.participant_ids.length === 0 &&
      derived.length === 0 &&
      attachedCount === 0;
    freshNotes.delete(note.id);
    if (untouched) {
      void purge("notes", note.id).catch(() => {});
      return;
    }
    const patch: Parameters<typeof update<"notes">>[2] = {};
    if (title.trim() && title.trim() !== note.title) patch.title = title.trim();
    if (body !== note.body) patch.body = body;
    if (participantsText !== note.participants_text) patch.participants_text = participantsText;
    if (Object.keys(patch).length > 0) save(patch);
  };

  const taskFromSelection = () => {
    const el = textRef.current;
    const sel = el ? el.value.slice(el.selectionStart, el.selectionEnd).trim() : "";
    openCapture({
      type: "task",
      title: sel.replace(/^[-*]\s*(\[ \]\s*)?/, "").split("\n")[0],
      companyId: note.company_id,
      sourceNoteId: note.id,
    });
  };

  const toggleParticipant = (pid: Id) =>
    save({
      participant_ids: note.participant_ids.includes(pid) ? note.participant_ids.filter((x) => x !== pid) : [...note.participant_ids, pid],
    });

  const participantCount = note.participant_ids.length + (note.participants_text.trim() ? 1 : 0);

  return (
    <div className="editor">
      <div className="panel-head">
        <span className="spacer" />
        <button
          className="icon-btn"
          title="In den Papierkorb"
          onClick={() => {
            beforeClose.current = null;
            freshNotes.delete(note.id);
            void trash("notes", note.id, note.title).then(onClose);
          }}
        >
          <Trash2 size={16} />
        </button>
        <button className="icon-btn" onClick={onClose} aria-label="Schließen" title="Schließen (Esc)">
          <X size={18} />
        </button>
      </div>
        <div className="title-field">
          <AutoText
            textRef={titleRef}
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
                openCapture({ type: "link", companyId: note.company_id, attachTo: { noteId: note.id } })
              }
            >
              <Plus size={16} />
            </button>
          }
        >
          <AttachedLinks target={{ noteId: note.id }} />
        </Disclosure>
    </div>
  );
}
