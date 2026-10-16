import { CalendarDays, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLookups, useStore } from "../data/store";
import type { Id, NoteKind, Priority } from "../data/types";
import { formatDate, relativeLabel, todayIso } from "../logic/dates";
import { isValidUrl, overarchingCompany } from "../logic/tasks";
import { AutoText, ChipDate, ChipSelect, CompaniesChip, ImportantChip, PeopleChip, useDraft } from "./common";
import { useUi, type CaptureType } from "./uiState";
import { ProtocolOpenItems } from "../pages/Notes";
import { AssigneeChip, type Assignees } from "./tasks";

// Schnellerfassung (SPEC 6.5): Titel + Enter genügt, alles andere optional.
// Aufgabe, Notiz, Protokoll, Entscheidung und Link bleiben im selben Fenster – nur der Reiter wechselt.

const TYPES: [CaptureType, string][] = [
  ["task", "Aufgabe"],
  ["note", "Notiz"],
  ["meeting", "Protokoll"],
  ["decision", "Entscheidung"],
  ["link", "Link"],
];

const DEFAULT_TITLE: Record<NoteKind, string> = { note: "Notiz", meeting: "Meeting", decision: "Entscheidung" };
const SAVED_LABEL: Record<NoteKind, string> = { note: "Notiz gespeichert", meeting: "Protokoll gespeichert", decision: "Entscheidung gespeichert" };

const PLACEHOLDER: Record<CaptureType, string> = {
  task: "Was ist zu tun?",
  note: "Titel der Notiz (optional)",
  meeting: "Worum ging es im Meeting? (optional)",
  decision: "Was wurde entschieden? (optional)",
  link: "Titel des Links",
};

const isNoteType = (t: CaptureType): t is NoteKind => t === "note" || t === "meeting" || t === "decision";

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
  const { companies, categories, me } = useLookups();
  const { openTask } = useUi();

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
  // Notiz, Protokoll, Entscheidung
  const [body, setBody] = useState("");
  const [participants, setParticipants] = useState<Id[]>(me ? [me.id] : []);
  const [noteDate, setNoteDate] = useState("");
  const [busy, setBusy] = useState(false);
  // Rückfrage bei ungespeichertem Text: Ziel-Reiter bzw. null = Fenster schließen
  const [pending, setPending] = useState<{ to: CaptureType | null } | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const isNote = isNoteType(type);
  const dirty = isNote && body.trim() !== "";
  // Protokoll und Entscheidung gelten für heute, solange kein anderes Datum gewählt ist
  const effectiveDate = noteDate || (type === "note" ? "" : todayIso());

  const requestClose = () => (dirty ? setPending({ to: null }) : onClose());
  const switchTo = (t: CaptureType) => {
    if (t === type) return;
    if (dirty) setPending({ to: t });
    else setType(t);
  };

  const closeRef = useRef(requestClose);
  closeRef.current = pending ? () => setPending(null) : requestClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const resetNoteForm = () => {
    clearTitle();
    setBody("");
    setParticipants(me ? [me.id] : []);
    setNoteDate("");
  };

  /** Notiz, Protokoll oder Entscheidung speichern; danach schließen oder (beim Wechseln) im Fenster zum nächsten Reiter. */
  const saveNote = async (next?: CaptureType): Promise<boolean> => {
    if (!isNoteType(type)) return false;
    if (!title.trim() && !body.trim()) {
      toast("Bitte einen Titel oder Text eingeben.", "error");
      return false;
    }
    if (companyIds.length === 0) {
      toast("Bitte mindestens eine Firma wählen.", "error");
      return false;
    }
    setBusy(true);
    try {
      await insert("notes", [
        {
          title: title.trim() || `${DEFAULT_TITLE[type]} – ${formatDate(todayIso())}`,
          body,
          kind: type,
          company_ids: companyIds,
          topic_id: null,
          meeting_date: effectiveDate || null,
          participant_ids: type === "meeting" ? participants : [],
          participants_text: "",
        },
      ]);
      toast(SAVED_LABEL[type]);
      resetNoteForm();
      if (next) setType(next);
      else onClose();
      return true;
    } catch {
      /* Fehler wurde gemeldet; Entwurf bleibt erhalten */
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (isNote) return void saveNote();
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
        // Das Neue öffnet sich – außer beim Mitschreiben im Protokoll
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

  const confirmSave = async () => {
    await saveNote(pending?.to ?? undefined);
    setPending(null);
  };
  const confirmDiscard = () => {
    const to = pending?.to;
    resetNoteForm();
    setPending(null);
    if (to) setType(to);
    else onClose();
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && requestClose()}>
      <form
        className={`modal capture${isNote ? " wide" : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        onKeyDown={(e) => {
          // Strg+Enter speichert auch aus dem Textfeld
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void submit();
          }
        }}
      >
        <div className="seg-group">
          {TYPES.map(([t, label]) => (
            <button type="button" key={t} className={`seg${type === t ? " active" : ""}`} onClick={() => switchTo(t)}>
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
          onKeyDown={(e) => {
            // Bei Notizen führt Enter in den Text statt zu speichern
            if (isNote && e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
              e.preventDefault();
              bodyRef.current?.focus();
            }
          }}
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
          {type === "meeting" && (
            <PeopleChip title="Teilnehmer" emptyLabel="Teilnehmer" icon={<Users size={14} />} value={participants} onChange={setParticipants} />
          )}
          {isNote && (
            <ChipDate
              icon={<CalendarDays size={14} />}
              title="Datum"
              value={effectiveDate || null}
              onChange={(v) => setNoteDate(v ?? "")}
              placeholder="Datum"
              format={formatDate}
            />
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

        {isNote && <AutoText textRef={bodyRef} value={body} onChange={setBody} minRows={8} placeholder="Schreiben…" />}
        {type === "meeting" && <ProtocolOpenItems participantIds={participants} companyIds={companyIds} />}

        <div className="row">
          {isNote && <span className="muted small">Strg+Enter speichert</span>}
          <span className="spacer" />
          <button className="btn primary" type="submit" disabled={busy}>
            Speichern
          </button>
        </div>
      </form>

      {pending && (
        <div className="modal-backdrop confirm-layer" onMouseDown={(e) => e.target === e.currentTarget && setPending(null)}>
          <div className="modal confirm" role="alertdialog" aria-label="Änderungen speichern?">
            <h2>Änderungen speichern?</h2>
            <p className="muted">
              {pending.to ? "Dein Text ist noch nicht gespeichert, bevor du die Art wechselst." : "Dein Text ist noch nicht gespeichert."}
            </p>
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
    </div>
  );
}
