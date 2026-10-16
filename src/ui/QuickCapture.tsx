import { useEffect, useState } from "react";
import { useLookups, useStore } from "../data/store";
import type { Id, NoteKind, Priority } from "../data/types";
import { formatDate, relativeLabel, todayIso } from "../logic/dates";
import { isValidUrl, overarchingCompany } from "../logic/tasks";
import { ChipDate, ChipSelect, CompaniesChip, ImportantChip, useDraft } from "./common";
import { useUi, type CaptureType } from "./uiState";
import { freshNotes } from "../pages/Notes";
import { AssigneeChip, type Assignees } from "./tasks";

// Schnellerfassung (SPEC 6.5): Titel + Enter genügt, alles andere optional.

const TYPES: [CaptureType, string][] = [
  ["task", "Aufgabe"],
  ["note", "Notiz"],
  ["meeting", "Protokoll"],
  ["decision", "Entscheidung"],
  ["link", "Link"],
];

const DEFAULT_TITLE: Record<NoteKind, string> = { note: "Notiz", meeting: "Meeting", decision: "Entscheidung" };

const PLACEHOLDER: Record<CaptureType, string> = {
  task: "Was ist zu tun?",
  note: "Titel der Notiz",
  meeting: "Worum ging es im Meeting?",
  decision: "Was wurde entschieden?",
  link: "Titel des Links",
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
  const { insert, toast } = useStore();
  const { companies, categories } = useLookups();
  const { openTask, openNote } = useUi();

  const defaultCompany = prefill.companyId ?? context.companyId ?? overarchingCompany(companies)?.id ?? "";
  const [type, setType] = useState<CaptureType>(prefill.type ?? "task");
  const [title, setTitle, clearTitle] = useDraft("capture-title", "", prefill.title);
  // Eine oder mehrere Firmen – für Aufgaben, Notizen und Links gleich
  const [companyIds, setCompanyIds] = useState<Id[]>(prefill.companyIds ?? (defaultCompany ? [defaultCompany] : []));
  const initialAssignees = prefill.assigneeIds ?? (context.personId ? [context.personId] : []);
  const [assignees, setAssignees] = useState<Assignees>({ ids: initialAssignees, me: initialAssignees.length === 0 });
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [url, setUrl] = useState("");
  const [categoryId, setCategoryId] = useState<Id | "">("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /**
   * Notiz, Protokoll, Entscheidung: sofort anlegen und im Pop-up öffnen –
   * dort wird geschrieben. Bleibt sie unverändert, verschwindet sie beim Schließen wieder.
   */
  const createNote = async (kind: NoteKind) => {
    if (busy) return;
    setBusy(true);
    try {
      const typed = title.trim();
      const [n] = await insert("notes", [
        {
          title: typed || `${DEFAULT_TITLE[kind]} – ${formatDate(todayIso())}`,
          body: "",
          kind,
          company_ids: companyIds,
          topic_id: null,
          meeting_date: kind === "note" ? null : todayIso(),
          participant_ids: [],
          participants_text: "",
        },
      ]);
      if (!typed) freshNotes.add(n.id);
      clearTitle();
      onClose();
      openNote(n.id);
    } catch {
      /* Fehler wurde gemeldet */
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!title.trim()) return toast("Bitte einen Titel eingeben.", "error");
    setBusy(true);
    try {
      if (type === "task") {
        if (companyIds.length === 0) return toast("Bitte mindestens eine Firma wählen.", "error");
        // Eine Aufgabe – auch bei mehreren Firmen (wie bei mehreren Personen)
        const created = await insert("tasks", [
          {
            title: title.trim(),
            description: "",
            company_ids: companyIds,
            topic_id: null,
            assignee_person_ids: assignees.ids,
            assignee_me: assignees.ids.length > 0 && assignees.me,
            status: "open" as const,
            blocked_reason: "",
            priority,
            due_date: due || null,
            follow_up_date: null,
            done_at: null,
            checklist: [],
            source_note_id: prefill.sourceNoteId ?? null,
          },
        ]);
        toast("Aufgabe angelegt", "info");
        // Gleicher Ablauf wie bei Notizen: das Neue öffnet sich – außer beim Mitschreiben im Protokoll
        if (!prefill.sourceNoteId && created[0]) openTask(created[0].id);
      } else {
        if (!isValidUrl(url)) return toast("Bitte eine gültige Adresse mit http:// oder https:// eingeben.", "error");
        const [l] = await insert("links", [
          {
            title: title.trim(),
            url: url.trim(),
            company_ids: companyIds,
            topic_id: null,
            category_id: categoryId || null,
            description: "",
          },
        ]);
        if (prefill.attachTo) {
          await insert("attachments", [
            { link_id: l.id, task_id: prefill.attachTo.taskId ?? null, note_id: prefill.attachTo.noteId ?? null },
          ]);
        }
        toast("Link gespeichert");
      }
      clearTitle();
      onClose();
    } catch {
      /* Fehler wurde bereits gemeldet; Entwurf bleibt erhalten */
    } finally {
      setBusy(false);
    }
  };


  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal capture"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="seg-group">
          {TYPES.map(([t, label]) => (
            <button
              type="button"
              key={t}
              className={`seg${type === t ? " active" : ""}`}
              onClick={() => (t === "note" || t === "meeting" || t === "decision" ? void createNote(t) : setType(t))}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          autoFocus
          className="capture-input"
          placeholder={PLACEHOLDER[type]}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {type === "link" && (
          <input placeholder="https://…sharepoint.com/…" value={url} onChange={(e) => setUrl(e.target.value)} />
        )}

        <div className="chips">
          <CompaniesChip value={companyIds} onChange={setCompanyIds} />
          {type === "task" && (
            <>
              <AssigneeChip value={assignees} onChange={setAssignees} />
              <ChipDate title="Fällig" value={due || null} onChange={(v) => setDue(v ?? "")} placeholder="Fällig" format={(v) => `fällig ${relativeLabel(v, todayIso())}`} />
              <ImportantChip value={priority === "high"} onChange={(v) => setPriority(v ? "high" : "medium")} />
            </>
          )}
          {type === "link" && (
            <ChipSelect
              title="Kategorie"
              value={categoryId}
              placeholder="Kategorie"
              options={[{ value: "", label: "Keine Kategorie" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
              onChange={setCategoryId}
            />
          )}
        </div>

        <div className="row">
          <span className="spacer" />
          <button className="btn primary" type="submit" disabled={busy}>
            Speichern
          </button>
        </div>
      </form>
    </div>
  );
}
