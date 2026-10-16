import { Ban, Diamond, Flag, ListPlus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLookups, useStore } from "../data/store";
import type { ChecklistItem, Task } from "../data/types";
import { formatDate, localDate, relativeLabel, todayIso } from "../logic/dates";
import { checklistProgress, currentMilestone, effectiveDue, groupSteps, insertStep, nextStep, stepPersons, validateTask } from "../logic/tasks";
import { AttachedLinks } from "./links";
import { AutoText, Avatar, ChipDate, CompaniesChip, CompanyBadges, Disclosure, ImportantChip, MarkdownText, PeopleChip } from "./common";
import { firstLine } from "../logic/markdown";
import { ProjectBadge } from "./ProjectSwitcher";
import { NoteLink, useUi } from "./uiState";

// ---------------------------------------------------------------------------
// Aktionen
// ---------------------------------------------------------------------------

export function useTaskActions() {
  const { update } = useStore();

  const setDone = (t: Task, done: boolean) =>
    update("tasks", t.id, done ? { status: "done", done_at: new Date().toISOString() } : { status: "open", done_at: null });

  /** Blockieren (mit Grund) bzw. wieder freigeben. */
  const setBlocked = (t: Task, reason: string | null) =>
    update("tasks", t.id, reason ? { status: "blocked", blocked_reason: reason, done_at: null } : { status: "open", blocked_reason: "" });

  const setAssignees = (t: Task, ids: string[]) => update("tasks", t.id, { assignee_person_ids: ids });

  return { setDone, setBlocked, setAssignees };
}

// ---------------------------------------------------------------------------
// Zeile: Titel links, rechts nur Firma, Person (Initialen) und Fälligkeit.
// ---------------------------------------------------------------------------

export function TaskRow({
  task,
  showCompany = true,
  showProject = false,
  rightLabel,
  subExtra,
}: {
  task: Task;
  showCompany?: boolean;
  /** Projekt-Kürzel zeigen („Heute – Alle Projekte“) */
  showProject?: boolean;
  /** ersetzt die Fälligkeit rechts (z. B. „seit 5 T. kein Update“) */
  rightLabel?: React.ReactNode;
  /** zusätzliche Angabe in der zweiten Zeile */
  subExtra?: React.ReactNode;
}) {
  const { project: currentProject, setProject } = useStore();
  const { personById, projectById } = useLookups();
  const { openTask } = useUi();
  const taskProject = projectById.get(task.project_id);
  const { setDone } = useTaskActions();
  const today = todayIso();
  const cl = checklistProgress(task);
  const persons = task.assignee_person_ids.map((id) => personById.get(id)).filter((p) => p !== undefined);
  const done = task.status === "done";
  // Rechts der nächste Termin – Fälligkeit der Aufgabe oder eines offenen Schritts (wie auf „Heute“)
  const due = done ? task.due_date : effectiveDue(task);
  const overdue = !done && due !== null && due < today;
  const dueFromStep = due !== null && due !== task.due_date;

  const sub: React.ReactNode[] = [];
  if (task.status === "blocked") sub.push(<span key="b" className="tone-red">Blockiert: {task.blocked_reason}</span>);
  // Worauf hingearbeitet wird: der aktuelle Meilenstein, darunter der nächste Schritt
  const ms = done ? undefined : currentMilestone(task);
  if (ms) {
    const msLate = !!ms.due && ms.due < today;
    sub.push(
      <span key="m" className={`task-next task-ms${msLate ? " tone-red" : ""}`} title={`Meilenstein: ${ms.text}`}>
        <span className="task-next-text">◆ {firstLine(ms.text)}</span>
        {ms.due && <span className="task-next-meta">· bis {ddmm(ms.due)}</span>}
      </span>,
    );
  }
  const next = done ? undefined : nextStep(task);
  if (next) {
    const who = stepPersons(next)
      .map((id) => personById.get(id)?.name.split(" ")[0])
      .filter(Boolean)
      .join(", ");
    const late = !!next.due && next.due < today;
    const meta = [who, next.due ? ddmm(next.due) : "", cl.total > 1 ? `${cl.done}/${cl.total}` : ""].filter(Boolean).join(" · ");
    sub.push(
      <span key="c" className={`task-next${late ? " tone-red" : ""}`} title={`Nächster Schritt: ${next.text}`}>
        <span className="task-next-text">→ {firstLine(next.text)}</span>
        {meta && <span className="task-next-meta">· {meta}</span>}
      </span>,
    );
  } else if (cl.total > 0) sub.push(<span key="c">{cl.done}/{cl.total} Schritte</span>);
  if (subExtra) sub.push(<span key="x">{subExtra}</span>);

  return (
    <div className={`task-row${done ? " is-done" : ""}`}>
      <input
        type="checkbox"
        className="check"
        checked={done}
        onChange={(e) => void setDone(task, e.target.checked)}
        aria-label={done ? "Als offen markieren" : "Als erledigt markieren"}
      />
      <button
        className="task-main"
        onClick={() => {
          // Aufgabe aus anderem Projekt: dorthin wechseln, damit Auswahllisten passen
          if (task.project_id !== currentProject?.id) setProject(task.project_id);
          openTask(task.id);
        }}
      >
        <span className="task-title">
          {task.priority === "high" && !done && <Flag size={14} className="tone-red flag" aria-label="Wichtig" />}
          {task.title}
        </span>
        {sub.length > 0 && <span className="task-sub">{sub}</span>}
      </button>
      <span className="task-right">
        {showProject && taskProject && <ProjectBadge color={taskProject.color} short={taskProject.short} />}
        {showCompany && <CompanyBadges ids={task.company_ids} />}
        {persons.length > 0 && (
          <span className="avatars" title={`Delegiert an ${persons.map((p) => p.name).join(", ")}`}>
            {persons.slice(0, 3).map((p) => (
              <Avatar key={p.id} name={p.name} />
            ))}
            {persons.length > 3 && <span className="avatar-more">+{persons.length - 3}</span>}
          </span>
        )}
        {rightLabel ?? (
          <span
            className={`due${overdue ? " overdue" : ""}`}
            title={due ? `${dueFromStep ? "Nächster Schritt fällig" : "Fällig"} ${formatDate(due)}` : undefined}
          >
            {due ? relativeLabel(due, today) : ""}
          </span>
        )}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verantwortlich: „Ich“ oder eine bzw. mehrere Personen
// ---------------------------------------------------------------------------

export function AssigneeChip({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  return <PeopleChip title="Verantwortlich – mehrere möglich" emptyLabel="Ich" noneOption="Ich" value={value} onChange={onChange} />;
}

// ---------------------------------------------------------------------------
// Verlauf
// ---------------------------------------------------------------------------

/** „23.10.“ */
export const ddmm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

/** Wochentag + Datum, z. B. „Di, 20.10.“ */
export function shortDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = new Date(y, m - 1, d).toLocaleDateString("de-DE", { weekday: "short" }).replace(".", "");
  return `${wd}, ${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.`;
}

/**
 * Meilensteine & Schritte: die Etappen der Aufgabe (◆, mit Zieldatum) und darunter
 * die konkreten Schritte (wer, bis wann). Alles in derselben Liste der Aufgabe.
 */
function PlanEditor({ task, save }: { task: Task; save: (patch: { checklist: ChecklistItem[] }) => void }) {
  const today = todayIso();
  const list = task.checklist;
  const groups = groupSteps(list);
  const hasMilestones = groups.length > 1;
  const [editing, setEditing] = useState<{ i: number; text: string } | null>(null);
  // Offenes „+ Schritt“-Feld: Index des Meilensteins, null = ohne Meilenstein, "none" = keins
  const [addingTo, setAddingTo] = useState<number | null | "none">(list.length === 0 ? null : "none");
  const [msText, setMsText] = useState("");
  const [msDue, setMsDue] = useState<string | null>(null);
  const cl = checklistProgress(task);

  const setItem = (i: number, patch: Partial<ChecklistItem>) => save({ checklist: list.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const remove = (i: number) => save({ checklist: list.filter((_, j) => j !== i) });
  const saveText = () => {
    if (!editing) return;
    const t = editing.text.trim();
    if (t && t !== list[editing.i]?.text) setItem(editing.i, { text: t });
    setEditing(null);
  };
  const addMilestone = () => {
    const t = msText.trim();
    if (!t) return;
    save({ checklist: [...list, { text: t, done: false, milestone: true, due: msDue }] });
    setMsText("");
    setMsDue(null);
  };

  const textOf = (i: number, className: string) =>
    editing?.i === i ? (
      <AutoText
        autoFocus
        minRows={1}
        className="step-edit"
        ariaLabel="Text bearbeiten"
        value={editing.text}
        onChange={(v) => setEditing({ i, text: v })}
        onBlur={saveText}
        onSubmit={saveText}
        onEscape={() => setEditing(null)}
      />
    ) : (
      <MarkdownText
        text={list[i].text}
        className={`${className}${list[i].done ? " is-done-text" : ""}`}
        title="Klicken zum Bearbeiten"
        onClick={() => setEditing({ i, text: list[i].text })}
      />
    );

  return (
    <Disclosure title="Meilensteine & Schritte" meta={cl.total > 0 ? `${cl.done}/${cl.total}` : undefined} defaultOpen>
      <div className="plan">
        {groups.map((g) => {
          const ms = g.milestone !== null ? list[g.milestone] : undefined;
          const stepsDone = g.steps.filter((i) => list[i].done).length;
          // Ohne Meilenstein: Gruppe nur zeigen, wenn sie Schritte hat oder es (noch) keine Meilensteine gibt
          if (!ms && g.steps.length === 0 && hasMilestones && addingTo !== null) return null;
          return (
            <div key={g.milestone ?? "top"} className={`plan-group${ms ? " has-ms" : ""}${ms?.done ? " ms-done" : ""}`}>
              {ms && g.milestone !== null && (
                <div className="ms-row">
                  <button
                    type="button"
                    className={`ms-toggle${ms.done ? " done" : ""}`}
                    onClick={() => setItem(g.milestone!, { done: !ms.done })}
                    aria-label={ms.done ? "Meilenstein wieder öffnen" : "Meilenstein erreicht"}
                    title={ms.done ? "Erreicht – wieder öffnen" : "Als erreicht markieren"}
                  >
                    <Diamond size={16} />
                  </button>
                  <div className="ms-body">
                    {textOf(g.milestone, "ms-text")}
                    <div className="step-meta">
                      {g.steps.length > 0 && <span className="muted small">{stepsDone}/{g.steps.length} Schritte</span>}
                      {!ms.done && (
                        <ChipDate
                          title="Zieldatum"
                          value={ms.due ?? null}
                          onChange={(v) => setItem(g.milestone!, { due: v })}
                          placeholder="Ziel?"
                          format={(v) => `Ziel ${ddmm(v)}`}
                          tone={ms.due && ms.due < today ? "red" : undefined}
                        />
                      )}
                    </div>
                  </div>
                  <button className="icon-btn hover-only" aria-label="Meilenstein entfernen" title="Meilenstein entfernen (Schritte bleiben)" onClick={() => remove(g.milestone!)}>
                    <X size={14} />
                  </button>
                </div>
              )}
              <ul className="checklist steps">
                {g.steps.map((i) => {
                  const item = list[i];
                  const persons = stepPersons(item);
                  const hasMeta = persons.length > 0 || !!item.due;
                  return (
                    <li key={i} className="step-item">
                      <input type="checkbox" className="check" checked={item.done} onChange={() => setItem(i, { done: !item.done })} aria-label="Schritt erledigt" />
                      <div className="step-body">
                        {textOf(i, "step-text")}
                        {!item.done && (
                          <div className={`step-meta${hasMeta ? "" : " no-meta"}`}>
                            <PeopleChip title="Wer?" emptyLabel="Wer?" value={persons} onChange={(ids) => setItem(i, { person_ids: ids, person_id: undefined })} />
                            <ChipDate
                              title="Bis wann?"
                              value={item.due ?? null}
                              onChange={(v) => setItem(i, { due: v })}
                              placeholder="Bis?"
                              format={(v) => `bis ${ddmm(v)}`}
                              tone={item.due && item.due < today ? "red" : undefined}
                            />
                          </div>
                        )}
                      </div>
                      <button className="icon-btn hover-only" aria-label="Schritt entfernen" onClick={() => remove(i)}>
                        <X size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
              {addingTo === g.milestone ? (
                <StepAddForm
                  onAdd={(step) => save({ checklist: insertStep(list, step, g.milestone) })}
                  onClose={() => setAddingTo("none")}
                  autoFocus={list.length > 0}
                />
              ) : (
                !ms?.done && (
                  <button className="link-btn small plan-add" onClick={() => setAddingTo(g.milestone)}>
                    <ListPlus size={14} /> Schritt
                  </button>
                )
              )}
            </div>
          );
        })}
        <form
          className="ms-new"
          onSubmit={(e) => {
            e.preventDefault();
            addMilestone();
          }}
        >
          <Diamond size={16} className="ms-new-icon" aria-hidden />
          <AutoText
            minRows={1}
            className="step-edit"
            ariaLabel="Meilenstein hinzufügen"
            value={msText}
            onChange={setMsText}
            placeholder="Meilenstein hinzufügen… (Enter)"
            onSubmit={addMilestone}
          />
          <ChipDate title="Zieldatum" value={msDue} onChange={setMsDue} placeholder="Ziel?" format={(v) => `Ziel ${ddmm(v)}`} />
        </form>
      </div>
    </Disclosure>
  );
}

/** Neuer Schritt: Text, optional Wer/Bis, Enter – das Feld bleibt für den nächsten offen. */
function StepAddForm({ onAdd, onClose, autoFocus }: { onAdd: (step: ChecklistItem) => void; onClose: () => void; autoFocus: boolean }) {
  const [text, setText] = useState("");
  const [persons, setPersons] = useState<string[]>([]);
  const [due, setDue] = useState<string | null>(null);
  const add = () => {
    if (!text.trim()) return;
    onAdd({ text: text.trim(), done: false, person_ids: persons, due });
    setText("");
    setPersons([]);
    setDue(null);
  };
  return (
    <form
      className="step-new"
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <AutoText
        autoFocus={autoFocus}
        minRows={1}
        className="step-edit"
        ariaLabel="Schritt hinzufügen"
        value={text}
        onChange={setText}
        onBlur={() => !text.trim() && persons.length === 0 && !due && onClose()}
        placeholder="Schritt hinzufügen… (Enter)"
        onSubmit={add}
        onEscape={onClose}
      />
      <span className="md-hint">Umschalt+Enter: neue Zeile · „- “ für Aufzählung · **fett**</span>
      <div className="step-meta">
        <PeopleChip title="Wer?" emptyLabel="Wer?" value={persons} onChange={setPersons} />
        <ChipDate title="Bis wann?" value={due} onChange={setDue} placeholder="Bis?" format={(v) => `bis ${ddmm(v)}`} />
      </div>
    </form>
  );
}

/** Im Meeting: vereinbarten Schritt direkt notieren – landet beim aktuellen Meilenstein der Aufgabe. */
export function StepInput({ task }: { task: Task }) {
  const { update, toast } = useStore();
  const [text, setText] = useState("");
  return (
    <form
      className="update-input compact"
      onSubmit={(e) => {
        e.preventDefault();
        const t = text.trim();
        if (!t) return;
        void update("tasks", task.id, { checklist: insertStep(task.checklist, { text: t, done: false, person_ids: [], due: null }, "current") })
          .then(() => toast("Schritt notiert"))
          .catch(() => {});
        setText("");
      }}
    >
      <ListPlus size={14} className="update-icon" aria-hidden />
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Schritt notieren…" aria-label="Schritt notieren" />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Detail-Panel
// ---------------------------------------------------------------------------

export function TaskPanel() {
  const { openTaskId, openTask, capture } = useUi();
  const { db } = useStore();
  const task = db.tasks.find((t) => t.id === openTaskId);
  // Der Editor hängt hier ein, was beim Schließen noch zu sichern ist (z. B. Titel ohne Blur)
  const beforeClose = useRef<(() => void) | null>(null);
  const close = useRef(() => {});
  close.current = () => {
    beforeClose.current?.();
    beforeClose.current = null;
    openTask(null);
  };

  useEffect(() => {
    if (!openTaskId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !capture && close.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openTaskId, capture]);

  if (!task) return null;
  return (
    <>
      <div className="panel-backdrop task-layer" onClick={() => close.current()} />
      <aside className="panel task-layer" aria-label="Aufgabe">
        <TaskEditor key={task.id} task={task} onClose={() => close.current()} beforeClose={beforeClose} />
      </aside>
    </>
  );
}

function TaskEditor({
  task,
  onClose,
  beforeClose,
}: {
  task: Task;
  onClose: () => void;
  beforeClose: React.MutableRefObject<(() => void) | null>;
}) {
  const { db, update, trash, toast } = useStore();
  const { noteById } = useLookups();
  const { setDone, setBlocked, setAssignees } = useTaskActions();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  // Nur zeigen, wenn beim Öffnen schon eine Beschreibung da war
  const [hasDescription] = useState(task.description.trim() !== "");
  const [blockedReason, setBlockedReason] = useState(task.blocked_reason);
  const [pendingBlocked, setPendingBlocked] = useState(false);

  const save = (patch: Parameters<typeof update<"tasks">>[2]) => void update("tasks", task.id, patch).catch(() => {});

  const attachedCount = db.attachments.filter((a) => a.deleted_at === null && a.task_id === task.id).length;
  const sourceNote = task.source_note_id ? noteById.get(task.source_note_id) : undefined;
  const today = todayIso();

  // Beim Schließen (auch Esc) noch nicht per Blur gespeicherte Eingaben sichern
  beforeClose.current = () => {
    const patch: Parameters<typeof update<"tasks">>[2] = {};
    if (title.trim() && title.trim() !== task.title) patch.title = title.trim();
    if (task.status === "blocked" && blockedReason.trim() && blockedReason.trim() !== task.blocked_reason) patch.blocked_reason = blockedReason.trim();
    if (hasDescription && description !== task.description) patch.description = description;
    if (Object.keys(patch).length > 0) save(patch);
  };

  const blocked = task.status === "blocked";
  // „Blockiert“ als Schalter: an = Grund abfragen (immer frisch), aus = wieder offen
  const toggleBlocked = () => {
    if (blocked) {
      setBlockedReason("");
      void setBlocked(task, null).catch(() => {});
    } else if (pendingBlocked) {
      setPendingBlocked(false);
    } else {
      setBlockedReason("");
      setPendingBlocked(true);
    }
  };

  const confirmBlocked = () => {
    const err = validateTask({ title, status: "blocked", blocked_reason: blockedReason });
    if (err) return toast(err, "error");
    void setBlocked(task, blockedReason.trim()).catch(() => {});
    setPendingBlocked(false);
  };

  return (
    <div className="editor">
      <div className="panel-head">
        <label className="done-toggle">
          <input type="checkbox" className="check" checked={task.status === "done"} onChange={(e) => void setDone(task, e.target.checked)} />
          <span>{task.status === "done" ? "Erledigt" : "Erledigt?"}</span>
        </label>
        <span className="spacer" />
        <button
          className="icon-btn"
          title="In den Papierkorb"
          onClick={() => {
            beforeClose.current = null;
            void trash("tasks", task.id, task.title).then(onClose).catch(() => {});
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
          value={title}
          onChange={(v) => setTitle(v.replace(/\n/g, " "))}
          onBlur={() => (title.trim() ? title !== task.title && save({ title: title.trim() }) : setTitle(task.title))}
          minRows={1}
          placeholder="Titel"
        />
      </div>

      <div className="chips">
        <CompaniesChip value={task.company_ids} onChange={(ids) => save({ company_ids: ids })} />
        <AssigneeChip value={task.assignee_person_ids} onChange={(ids) => void setAssignees(task, ids).catch(() => {})} />
        <ChipDate
          title="Fällig"
          value={task.due_date}
          onChange={(v) => save({ due_date: v })}
          placeholder="Fällig"
          format={(v) => `fällig ${relativeLabel(v, today)}`}
          tone={task.due_date && task.due_date < today && task.status !== "done" ? "red" : undefined}
        />
        <ImportantChip value={task.priority === "high"} onChange={(v) => save({ priority: v ? "high" : "medium" })} />
        {task.status !== "done" && (
          <button
            type="button"
            className={`chip${blocked || pendingBlocked ? " tone-red" : " chip-empty"}`}
            aria-pressed={blocked}
            title={blocked ? "Nicht mehr blockiert" : "Als blockiert markieren (mit Grund)"}
            onClick={toggleBlocked}
          >
            <Ban size={14} />
            <span className="chip-text">Blockiert</span>
          </button>
        )}
      </div>

      {(blocked || pendingBlocked) && (
        <div className="blocked-box">
          <input
            autoFocus={pendingBlocked}
            value={blockedReason}
            onChange={(e) => setBlockedReason(e.target.value)}
            onBlur={() => blocked && blockedReason.trim() && blockedReason !== task.blocked_reason && save({ blocked_reason: blockedReason.trim() })}
            onKeyDown={(e) => e.key === "Enter" && pendingBlocked && confirmBlocked()}
            placeholder="Woran hängt es?"
          />
          {pendingBlocked && (
            <>
              <button className="btn primary" onClick={confirmBlocked}>
                Blockieren
              </button>
              <button className="icon-btn" onClick={() => setPendingBlocked(false)} aria-label="Abbrechen">
                <X size={16} />
              </button>
            </>
          )}
        </div>
      )}

      <PlanEditor task={task} save={save} />

      {/* Schlank halten: Beschreibung nur, wenn schon eine existiert (keine neuen mehr anlegen) */}
      {hasDescription && (
        <AutoText
          value={description}
          onChange={setDescription}
          onBlur={() => description !== task.description && save({ description })}
          placeholder="Beschreibung"
          minRows={2}
        />
      )}

      {/* Links nur noch anzeigen, wenn früher welche angehängt wurden */}
      {attachedCount > 0 && (
        <Disclosure title="Links" meta={attachedCount} defaultOpen>
          <AttachedLinks target={{ taskId: task.id }} />
        </Disclosure>
      )}

      <p className="meta-line">
        Angelegt {formatDate(localDate(task.created_at))}
        {task.done_at && ` · erledigt ${formatDate(localDate(task.done_at))}`}
        {sourceNote && (
          <>
            {" · aus "}
            <NoteLink id={sourceNote.id}>{sourceNote.title}</NoteLink>
          </>
        )}
      </p>
    </div>
  );
}

/** Aufgaben eines bestimmten Filters als Liste. */
export function TaskList({
  tasks,
  showCompany = true,
  showProject = false,
  empty,
}: {
  tasks: Task[];
  showCompany?: boolean;
  showProject?: boolean;
  empty?: string;
}) {
  if (tasks.length === 0) return empty ? <div className="empty-inline">{empty}</div> : null;
  return (
    <div className="task-list">
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} showCompany={showCompany} showProject={showProject} />
      ))}
    </div>
  );
}
