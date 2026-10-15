import { Copy, Flag } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLookups, useStore } from "../data/store";
import { NOTE_KIND_LABEL, PRIORITY_LABEL, type Id, type NoteKind, type Priority } from "../data/types";
import { addWorkdays, relativeLabel, todayIso } from "../logic/dates";
import { isValidUrl, overarchingCompany } from "../logic/tasks";
import { ChipDate, ChipSelect, useDraft } from "./common";
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
  const { companies, topics, people, categories } = useLookups();
  const navigate = useNavigate();

  const defaultCompany = prefill.companyId ?? context.companyId ?? overarchingCompany(companies)?.id ?? "";
  const [type, setType] = useState<CaptureType>(prefill.type ?? "task");
  const [title, setTitle, clearTitle] = useDraft("capture-title", "", prefill.title);
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

        <div className="chips">
          {!(type === "task" && multi) && (
            <ChipSelect title="Firma" value={companyId} options={companies.map((c) => ({ value: c.id, label: c.short }))} onChange={setCompanyId} />
          )}
          {type === "task" && (
            <button type="button" className={`chip${multi ? " tone-blue" : " chip-empty"}`} onClick={() => setMulti(!multi)} title="Je Firma eine eigene Aufgabe">
              <Copy size={14} />
              <span className="chip-text">Mehrere Firmen</span>
            </button>
          )}
          <ChipSelect
            title="Thema"
            value={topicId}
            placeholder="Thema"
            options={[{ value: "", label: "Kein Thema" }, ...topics.filter((t) => !t.archived).map((t) => ({ value: t.id, label: t.name }))]}
            onChange={setTopicId}
          />
          {type === "task" && (
            <>
              <ChipSelect
                title="Verantwortlich"
                value={assignee}
                options={[{ value: "", label: "Ich" }, ...people.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }))]}
                onChange={setAssignee}
              />
              <ChipDate title="Fällig" value={due || null} onChange={(v) => setDue(v ?? "")} placeholder="Fällig" format={(v) => `fällig ${relativeLabel(v, todayIso())}`} />
              <ChipSelect
                title="Priorität"
                icon={<Flag size={14} />}
                tone={priority === "high" ? "red" : undefined}
                value={priority === "medium" ? "" : priority}
                placeholder="Priorität"
                options={[
                  { value: "", label: "Mittel" },
                  { value: "high", label: PRIORITY_LABEL.high },
                  { value: "low", label: PRIORITY_LABEL.low },
                ]}
                onChange={(v) => setPriority((v || "medium") as Priority)}
              />
            </>
          )}
          {type === "note" && (
            <ChipSelect
              title="Art"
              value={kind}
              options={(Object.keys(NOTE_KIND_LABEL) as NoteKind[]).map((k) => ({ value: k, label: NOTE_KIND_LABEL[k] }))}
              onChange={(v) => setKind(v as NoteKind)}
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

        {type === "task" && multi && (
          <div className="chip-checks">
            {companies.map((c) => (
              <label key={c.id} className={`chip${multiIds.has(c.id) ? " tone-blue" : " chip-empty"}`}>
                <input type="checkbox" className="sr-only" checked={multiIds.has(c.id)} onChange={() => toggleMulti(c.id)} />
                <span className="chip-text">{c.short}</span>
              </label>
            ))}
            <button
              type="button"
              className="btn ghost small"
              onClick={() => setMultiIds(new Set(companies.filter((c) => !c.is_overarching && !c.is_external).map((c) => c.id)))}
            >
              Alle Gesellschaften
            </button>
          </div>
        )}

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
