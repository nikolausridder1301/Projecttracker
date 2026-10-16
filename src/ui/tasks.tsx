import { Ban, ChevronRight, Diamond, Flag, ListPlus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLookups, useStore } from "../data/store";
import type { ChecklistItem, Patch, Task } from "../data/types";
import { formatDate, localDate, relativeLabel, todayIso } from "../logic/dates";
import { checklistProgress, effectiveDue, isMine, isStep, stepPersons, taskCounts, validateTask } from "../logic/tasks";
import { AttachedLinks } from "./links";
import { AutoText, Avatar, ChipDate, ChipMulti, CompaniesChip, CompanyBadges, Disclosure, ImportantChip, MarkdownText, PeopleChip } from "./common";
import { ProjectBadge } from "./ProjectSwitcher";
import { NoteLink, useUi } from "./uiState";

// ---------------------------------------------------------------------------
// Aktionen
// ---------------------------------------------------------------------------

/** Änderungen als Patch – beim Ansehen direkt gespeichert, beim Anlegen im Entwurf. */
export const blockedPatch = (reason: string | null): Patch<"tasks"> =>
  reason ? { status: "blocked", blocked_reason: reason, done_at: null } : { status: "open", blocked_reason: "" };
export const assigneesPatch = (a: { ids: string[]; me: boolean }): Patch<"tasks"> => ({
  assignee_person_ids: a.ids,
  assignee_me: a.ids.length > 0 && a.me,
});

export function useTaskActions() {
  const { update } = useStore();

  const setDone = (t: Task, done: boolean) =>
    update("tasks", t.id, done ? { status: "done", done_at: new Date().toISOString() } : { status: "open", done_at: null });

  return { setDone };
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
  // Nur ein Hinweis (Zahl der Meilensteine und offenen Schritte); Klick klappt Schritte und Meilensteine auf
  const [expanded, setExpanded] = useState(false);
  const persons = task.assignee_person_ids.map((id) => personById.get(id)).filter((p) => p !== undefined);
  const done = task.status === "done";
  const counts = done ? "" : taskCounts(task);
  // Rechts der nächste Termin – Fälligkeit der Aufgabe oder eines offenen Schritts (wie auf „Heute“)
  const due = done ? task.due_date : effectiveDue(task);
  const overdue = !done && due !== null && due < today;
  const dueFromStep = due !== null && due !== task.due_date;

  const sub: React.ReactNode[] = [];
  if (task.status === "blocked") sub.push(<span key="b" className="tone-red">Blockiert: {task.blocked_reason}</span>);
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
      {!done && (
        <div className="task-expand">
          <button
            type="button"
            className={`task-toggle${counts ? "" : " empty"}${expanded ? " open" : ""}`}
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            title={expanded ? "Schritte zuklappen" : "Schritte und Meilensteine aufklappen"}
          >
            <ChevronRight size={14} className="chev" aria-hidden />
            {counts || "Schritt hinzufügen"}
          </button>
        </div>
      )}
      {expanded && !done && <CardPlan task={task} />}
    </div>
  );
}

/** Schritte und Meilensteine direkt in der Aufgabenkarte – dasselbe wie im Detail-Panel. */
function CardPlan({ task }: { task: Task }) {
  const { update } = useStore();
  return (
    <div className="task-plan">
      <PlanEditor bare task={task} save={(patch) => void update("tasks", task.id, patch).catch(() => {})} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verantwortlich: „Ich“ oder eine bzw. mehrere Personen
// ---------------------------------------------------------------------------

/** Verantwortliche: „Ich“ und/oder Personen. `me` ist nur mit Personen frei wählbar – ohne Personen bin immer ich es. */
export interface Assignees {
  ids: string[];
  me: boolean;
}

const ME = "__me__";

export function AssigneeChip({ value, onChange }: { value: Assignees; onChange: (v: Assignees) => void }) {
  const { people, me, personById, companyById } = useLookups();
  const meName = me?.name ?? "Ich";
  const isMe = value.ids.length === 0 || value.me;
  const names = value.ids.map((id) => personById.get(id)?.name ?? "?");
  const parts = [...(isMe ? [meName] : []), ...names];
  const label = parts.length === 1 ? parts[0] : parts.length === 2 ? parts.map((n) => n.split(" ")[0]).join(", ") : `${parts.length} Personen`;
  const list = people.filter((p) => p.id !== me?.id && (p.active || value.ids.includes(p.id)));
  const meCompany = me?.company_id ? companyById.get(me.company_id)?.short : undefined;
  return (
    <ChipMulti
      title={`Verantwortlich – ${parts.join(", ")}`}
      label={label}
      options={[
        { value: ME, label: `${meName}${meCompany ? ` · ${meCompany}` : ""}` },
        ...list.map((p) => ({ value: p.id, label: `${p.name}${p.company_id ? ` · ${companyById.get(p.company_id)?.short ?? ""}` : ""}` })),
      ]}
      selected={[...(isMe ? [ME] : []), ...value.ids]}
      onChange={(sel) => {
        const ids = sel.filter((x) => x !== ME);
        // Ohne weitere Person bin immer ich verantwortlich
        onChange({ ids, me: ids.length === 0 ? true : sel.includes(ME) });
      }}
    />
  );
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
 * Schritte (wer, bis wann) und Meilensteine (◆, nur zur Orientierung) einer Aufgabe –
 * zwei voneinander unabhängige Listen in derselben `checklist`.
 */
function PlanEditor({ task, save, bare }: { task: Task; save: (patch: { checklist: ChecklistItem[] }) => void; bare?: boolean }) {
  const today = todayIso();
  const list = task.checklist;
  const [editing, setEditing] = useState<{ i: number; text: string } | null>(null);
  const cl = checklistProgress(task);
  const steps = list.map((_, i) => i).filter((i) => isStep(list[i]));
  const milestones = list.map((_, i) => i).filter((i) => !isStep(list[i]));

  const setItem = (i: number, patch: Partial<ChecklistItem>) => save({ checklist: list.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const remove = (i: number) => save({ checklist: list.filter((_, j) => j !== i) });
  const saveText = () => {
    if (!editing) return;
    const t = editing.text.trim();
    if (t && t !== list[editing.i]?.text) setItem(editing.i, { text: t });
    setEditing(null);
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

  const body = (
      <div className="plan">
        {steps.length > 0 && (
          <ul className="checklist steps">
            {steps.map((i) => {
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
                        <PeopleChip title="Wer?" emptyLabel="Wer?" tone="blue" value={persons} onChange={(ids) => setItem(i, { person_ids: ids, person_id: undefined })} />
                        <ChipDate
                          title="Bis wann?"
                          value={item.due ?? null}
                          onChange={(v) => setItem(i, { due: v })}
                          placeholder="Bis?"
                          format={(v) => `bis ${ddmm(v)}`}
                          tone={item.due ? (item.due < today ? "red" : "violet") : undefined}
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
        )}
        <StepAddForm onAdd={(step) => save({ checklist: [...list, step] })} />
        <div className="plan-label">Meilensteine</div>
        {milestones.length > 0 && (
          <ul className="checklist steps">
            {milestones.map((i) => {
              const ms = list[i];
              return (
                <li key={i} className="step-item">
                  <button
                    type="button"
                    className={`ms-toggle${ms.done ? " done" : ""}`}
                    onClick={() => setItem(i, { done: !ms.done })}
                    aria-label={ms.done ? "Meilenstein wieder öffnen" : "Meilenstein erreicht"}
                    title={ms.done ? "Erreicht – wieder öffnen" : "Als erreicht markieren"}
                  >
                    <Diamond size={16} />
                  </button>
                  <div className="step-body">{textOf(i, "ms-text")}</div>
                  <button className="icon-btn hover-only" aria-label="Meilenstein entfernen" onClick={() => remove(i)}>
                    <X size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <MilestoneAddForm onAdd={(ms) => save({ checklist: [...list, ms] })} />
      </div>
  );
  if (bare) return body;
  return (
    <Disclosure title="Schritte & Meilensteine" meta={cl.total > 0 ? `${cl.done}/${cl.total}` : undefined} defaultOpen>
      {body}
    </Disclosure>
  );
}

/** Eine Eingabezeile zum Hinzufügen – für Schritte und Meilensteine gleich aufgebaut: Symbol, Text, Chips. */
function PlanAddRow({
  icon,
  value,
  onChange,
  onSubmit,
  placeholder,
  ariaLabel,
  children,
}: {
  icon: ReactNode;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
  ariaLabel: string;
  children?: ReactNode;
}) {
  return (
    <form
      className="plan-new"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <span className="plan-new-icon" aria-hidden>
        {icon}
      </span>
      <div className="plan-new-main">
        <AutoText minRows={1} className="step-edit" ariaLabel={ariaLabel} value={value} onChange={onChange} onSubmit={onSubmit} placeholder={placeholder} />
        {children && <div className="plan-new-chips">{children}</div>}
      </div>
    </form>
  );
}

/** Neuer Schritt: Text, optional Wer/Bis, Enter – das Feld bleibt für den nächsten offen. */
function StepAddForm({ onAdd }: { onAdd: (step: ChecklistItem) => void }) {
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
    <PlanAddRow icon={<ListPlus size={16} />} value={text} onChange={setText} onSubmit={add} placeholder="Schritt hinzufügen… (Enter)" ariaLabel="Schritt hinzufügen">
      <PeopleChip title="Wer?" emptyLabel="Wer?" tone="blue" value={persons} onChange={setPersons} />
      <ChipDate title="Bis wann?" value={due} onChange={setDue} placeholder="Bis?" format={(v) => `bis ${ddmm(v)}`} tone={due ? "violet" : undefined} />
    </PlanAddRow>
  );
}

/** Neuer Meilenstein: nur Text, Enter. */
function MilestoneAddForm({ onAdd }: { onAdd: (ms: ChecklistItem) => void }) {
  const [text, setText] = useState("");
  const add = () => {
    if (!text.trim()) return;
    onAdd({ text: text.trim(), done: false, milestone: true });
    setText("");
  };
  return <PlanAddRow icon={<Diamond size={16} />} value={text} onChange={setText} onSubmit={add} placeholder="Meilenstein hinzufügen… (Enter)" ariaLabel="Meilenstein hinzufügen" />;
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
      <aside className="panel wide task-layer" aria-label="Aufgabe">
        <TaskEditor key={task.id} task={task} onClose={() => close.current()} beforeClose={beforeClose} />
      </aside>
    </>
  );
}

/** Gespeicherte Aufgabe: Kopfzeile (erledigt, Papierkorb, Schließen) und das gemeinsame Formular. */
function TaskEditor({
  task,
  onClose,
  beforeClose,
}: {
  task: Task;
  onClose: () => void;
  beforeClose: React.MutableRefObject<(() => void) | null>;
}) {
  const { update, trash } = useStore();
  const { setDone } = useTaskActions();
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
      <TaskForm task={task} onPatch={(p) => void update("tasks", task.id, p).catch(() => {})} beforeClose={beforeClose} />
    </div>
  );
}

/**
 * Das Aufgaben-Formular – dasselbe beim Anlegen (Entwurf, `draft`) und beim Ansehen einer
 * gespeicherten Aufgabe: Titel, Chips, Blockiert, Schritte & Meilensteine.
 */
export function TaskForm({
  task,
  onPatch,
  beforeClose,
  draft = false,
  onTitleEnter,
}: {
  task: Task;
  onPatch: (patch: Patch<"tasks">) => void;
  beforeClose?: React.MutableRefObject<(() => void) | null>;
  draft?: boolean;
  /** Enter im Titel (beim Anlegen: speichern) */
  onTitleEnter?: () => void;
}) {
  const { db, toast } = useStore();
  const { noteById } = useLookups();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  // Nur zeigen, wenn beim Öffnen schon eine Beschreibung da war
  const [hasDescription] = useState(task.description.trim() !== "");
  const [blockedReason, setBlockedReason] = useState(task.blocked_reason);
  const [pendingBlocked, setPendingBlocked] = useState(false);

  const save = onPatch;

  const attachedCount = db.attachments.filter((a) => a.deleted_at === null && a.task_id === task.id).length;
  const sourceNote = task.source_note_id ? noteById.get(task.source_note_id) : undefined;
  const today = todayIso();

  // Beim Schließen (auch Esc) noch nicht per Blur gespeicherte Eingaben sichern
  if (beforeClose) {
    beforeClose.current = () => {
      const patch: Patch<"tasks"> = {};
      if (title.trim() && title.trim() !== task.title) patch.title = title.trim();
      if (task.status === "blocked" && blockedReason.trim() && blockedReason.trim() !== task.blocked_reason) patch.blocked_reason = blockedReason.trim();
      if (hasDescription && description !== task.description) patch.description = description;
      if (Object.keys(patch).length > 0) save(patch);
    };
  }

  const blocked = task.status === "blocked";
  // „Blockiert“ als Schalter: an = Grund abfragen (immer frisch), aus = wieder offen
  const toggleBlocked = () => {
    if (blocked) {
      setBlockedReason("");
      save(blockedPatch(null));
    } else if (pendingBlocked) {
      setPendingBlocked(false);
    } else {
      setBlockedReason("");
      setPendingBlocked(true);
    }
  };

  const confirmBlocked = () => {
    const err = validateTask({ title: task.title || title, status: "blocked", blocked_reason: blockedReason });
    if (err) return toast(err, "error");
    save(blockedPatch(blockedReason.trim()));
    setPendingBlocked(false);
  };

  return (
    <>
      <div className="title-field">
        <AutoText
          autoFocus={draft}
          value={title}
          onChange={(v) => {
            const t = v.replace(/\n/g, " ");
            setTitle(t);
            // Beim Anlegen steht der Titel sofort im Entwurf (Speichern per Tastatur)
            if (draft) save({ title: t });
          }}
          onBlur={() => (title.trim() ? title !== task.title && save({ title: title.trim() }) : setTitle(task.title))}
          onSubmit={draft ? onTitleEnter : undefined}
          minRows={1}
          placeholder={draft ? "Was ist zu tun?" : "Titel"}
        />
      </div>

      <div className="chips">
        <CompaniesChip value={task.company_ids} onChange={(ids) => save({ company_ids: ids })} />
        <AssigneeChip value={{ ids: task.assignee_person_ids, me: isMine(task) }} onChange={(a) => save(assigneesPatch(a))} />
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
            onKeyDown={(e) => e.key === "Enter" && pendingBlocked && (e.preventDefault(), confirmBlocked())}
            placeholder="Woran hängt es?"
          />
          {pendingBlocked && (
            <>
              <button type="button" className="btn primary" onClick={confirmBlocked}>
                Blockieren
              </button>
              <button type="button" className="icon-btn" onClick={() => setPendingBlocked(false)} aria-label="Abbrechen">
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

      {!draft && (
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
      )}
    </>
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
