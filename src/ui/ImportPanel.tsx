import { CalendarDays, FileText, Gavel, ListPlus, Loader2, NotebookPen, Sparkles, Upload, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLookups, useStore } from "../data/store";
import type { ChecklistItem, Id } from "../data/types";
import { formatDate, todayIso } from "../logic/dates";
import { ACCEPTED_FILES, extractText, type Extracted } from "../logic/extract";
import { buildContext, sanitizeProposal, type Proposal } from "../logic/proposal";
import { overarchingCompany } from "../logic/tasks";
import { AutoText, ChipDate, CompaniesChip, PeopleChip } from "./common";
import { AssigneeChip, ddmm } from "./tasks";
import { useUi } from "./uiState";

// Protokoll, Transkript oder E-Mail hochladen → KI schlägt Notiz, Entscheidungen, Aufgaben
// und Schritte vor → Nikolaus prüft, ändert, wählt aus → erst dann wird angelegt (Human in the Loop).

type FileState = Extracted & { error?: string };
type Choice<T> = T & { on: boolean };
interface Review {
  note: Choice<NonNullable<Proposal["note"]>> | null;
  decisions: Choice<Proposal["decisions"][number]>[];
  tasks: Choice<Proposal["tasks"][number]>[];
  steps: Choice<Proposal["steps"][number]>[];
}

export function ImportPanel({ focus, onClose }: { focus: { personId?: Id | null; companyId?: Id | null }; onClose: () => void }) {
  const { db, backend, insert, update, toast } = useStore();
  const { me, companies } = useLookups();
  const { openNote } = useUi();
  const [files, setFiles] = useState<FileState[]>([]);
  const [reading, setReading] = useState(false);
  const [phase, setPhase] = useState<"files" | "analyzing" | "review">("files");
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const today = todayIso();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const addFiles = async (list: FileList | File[]) => {
    setReading(true);
    const read = await Promise.all(
      [...list].map(async (f): Promise<FileState> => {
        try {
          return await extractText(f);
        } catch (e) {
          return { name: f.name, text: "", error: e instanceof Error ? e.message : "Datei konnte nicht gelesen werden." };
        }
      }),
    );
    setFiles((prev) => [...prev, ...read]);
    setReading(false);
  };

  const usable = files.filter((f) => !f.error && f.text.trim());
  const analyze = async () => {
    const context = buildContext(db, me, focus);
    const text = usable.map((f) => `=== ${f.name} ===\n${f.text}`).join("\n\n");
    setPhase("analyzing");
    try {
      const raw = await backend.analyze({ text, context, today, files: usable.map((f) => f.name) });
      const p = sanitizeProposal(raw, context);
      setReview({
        note: p.note ? { ...p.note, on: true } : null,
        decisions: p.decisions.map((d) => ({ ...d, on: true })),
        tasks: p.tasks.map((t) => ({ ...t, on: true })),
        steps: p.steps.map((s) => ({ ...s, on: true })),
      });
      setPhase("review");
    } catch (e) {
      toast(e instanceof Error ? e.message : "KI-Auswertung fehlgeschlagen.", "error");
      setPhase("files");
    }
  };

  const count = review
    ? (review.note?.on ? 1 : 0) + [...review.decisions, ...review.tasks, ...review.steps].filter((x) => x.on).length
    : 0;
  const fallbackCompany = (ids: Id[]) => (ids.length ? ids : [focus.companyId ?? overarchingCompany(companies)?.id].filter((x): x is Id => !!x));

  const apply = async () => {
    if (!review || count === 0) return;
    setBusy(true);
    try {
      let noteId: Id | null = null;
      const source = usable.map((f) => f.name).join(", ");
      if (review.note?.on) {
        const n = review.note;
        const [created] = await insert("notes", [
          {
            title: n.title || `${n.kind === "meeting" ? "Meeting" : "Notiz"} – ${formatDate(n.meeting_date ?? today)}`,
            body: `${n.summary}${source ? `\n\nQuelle: ${source}` : ""}`,
            kind: n.kind,
            company_ids: fallbackCompany(n.company_ids),
            topic_id: null,
            meeting_date: n.meeting_date ?? (n.kind === "meeting" ? today : null),
            participant_ids: n.kind === "meeting" ? n.participant_ids : [],
            participants_text: "",
          },
        ]);
        noteId = created.id;
      }
      const decisions = review.decisions.filter((d) => d.on);
      if (decisions.length) {
        await insert(
          "notes",
          decisions.map((d) => ({
            title: d.title,
            body: d.body,
            kind: "decision" as const,
            company_ids: fallbackCompany(d.company_ids),
            topic_id: null,
            meeting_date: review.note?.meeting_date ?? today,
            participant_ids: [],
            participants_text: "",
          })),
        );
      }
      const tasks = review.tasks.filter((t) => t.on);
      if (tasks.length) {
        await insert(
          "tasks",
          tasks.map((t) => ({
            title: t.title,
            description: "",
            company_ids: fallbackCompany(t.company_ids),
            topic_id: null,
            assignee_person_ids: t.assignee_person_ids,
            assignee_me: false,
            status: "open" as const,
            blocked_reason: "",
            priority: "medium" as const,
            due_date: t.due_date,
            follow_up_date: null,
            done_at: null,
            checklist: t.steps.map((text): ChecklistItem => ({ text, done: false, person_ids: [], due: null })),
            source_note_id: noteId,
          })),
        );
      }
      // Schritte zu vorhandenen Aufgaben anhängen (je Aufgabe ein Speichern)
      const steps = review.steps.filter((s) => s.on);
      for (const taskId of new Set(steps.map((s) => s.task_id))) {
        const task = db.tasks.find((t) => t.id === taskId);
        if (!task) continue;
        const add = steps.filter((s) => s.task_id === taskId).map((s): ChecklistItem => ({ text: s.text, done: false, person_ids: s.person_ids, due: s.due }));
        await update("tasks", taskId, { checklist: [...task.checklist, ...add] });
      }
      const parts = [
        noteId && (review.note?.kind === "meeting" ? "Protokoll" : "Notiz"),
        decisions.length && `${decisions.length} ${decisions.length === 1 ? "Entscheidung" : "Entscheidungen"}`,
        tasks.length && `${tasks.length} ${tasks.length === 1 ? "Aufgabe" : "Aufgaben"}`,
        steps.length && `${steps.length} ${steps.length === 1 ? "Schritt" : "Schritte"}`,
      ].filter(Boolean);
      toast(`Übernommen: ${parts.join(", ")}`);
      onClose();
      if (noteId) openNote(noteId);
    } catch {
      /* Fehler wurde gemeldet – bereits Angelegtes bleibt, Rest kann erneut übernommen werden */
    } finally {
      setBusy(false);
    }
  };

  // kleine Helfer zum Ändern einzelner Vorschläge
  const set = <K extends "decisions" | "tasks" | "steps">(k: K, i: number, patch: Partial<Review[K][number]>) =>
    setReview((r) => (r ? { ...r, [k]: r[k].map((x, j) => (j === i ? { ...x, ...patch } : x)) } : r));
  const setNote = (patch: Partial<NonNullable<Review["note"]>>) => setReview((r) => (r && r.note ? { ...r, note: { ...r.note, ...patch } } : r));
  const taskTitle = (id: Id) => db.tasks.find((t) => t.id === id)?.title ?? "?";

  return (
    <>
      <div className="panel-backdrop capture-layer" onClick={() => !busy && onClose()} />
      <aside className="panel wide capture-layer" aria-label="Datei hochladen">
        <div className="editor">
          <div className="panel-head">
            <Sparkles size={18} className="tone-blue" />
            <h2 className="panel-title">{phase === "review" ? "Vorschläge prüfen" : "Datei hochladen und auswerten"}</h2>
            <span className="spacer" />
            <button className="icon-btn" onClick={onClose} aria-label="Schließen" title="Schließen (Esc)" disabled={busy}>
              <X size={18} />
            </button>
          </div>

          {phase !== "review" && (
            <>
              <div
                className={`dropzone${drag ? " over" : ""}`}
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  void addFiles(e.dataTransfer.files);
                }}
              >
                <Upload size={22} />
                <div>
                  <strong>Dateien hierher ziehen</strong> oder klicken
                </div>
                <div className="muted small">Word, PDF, Teams-Transkript (.vtt), E-Mail (.eml/.msg), Text</div>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept={ACCEPTED_FILES}
                  hidden
                  onChange={(e) => {
                    if (e.target.files) void addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>
              {files.length > 0 && (
                <ul className="import-files">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className={f.error ? "tone-red" : ""}>
                      <FileText size={15} />
                      <span className="grow">{f.name}</span>
                      <span className="muted small">{f.error ?? `${f.text.length.toLocaleString("de-DE")} Zeichen`}</span>
                      <button className="icon-btn" aria-label="Entfernen" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="muted small">
                Die Dateien werden nur gelesen, nicht gespeichert. Der Text geht zur Auswertung an Google Gemini. Angelegt wird erst, was du
                im nächsten Schritt bestätigst.
              </p>
              <div className="capture-foot">
                {phase === "analyzing" ? (
                  <span className="muted small row tight">
                    <Loader2 size={15} className="spin" /> Die KI liest… das kann bis zu einer Minute dauern.
                  </span>
                ) : (
                  <span className="muted small">{reading ? "Lese Dateien…" : `${usable.length} ${usable.length === 1 ? "Datei" : "Dateien"} bereit`}</span>
                )}
                <span className="spacer" />
                <button className="btn primary" disabled={usable.length === 0 || phase === "analyzing" || reading} onClick={() => void analyze()}>
                  <Sparkles size={16} /> Auswerten
                </button>
              </div>
            </>
          )}

          {phase === "review" && review && (
            <>
              {count === 0 && !review.note && review.decisions.length + review.tasks.length + review.steps.length === 0 && (
                <p className="muted">Die KI hat nichts gefunden, was festgehalten werden müsste.</p>
              )}

              {review.note && (
                <section className={`proposal${review.note.on ? "" : " off"}`}>
                  <ProposalHead
                    icon={<NotebookPen size={15} />}
                    label={review.note.kind === "meeting" ? "Protokoll" : "Notiz"}
                    on={review.note.on}
                    onToggle={(on) => setNote({ on })}
                  />
                  <input className="proposal-title" value={review.note.title} onChange={(e) => setNote({ title: e.target.value })} placeholder="Titel" />
                  <div className="chips">
                    <CompaniesChip value={review.note.company_ids} onChange={(ids) => setNote({ company_ids: ids })} />
                    {review.note.kind === "meeting" && (
                      <PeopleChip
                        title="Teilnehmer"
                        emptyLabel="Teilnehmer"
                        icon={<Users size={14} />}
                        value={review.note.participant_ids}
                        onChange={(ids) => setNote({ participant_ids: ids })}
                      />
                    )}
                    <ChipDate
                      icon={<CalendarDays size={14} />}
                      title="Datum"
                      value={review.note.meeting_date}
                      onChange={(v) => setNote({ meeting_date: v })}
                      placeholder="Datum"
                      format={formatDate}
                    />
                  </div>
                  <AutoText value={review.note.summary} onChange={(v) => setNote({ summary: v })} minRows={3} placeholder="Zusammenfassung" />
                </section>
              )}

              {review.decisions.length > 0 && <h3 className="proposal-group">Entscheidungen</h3>}
              {review.decisions.map((d, i) => (
                <section key={`d${i}`} className={`proposal${d.on ? "" : " off"}`}>
                  <ProposalHead icon={<Gavel size={15} />} label="Entscheidung" on={d.on} onToggle={(on) => set("decisions", i, { on })} />
                  <input className="proposal-title" value={d.title} onChange={(e) => set("decisions", i, { title: e.target.value })} />
                  <div className="chips">
                    <CompaniesChip value={d.company_ids} onChange={(ids) => set("decisions", i, { company_ids: ids })} />
                  </div>
                  <AutoText value={d.body} onChange={(v) => set("decisions", i, { body: v })} minRows={1} placeholder="Begründung (optional)" />
                  <Quote text={d.quote} />
                </section>
              ))}

              {review.tasks.length > 0 && <h3 className="proposal-group">Neue Aufgaben</h3>}
              {review.tasks.map((t, i) => (
                <section key={`t${i}`} className={`proposal${t.on ? "" : " off"}`}>
                  <ProposalHead icon={<ListPlus size={15} />} label="Aufgabe" on={t.on} onToggle={(on) => set("tasks", i, { on })} />
                  <input className="proposal-title" value={t.title} onChange={(e) => set("tasks", i, { title: e.target.value })} />
                  <div className="chips">
                    <CompaniesChip value={t.company_ids} onChange={(ids) => set("tasks", i, { company_ids: ids })} />
                    <AssigneeChip value={{ ids: t.assignee_person_ids, me: false }} onChange={(a) => set("tasks", i, { assignee_person_ids: a.ids })} />
                    <ChipDate
                      title="Fällig"
                      value={t.due_date}
                      onChange={(v) => set("tasks", i, { due_date: v })}
                      placeholder="Fällig"
                      format={(v) => `fällig ${ddmm(v)}`}
                    />
                  </div>
                  {t.steps.length > 0 && (
                    <ul className="proposal-steps">
                      {t.steps.map((s, j) => (
                        <li key={j}>{s}</li>
                      ))}
                    </ul>
                  )}
                  <Quote text={t.quote} />
                </section>
              ))}

              {review.steps.length > 0 && <h3 className="proposal-group">Schritte zu bestehenden Aufgaben</h3>}
              {review.steps.map((s, i) => (
                <section key={`s${i}`} className={`proposal${s.on ? "" : " off"}`}>
                  <ProposalHead icon={<ListPlus size={15} />} label={`zu „${taskTitle(s.task_id)}“`} on={s.on} onToggle={(on) => set("steps", i, { on })} />
                  <input className="proposal-title" value={s.text} onChange={(e) => set("steps", i, { text: e.target.value })} />
                  <div className="chips">
                    <PeopleChip title="Wer?" emptyLabel="Wer?" tone="blue" value={s.person_ids} onChange={(ids) => set("steps", i, { person_ids: ids })} />
                    <ChipDate
                      title="Bis wann?"
                      value={s.due}
                      onChange={(v) => set("steps", i, { due: v })}
                      placeholder="Bis?"
                      format={(v) => `bis ${ddmm(v)}`}
                      tone={s.due ? "violet" : undefined}
                    />
                  </div>
                  <Quote text={s.quote} />
                </section>
              ))}

              <div className="capture-foot">
                <button className="btn ghost" onClick={() => setPhase("files")} disabled={busy}>
                  Zurück
                </button>
                <span className="spacer" />
                <span className="muted small">{count} ausgewählt</span>
                <button className="btn primary" disabled={count === 0 || busy} onClick={() => void apply()}>
                  Übernehmen
                </button>
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function ProposalHead({ icon, label, on, onToggle }: { icon: React.ReactNode; label: string; on: boolean; onToggle: (on: boolean) => void }) {
  return (
    <label className="proposal-head">
      <input type="checkbox" className="check" checked={on} onChange={(e) => onToggle(e.target.checked)} />
      {icon}
      <span>{label}</span>
    </label>
  );
}

function Quote({ text }: { text: string }) {
  return text ? <p className="proposal-quote">„{text}“</p> : null;
}
