import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLookups, useStore } from "../data/store";
import { NOTE_KIND_LABEL, PRIORITY_LABEL, type Id, type NoteKind, type Priority } from "../data/types";
import { addWorkdays, todayIso } from "../logic/dates";
import { isValidUrl, overarchingCompany } from "../logic/tasks";
import { AssigneeSelect, CompanySelect, TopicSelect, useDraft } from "./common";
import { useUi, type CaptureType } from "./uiState";

// Schnellerfassung (SPEC 6.5): Titel + Enter genügt, alles andere optional.

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
  const { companies } = useLookups();
  const navigate = useNavigate();

  const defaultCompany = prefill.companyId ?? context.companyId ?? overarchingCompany(companies)?.id ?? "";
  const [type, setType] = useState<CaptureType>(prefill.type ?? "task");
  const [title, setTitle, clearTitle] = useDraft("capture-title", "", prefill.title);
  const [expanded, setExpanded] = useState(false);
  const [companyId, setCompanyId] = useState<Id>(defaultCompany);
  const [topicId, setTopicId] = useState<Id | "">(prefill.topicId ?? context.topicId ?? "");
  const [assignee, setAssignee] = useState<Id | "">("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [multi, setMulti] = useState(false);
  const [multiIds, setMultiIds] = useState<Set<Id>>(new Set());
  const [kind, setKind] = useState<NoteKind>("note");
  const [url, setUrl] = useState("");
  const [categoryId, setCategoryId] = useState<Id | "">("");
  const [busy, setBusy] = useState(false);
  const { categories } = useLookups();

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
        const targets = multi ? [...multiIds] : [companyId];
        if (targets.length === 0) return toast("Bitte mindestens eine Firma wählen.", "error");
        const groupId = targets.length > 1 ? crypto.randomUUID() : null;
        await insert(
          "tasks",
          targets.map((cid) => ({
            title: title.trim(),
            description: "",
            company_id: cid,
            topic_id: topicId || null,
            assignee_person_id: assignee || null,
            status: "open" as const,
            blocked_reason: "",
            priority,
            due_date: due || null,
            follow_up_date: assignee ? addWorkdays(todayIso(), 3) : null,
            done_at: null,
            checklist: [],
            group_id: groupId,
            source_note_id: prefill.sourceNoteId ?? null,
          })),
        );
        toast(targets.length > 1 ? `${targets.length} Aufgaben angelegt` : "Aufgabe angelegt", "info");
      } else if (type === "note") {
        const [n] = await insert("notes", [
          {
            title: title.trim(),
            body: "",
            kind,
            company_id: companyId,
            topic_id: topicId || null,
            meeting_date: kind === "meeting" ? todayIso() : null,
            participant_ids: [],
            participants_text: "",
          },
        ]);
        navigate(`/notizen/${n.id}`);
      } else {
        if (!isValidUrl(url)) return toast("Bitte eine gültige Adresse mit http:// oder https:// eingeben.", "error");
        const [l] = await insert("links", [
          {
            title: title.trim(),
            url: url.trim(),
            company_id: companyId,
            topic_id: topicId || null,
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

  const toggleMulti = (id: Id) => {
    const s = new Set(multiIds);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setMultiIds(s);
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
          {(["task", "note", "link"] as CaptureType[]).map((t) => (
            <button type="button" key={t} className={`seg${type === t ? " active" : ""}`} onClick={() => setType(t)}>
              {t === "task" ? "Aufgabe" : t === "note" ? "Notiz" : "Link"}
            </button>
          ))}
        </div>
        <input
          autoFocus
          className="capture-input"
          placeholder={type === "task" ? "Was ist zu tun?" : type === "note" ? "Titel der Notiz" : "Titel des Links"}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {type === "link" && (
          <input placeholder="https://…sharepoint.com/…" value={url} onChange={(e) => setUrl(e.target.value)} />
        )}

        {expanded || type !== "task" ? (
          <div className="grid2">
            {!(type === "task" && multi) && (
              <div className="field">
                <label>Firma</label>
                <CompanySelect value={companyId} onChange={setCompanyId} />
              </div>
            )}
            <div className="field">
              <label>Thema</label>
              <TopicSelect value={topicId} onChange={setTopicId} />
            </div>
            {type === "task" && (
              <>
                <div className="field">
                  <label>Verantwortlich</label>
                  <AssigneeSelect value={assignee} onChange={setAssignee} />
                </div>
                <div className="field">
                  <label>Fällig</label>
                  <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
                </div>
                <div className="field">
                  <label>Priorität</label>
                  <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                    {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                      <option key={p} value={p}>
                        {PRIORITY_LABEL[p]}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
            {type === "note" && (
              <div className="field">
                <label>Art</label>
                <select value={kind} onChange={(e) => setKind(e.target.value as NoteKind)}>
                  {(Object.keys(NOTE_KIND_LABEL) as NoteKind[]).map((k) => (
                    <option key={k} value={k}>
                      {NOTE_KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {type === "link" && (
              <div className="field">
                <label>Kategorie</label>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">– keine –</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        ) : null}

        {type === "task" && expanded && (
          <div className="field">
            <label className="inline">
              <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} /> Für mehrere Firmen
              anlegen (je Firma eine eigene Aufgabe)
            </label>
            {multi && (
              <div className="multi-companies">
                {companies.map((c) => (
                  <label key={c.id} className="inline chip-check">
                    <input type="checkbox" checked={multiIds.has(c.id)} onChange={() => toggleMulti(c.id)} />
                    {c.short}
                  </label>
                ))}
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => setMultiIds(new Set(companies.filter((c) => !c.is_overarching).map((c) => c.id)))}
                >
                  Alle Gesellschaften
                </button>
              </div>
            )}
          </div>
        )}

        <div className="row">
          {type === "task" && !expanded && (
            <button type="button" className="link-btn muted" onClick={() => setExpanded(true)}>
              Weitere Felder…
            </button>
          )}
          <span className="spacer" />
          <span className="muted small">Enter speichert · Esc schließt</span>
          <button className="btn primary" type="submit" disabled={busy}>
            Speichern
          </button>
        </div>
      </form>
    </div>
  );
}
