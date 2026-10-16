import { useEffect, useState } from "react";
import { useLookups, useStore } from "../data/store";
import type { Id, NoteKind, Priority } from "../data/types";
import { relativeLabel, todayIso } from "../logic/dates";
import { isValidUrl, overarchingCompany } from "../logic/tasks";
import { ChipDate, ChipMulti, ChipSelect, ImportantChip, useDraft } from "./common";
import { useUi, type CaptureType } from "./uiState";

// Schnellerfassung (SPEC 6.5): Titel + Enter genügt, alles andere optional.

const TYPES: [CaptureType, string][] = [
  ["task", "Aufgabe"],
  ["note", "Notiz"],
  ["meeting", "Protokoll"],
  ["decision", "Entscheidung"],
  ["link", "Link"],
];

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
  const { companies, people, categories } = useLookups();
  const { openTask, openNote } = useUi();

  const defaultCompany = prefill.companyId ?? context.companyId ?? overarchingCompany(companies)?.id ?? "";
  const [type, setType] = useState<CaptureType>(prefill.type ?? "task");
  const [title, setTitle, clearTitle] = useDraft("capture-title", "", prefill.title);
  // Aufgaben: eine oder mehrere Firmen (je Firma eine Aufgabe); Notiz/Link: die erste
  const [companyIds, setCompanyIds] = useState<Id[]>(defaultCompany ? [defaultCompany] : []);
  const companyId = companyIds[0] ?? "";
  const setCompanyId = (id: Id) => setCompanyIds([id]);
  const [assignee, setAssignee] = useState<Id | "">("");
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

  const submit = async () => {
    if (!title.trim()) return toast("Bitte einen Titel eingeben.", "error");
    setBusy(true);
    try {
      if (type === "task") {
        const targets = companyIds;
        if (targets.length === 0) return toast("Bitte mindestens eine Firma wählen.", "error");
        const groupId = targets.length > 1 ? crypto.randomUUID() : null;
        const created = await insert(
          "tasks",
          targets.map((cid) => ({
            title: title.trim(),
            description: "",
            company_id: cid,
            topic_id: null,
            assignee_person_id: assignee || null,
            status: "open" as const,
            blocked_reason: "",
            priority,
            due_date: due || null,
            follow_up_date: null,
            done_at: null,
            checklist: [],
            group_id: groupId,
            source_note_id: prefill.sourceNoteId ?? null,
          })),
        );
        toast(targets.length > 1 ? `${targets.length} Aufgaben angelegt` : "Aufgabe angelegt", "info");
        // Gleicher Ablauf wie bei Notizen: das Neue öffnet sich – außer beim Mitschreiben im Protokoll
        if (!prefill.sourceNoteId && created[0]) openTask(created[0].id);
      } else if (type === "note" || type === "meeting" || type === "decision") {
        const kind: NoteKind = type;
        const [n] = await insert("notes", [
          {
            title: title.trim(),
            body: "",
            kind,
            company_id: companyId,
            topic_id: null,
            meeting_date: kind === "meeting" ? todayIso() : null,
            participant_ids: [],
            participants_text: "",
          },
        ]);
        openNote(n.id);
      } else {
        if (!isValidUrl(url)) return toast("Bitte eine gültige Adresse mit http:// oder https:// eingeben.", "error");
        const [l] = await insert("links", [
          {
            title: title.trim(),
            url: url.trim(),
            company_id: companyId,
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

  const shortOf = (id: Id) => companies.find((c) => c.id === id)?.short ?? "";
  const companiesLabel =
    companyIds.length === 0 ? "Firma" : companyIds.length <= 3 ? companyIds.map(shortOf).join(", ") : `${companyIds.length} Firmen`;

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
            <button type="button" key={t} className={`seg${type === t ? " active" : ""}`} onClick={() => setType(t)}>
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
          {type === "task" ? (
            <ChipMulti
              title="Firmen – bei mehreren entsteht je Firma eine eigene Aufgabe"
              label={companiesLabel}
              empty={companyIds.length === 0}
              options={companies.map((c) => ({ value: c.id, label: c.short }))}
              selected={companyIds}
              onChange={setCompanyIds}
              shortcut={{ label: "Alle Gesellschaften", values: companies.filter((c) => !c.is_overarching && !c.is_external).map((c) => c.id) }}
            />
          ) : (
            <ChipSelect title="Firma" value={companyId} options={companies.map((c) => ({ value: c.id, label: c.short }))} onChange={setCompanyId} />
          )}
          {type === "task" && (
            <>
              <ChipSelect
                title="Verantwortlich"
                value={assignee}
                options={[{ value: "", label: "Ich" }, ...people.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }))]}
                onChange={setAssignee}
              />
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
