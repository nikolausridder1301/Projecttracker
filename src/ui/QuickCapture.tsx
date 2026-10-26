import { Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLookups, useStore } from "../data/store";
import type { Id, Link, Note, NoteKind, Task } from "../data/types";
import { formatDate, todayIso } from "../logic/dates";
import { isValidUrl, overarchingCompany, validateTask } from "../logic/tasks";
import { ChipSelect, CompaniesChip } from "./common";
import { useUi, type CaptureType } from "./uiState";
import { NoteForm } from "../pages/Notes";
import { TaskForm } from "./tasks";
import { ImportPanel } from "./ImportPanel";

// „+ Neu“ (SPEC 6.5): dasselbe Formular wie beim Öffnen eines Eintrags – nur mit Reitern für die Art
// und „Speichern“ statt sofortigem Speichern. Alle Arten bleiben im selben Fenster.

const TYPES: [CaptureType, string][] = [
  ["task", "Aufgabe"],
  ["note", "Notiz"],
  ["meeting", "Protokoll"],
  ["decision", "Entscheidung"],
  ["link", "Link"],
];

const DEFAULT_TITLE: Record<NoteKind, string> = { note: "Notiz", meeting: "Meeting", decision: "Entscheidung" };
const SAVED_LABEL: Record<NoteKind, string> = { note: "Notiz gespeichert", meeting: "Protokoll gespeichert", decision: "Entscheidung gespeichert" };
const DRAFT_TITLE_KEY = "projecttracker-draft:capture-title";

const isNoteType = (t: CaptureType): t is NoteKind => t === "note" || t === "meeting" || t === "decision";

const readDraftTitle = () => {
  try {
    return localStorage.getItem(DRAFT_TITLE_KEY) ?? "";
  } catch {
    return "";
  }
};
const writeDraftTitle = (v: string) => {
  try {
    if (v) localStorage.setItem(DRAFT_TITLE_KEY, v);
    else localStorage.removeItem(DRAFT_TITLE_KEY);
  } catch {
    /* ignorieren */
  }
};

export function QuickCapture() {
  const { capture, closeCapture, context } = useUi();
  if (!capture) return null;
  return <CaptureDialog key={JSON.stringify(capture)} onClose={closeCapture} prefill={capture} context={context} />;
}

function CaptureDialog({
  prefill,
  context,
  onClose,
}: {
  prefill: NonNullable<ReturnType<typeof useUi>["capture"]>;
  context: ReturnType<typeof useUi>["context"];
  onClose: () => void;
}) {
  const { insert, toast, project } = useStore();
  const { companies, me } = useLookups();
  const { openNote, openCapture } = useUi();

  const defaultCompany = prefill.companyId ?? context.companyId ?? overarchingCompany(companies)?.id ?? "";
  const startCompanies: Id[] = prefill.companyIds ?? (defaultCompany ? [defaultCompany] : []);
  const startAssignees = prefill.assigneeIds ?? (context.personId ? [context.personId] : []);
  const startTitle = prefill.title ?? readDraftTitle();

  const newTask = (title: string): Task => ({
    id: "draft",
    project_id: project?.id ?? "",
    created_at: "",
    updated_at: "",
    deleted_at: null,
    title,
    description: "",
    company_ids: startCompanies,
    topic_id: null,
    assignee_person_ids: startAssignees,
    assignee_me: false,
    status: "open",
    blocked_reason: "",
    priority: "medium",
    due_date: null,
    follow_up_date: null,
    done_at: null,
    checklist: [],
    source_note_id: prefill.sourceNoteId ?? null,
  });
  const newNote = (kind: NoteKind, title: string): Note => ({
    id: "draft",
    project_id: project?.id ?? "",
    created_at: "",
    updated_at: "",
    deleted_at: null,
    title,
    body: "",
    kind,
    company_ids: startCompanies,
    topic_id: null,
    meeting_date: kind === "note" ? null : todayIso(),
    participant_ids: kind === "meeting" && me ? [me.id] : [],
    participants_text: "",
  });
  const newLink = (title: string): Pick<Link, "title" | "url" | "company_ids" | "category_id" | "description"> => ({
    title,
    url: "",
    company_ids: startCompanies,
    category_id: null,
    description: "",
  });

  const [type, setType] = useState<CaptureType>(prefill.type ?? "task");
  const [task, setTask] = useState<Task>(() => newTask(startTitle));
  const [note, setNote] = useState<Note>(() => newNote(isNoteType(prefill.type ?? "task") ? (prefill.type as NoteKind) : "note", startTitle));
  const [link, setLink] = useState(() => newLink(startTitle));
  const [busy, setBusy] = useState(false);
  // Rückfrage bei ungespeicherten Änderungen: Ziel-Reiter bzw. null = Fenster schließen
  const [pending, setPending] = useState<{ to: CaptureType | null } | null>(null);
  const [formKey, setFormKey] = useState(0);
  // „Upload“: Datei (Protokoll, Transkript, E-Mail …) von der KI auswerten lassen
  const [importing, setImporting] = useState(false);

  const activeTitle = type === "task" ? task.title : type === "link" ? link.title : note.title;
  // Titel als Entwurf merken (überlebt versehentliches Schließen)
  useEffect(() => writeDraftTitle(activeTitle), [activeTitle]);

  // Was beim Wechseln verloren ginge: Text einer Notiz bzw. Schritte/Meilensteine einer Aufgabe
  const dirty = (isNoteType(type) && note.body.trim() !== "") || (type === "task" && task.checklist.length > 0);

  const reset = (to: CaptureType, title = "") => {
    setTask(newTask(title));
    setNote(newNote(isNoteType(to) ? to : "note", title));
    setLink(newLink(title));
    setType(to);
    setFormKey((k) => k + 1);
  };

  const requestClose = () => (dirty ? setPending({ to: null }) : onClose());
  const switchTo = (t: CaptureType) => {
    if (t === type) return;
    if (dirty) return setPending({ to: t });
    reset(t, activeTitle);
  };

  const closeRef = useRef(requestClose);
  closeRef.current = pending ? () => setPending(null) : requestClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** Speichern; `next`: danach im Fenster zum Reiter wechseln, sonst schließen. Liefert die neue Notiz (für „Aufgabe hinzufügen“). */
  const save = async (next?: CaptureType): Promise<Note | boolean> => {
    const fail = (msg: string) => {
      toast(msg, "error");
      return false;
    };
    setBusy(true);
    try {
      let created: Note | undefined;
      if (type === "task") {
        const err = validateTask({ title: task.title, status: task.status, blocked_reason: task.blocked_reason });
        if (err) return fail(err);
        if (task.company_ids.length === 0) return fail("Bitte mindestens eine Firma wählen.");
        await insert("tasks", [
          {
            title: task.title.trim(),
            description: "",
            company_ids: task.company_ids,
            topic_id: null,
            assignee_person_ids: task.assignee_person_ids,
            assignee_me: task.assignee_person_ids.length > 0 && task.assignee_me,
            status: task.status,
            blocked_reason: task.blocked_reason,
            priority: task.priority,
            due_date: task.due_date,
            follow_up_date: null,
            done_at: null,
            checklist: task.checklist,
            source_note_id: prefill.sourceNoteId ?? null,
          },
        ]);
        toast("Aufgabe angelegt", "info");
      } else if (isNoteType(type)) {
        if (!note.title.trim() && !note.body.trim()) return fail("Bitte einen Titel oder Text eingeben.");
        if (note.company_ids.length === 0) return fail("Bitte mindestens eine Firma wählen.");
        [created] = await insert("notes", [
          {
            title: note.title.trim() || `${DEFAULT_TITLE[type]} – ${formatDate(todayIso())}`,
            body: note.body,
            kind: type,
            company_ids: note.company_ids,
            topic_id: null,
            meeting_date: note.meeting_date,
            participant_ids: type === "meeting" ? note.participant_ids : [],
            participants_text: note.participants_text,
          },
        ]);
        toast(SAVED_LABEL[type]);
      } else {
        if (!link.title.trim()) return fail("Bitte einen Titel eingeben.");
        if (!isValidUrl(link.url)) return fail("Bitte eine gültige Adresse mit http:// oder https:// eingeben.");
        const [l] = await insert("links", [
          {
            title: link.title.trim(),
            url: link.url.trim(),
            company_ids: link.company_ids,
            topic_id: null,
            category_id: link.category_id,
            description: link.description,
          },
        ]);
        if (prefill.attachTo) {
          await insert("attachments", [{ link_id: l.id, task_id: prefill.attachTo.taskId ?? null, note_id: prefill.attachTo.noteId ?? null }]);
        }
        toast("Link gespeichert");
      }
      writeDraftTitle("");
      if (next) reset(next);
      else onClose();
      return created ?? true;
    } catch {
      /* Fehler wurde gemeldet; Entwurf bleibt erhalten */
      return false;
    } finally {
      setBusy(false);
    }
  };

  // „Aufgabe hinzufügen“ im Protokoll-Entwurf: Protokoll speichern, öffnen und die Aufgabe daran erfassen
  const addTaskToNote = async () => {
    if (!isNoteType(type)) return;
    const others = note.participant_ids.filter((id) => id !== me?.id);
    const companyIds = note.company_ids;
    const res = await save();
    if (typeof res === "object") {
      openNote(res.id);
      openCapture({ type: "task", title: "", companyIds, assigneeIds: others.length === 1 ? others : undefined, sourceNoteId: res.id });
    }
  };

  const confirmSave = async () => {
    await save(pending?.to ?? undefined);
    setPending(null);
  };
  const confirmDiscard = () => {
    const to = pending?.to;
    writeDraftTitle("");
    setPending(null);
    if (to) reset(to);
    else onClose();
  };

  if (importing)
    return <ImportPanel focus={{ personId: startAssignees.length === 1 ? startAssignees[0] : null, companyId: defaultCompany || null }} onClose={onClose} />;

  return (
    <>
      <div className="panel-backdrop capture-layer" onClick={requestClose} />
      <aside
        className="panel wide capture-layer"
        aria-label="Neu anlegen"
        onKeyDown={(e) => {
          // Strg+Enter speichert aus jedem Feld
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void save();
          }
        }}
      >
        <div className="editor">
          <div className="panel-head">
            <div className="seg-group">
              {TYPES.map(([t, label]) => (
                <button type="button" key={t} className={`seg${type === t ? " active" : ""}`} onClick={() => switchTo(t)}>
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn small capture-upload"
              onClick={() => setImporting(true)}
              disabled={dirty}
              title={dirty ? "Erst speichern oder verwerfen" : "Protokoll, Transkript, E-Mail oder Dokument hochladen – die KI schlägt vor, du bestätigst"}
            >
              <Upload size={15} /> Upload
            </button>
            <span className="spacer" />
            <button className="icon-btn" onClick={requestClose} aria-label="Schließen" title="Schließen (Esc)">
              <X size={18} />
            </button>
          </div>

          {type === "task" && (
            <TaskForm
              key={`task-${formKey}`}
              draft
              task={task}
              onPatch={(p) => setTask((t) => ({ ...t, ...p }) as Task)}
              onTitleEnter={() => void save()}
            />
          )}
          {isNoteType(type) && (
            <NoteForm
              key={`note-${formKey}`}
              draft
              note={note}
              onPatch={(p) => setNote((n) => ({ ...n, ...p }) as Note)}
              onAddTask={() => void addTaskToNote()}
            />
          )}
          {type === "link" && <LinkDraftForm key={`link-${formKey}`} link={link} onChange={(p) => setLink((l) => ({ ...l, ...p }))} onEnter={() => void save()} />}

          <div className="capture-foot">
            <span className="muted small">Strg+Enter speichert</span>
            <span className="spacer" />
            <button type="button" className="btn primary" onClick={() => void save()} disabled={busy}>
              Speichern
            </button>
          </div>
        </div>
      </aside>

      {pending && (
        <div className="modal-backdrop confirm-layer" onMouseDown={(e) => e.target === e.currentTarget && setPending(null)}>
          <div className="modal confirm" role="alertdialog" aria-label="Änderungen speichern?">
            <h2>Änderungen speichern?</h2>
            <p className="muted">{pending.to ? "Deine Eingaben sind noch nicht gespeichert, bevor du die Art wechselst." : "Deine Eingaben sind noch nicht gespeichert."}</p>
            <div className="row">
              <button type="button" className="btn ghost" onClick={() => setPending(null)}>
                Zurück
              </button>
              <span className="spacer" />
              <button type="button" className="btn" onClick={confirmDiscard}>
                Verwerfen
              </button>
              <button type="button" className="btn primary" onClick={() => void confirmSave()} disabled={busy}>
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Link-Entwurf: Titel, Firma, Kategorie, Adresse, Beschreibung. */
function LinkDraftForm({
  link,
  onChange,
  onEnter,
}: {
  link: Pick<Link, "title" | "url" | "company_ids" | "category_id" | "description">;
  onChange: (p: Partial<Pick<Link, "title" | "url" | "company_ids" | "category_id" | "description">>) => void;
  onEnter: () => void;
}) {
  const { categories } = useLookups();
  const enter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onEnter();
    }
  };
  return (
    <>
      <div className="title-field">
        <input autoFocus className="capture-input" placeholder="Titel des Links" value={link.title} onChange={(e) => onChange({ title: e.target.value })} onKeyDown={enter} />
      </div>
      <div className="chips">
        <CompaniesChip value={link.company_ids} onChange={(ids) => onChange({ company_ids: ids })} />
        <ChipSelect
          title="Kategorie"
          value={link.category_id ?? ""}
          placeholder="Kategorie"
          options={[{ value: "", label: "Keine Kategorie" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
          onChange={(c) => onChange({ category_id: c || null })}
        />
      </div>
      {/* Wie bei allen Arten: Chips direkt unter dem Titel, weitere Felder darunter – damit beim Wechseln nichts springt */}
      <input placeholder="https://…sharepoint.com/…" value={link.url} onChange={(e) => onChange({ url: e.target.value })} onKeyDown={enter} />
      <input placeholder="Beschreibung (optional)" value={link.description} onChange={(e) => onChange({ description: e.target.value })} onKeyDown={enter} />
    </>
  );
}
