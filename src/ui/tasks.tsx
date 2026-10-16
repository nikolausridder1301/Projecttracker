import { Flag, MessageSquarePlus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLookups, useStore } from "../data/store";
import { STATUS_LABEL, type Task, type TaskStatus } from "../data/types";
import { formatDate, relativeLabel, todayIso } from "../logic/dates";
import { checklistProgress, latestUpdates, standText, validateTask } from "../logic/tasks";
import { AttachedLinks } from "./links";
import { AutoText, Avatar, ChipDate, ChipSelect, CompanyBadge, Disclosure, ImportantChip } from "./common";
import { ProjectBadge } from "./ProjectSwitcher";
import { useUi } from "./uiState";

// ---------------------------------------------------------------------------
// Aktionen
// ---------------------------------------------------------------------------

export function useTaskActions() {
  const { update, insert, toast } = useStore();

  const setDone = (t: Task, done: boolean) =>
    update("tasks", t.id, done ? { status: "done", done_at: new Date().toISOString() } : { status: "open", done_at: null });

  /** Neuen Stand in den Verlauf schreiben (nichts wird überschrieben). */
  const addUpdate = async (taskId: string, note: string) => {
    await insert("task_followups", [{ task_id: taskId, date: todayIso(), note }]);
    toast("Update gespeichert");
  };

  return { setDone, addUpdate };
}

/** Letzter Stand je Aufgabe (über alle Projekte). */
export function useLatestUpdates() {
  const { allDb } = useStore();
  return useMemo(() => latestUpdates(allDb.task_followups), [allDb.task_followups]);
}

// ---------------------------------------------------------------------------
// Zeile: Titel links, rechts nur Firma, Person (Initialen) und Fälligkeit.
// ---------------------------------------------------------------------------

export function TaskRow({
  task,
  showCompany = true,
  showProject = false,
  extra,
  rightLabel,
  subExtra,
  hideStand = false,
}: {
  task: Task;
  showCompany?: boolean;
  /** Projekt-Kürzel zeigen („Heute – Alle Projekte“) */
  showProject?: boolean;
  extra?: React.ReactNode;
  /** ersetzt die Fälligkeit rechts (z. B. „seit 5 T. kein Update“) */
  rightLabel?: React.ReactNode;
  /** zusätzliche Angabe in der zweiten Zeile */
  subExtra?: React.ReactNode;
  /** letzten Stand aus dem Verlauf nicht zeigen */
  hideStand?: boolean;
}) {
  const { project: currentProject, setProject } = useStore();
  const { personById, projectById } = useLookups();
  const { openTask } = useUi();
  const taskProject = projectById.get(task.project_id);
  const { setDone } = useTaskActions();
  const latest = useLatestUpdates();
  const today = todayIso();
  const cl = checklistProgress(task);
  const person = task.assignee_person_id ? personById.get(task.assignee_person_id) : undefined;
  const done = task.status === "done";
  const overdue = !done && task.due_date !== null && task.due_date < today;

  const sub: React.ReactNode[] = [];
  if (task.status === "blocked") sub.push(<span key="b" className="tone-red">Blockiert: {task.blocked_reason}</span>);
  if (cl.total > 0) sub.push(<span key="c">{cl.done}/{cl.total} Punkte</span>);
  if (subExtra) sub.push(<span key="x">{subExtra}</span>);
  const stand = !hideStand && !done ? latest.get(task.id) : undefined;
  if (stand) sub.push(<span key="s" className="task-stand" title={stand.note}>{standText(stand)}</span>);

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
        {extra}
        {showProject && taskProject && <ProjectBadge color={taskProject.color} short={taskProject.short} />}
        {showCompany && <CompanyBadge id={task.company_id} />}
        {person && <Avatar name={person.name} title={`Delegiert an ${person.name}`} />}
        {rightLabel ?? (
          <span className={`due${overdue ? " overdue" : ""}`} title={task.due_date ? `Fällig ${formatDate(task.due_date)}` : undefined}>
            {task.due_date ? relativeLabel(task.due_date, today) : ""}
          </span>
        )}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verlauf
// ---------------------------------------------------------------------------

/** Wochentag + Datum, z. B. „Di, 20.10.“ */
export function shortDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = new Date(y, m - 1, d).toLocaleDateString("de-DE", { weekday: "short" }).replace(".", "");
  return `${wd}, ${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.`;
}

/** Ein Satz, Enter – landet mit heutigem Datum im Verlauf. */
export function UpdateInput({ taskId, compact = false }: { taskId: string; compact?: boolean }) {
  const { addUpdate } = useTaskActions();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className={`update-input${compact ? " compact" : ""}`}
      onSubmit={async (e) => {
        e.preventDefault();
        const note = text.trim();
        if (!note || busy) return;
        setBusy(true);
        try {
          await addUpdate(taskId, note);
          setText("");
        } catch {
          /* Fehler wurde gemeldet; Text bleibt stehen */
        } finally {
          setBusy(false);
        }
      }}
    >
      <MessageSquarePlus size={compact ? 14 : 16} className="update-icon" aria-hidden />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={compact ? "Update notieren…" : "Update hinzufügen… (Enter)"}
        aria-label="Update hinzufügen"
      />
    </form>
  );
}

/** Alle Updates als Zeitleiste, neueste oben; einzelne Einträge löschbar. */
export function UpdateTimeline({ taskId, limit = 5 }: { taskId: string; limit?: number }) {
  const { allDb, purge } = useStore();
  const [all, setAll] = useState(false);
  const entries = allDb.task_followups
    .filter((f) => f.task_id === taskId && f.deleted_at === null)
    .sort((a, b) => (a.date === b.date ? (a.created_at < b.created_at ? 1 : -1) : a.date < b.date ? 1 : -1));
  if (entries.length === 0) return null;
  const shown = all ? entries : entries.slice(0, limit);
  return (
    <ol className="timeline" aria-label="Verlauf">
      {shown.map((f) => (
        <li key={f.id}>
          <span className="timeline-date">{shortDay(f.date)}</span>
          <span className="timeline-text">{f.note || <span className="muted">nachgefragt</span>}</span>
          <button className="icon-btn hover-only" title="Eintrag löschen" onClick={() => void purge("task_followups", f.id)}>
            <X size={14} />
          </button>
        </li>
      ))}
      {entries.length > limit && (
        <li>
          <button className="link-btn small" onClick={() => setAll(!all)}>
            {all ? "Weniger anzeigen" : `Alle ${entries.length} anzeigen`}
          </button>
        </li>
      )}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Detail-Panel
// ---------------------------------------------------------------------------

export function TaskPanel() {
  const { openTaskId, openTask } = useUi();
  const { db } = useStore();
  const task = db.tasks.find((t) => t.id === openTaskId);

  useEffect(() => {
    if (!openTaskId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && openTask(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openTaskId, openTask]);

  if (!task) return null;
  return (
    <>
      <div className="panel-backdrop" onClick={() => openTask(null)} />
      <aside className="panel" aria-label="Aufgabe">
        <TaskEditor key={task.id} task={task} onClose={() => openTask(null)} />
      </aside>
    </>
  );
}

function TaskEditor({ task, onClose }: { task: Task; onClose: () => void }) {
  const { db, update, trash, toast } = useStore();
  const { companies, people, noteById } = useLookups();
  const { setDone } = useTaskActions();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  // Nur zeigen, wenn beim Öffnen schon eine Beschreibung da war
  const [hasDescription] = useState(task.description.trim() !== "");
  const [blockedReason, setBlockedReason] = useState(task.blocked_reason);
  const [pendingBlocked, setPendingBlocked] = useState(false);
  const [newItem, setNewItem] = useState("");

  const save = (patch: Parameters<typeof update<"tasks">>[2]) => void update("tasks", task.id, patch).catch(() => {});

  const attachedCount = db.attachments.filter((a) => a.deleted_at === null && a.task_id === task.id).length;
  const sourceNote = task.source_note_id ? noteById.get(task.source_note_id) : undefined;
  const cl = checklistProgress(task);
  const today = todayIso();

  const setStatus = (status: TaskStatus) => {
    if (status === "blocked" && !blockedReason.trim()) {
      setPendingBlocked(true);
      return;
    }
    setPendingBlocked(false);
    save({
      status,
      blocked_reason: status === "blocked" ? blockedReason.trim() : task.blocked_reason,
      done_at: status === "done" ? new Date().toISOString() : null,
    });
  };

  const confirmBlocked = () => {
    const err = validateTask({ title, status: "blocked", blocked_reason: blockedReason });
    if (err) return toast(err, "error");
    save({ status: "blocked", blocked_reason: blockedReason.trim(), done_at: null });
    setPendingBlocked(false);
  };

  const statusTone: Record<TaskStatus, string | undefined> = { open: undefined, blocked: "red", done: "green" };

  return (
    <div className="editor">
      <div className="panel-head">
        <label className="done-toggle">
          <input type="checkbox" className="check" checked={task.status === "done"} onChange={(e) => void setDone(task, e.target.checked)} />
          <span>{task.status === "done" ? "Erledigt" : "Erledigt?"}</span>
        </label>
        <span className="spacer" />
        <button className="icon-btn" title="In den Papierkorb" onClick={() => void trash("tasks", task.id, task.title).then(onClose)}>
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
        <ChipSelect
          title="Status"
          tone={pendingBlocked ? "red" : statusTone[task.status]}
          value={pendingBlocked ? "blocked" : task.status}
          options={(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
          onChange={(v) => setStatus(v as TaskStatus)}
        />
        <ChipSelect
          title="Firma"
          value={task.company_id}
          options={companies.map((c) => ({ value: c.id, label: c.short }))}
          onChange={(v) => save({ company_id: v })}
        />
        <ChipSelect
          title="Verantwortlich"
          value={task.assignee_person_id ?? ""}
          options={[
            { value: "", label: "Ich" },
            ...people.filter((p) => p.active || p.id === task.assignee_person_id).map((p) => ({ value: p.id, label: p.name })),
          ]}
          onChange={(v) => save({ assignee_person_id: v || null })}
        />
        <ChipDate
          title="Fällig"
          value={task.due_date}
          onChange={(v) => save({ due_date: v })}
          placeholder="Fällig"
          format={(v) => `fällig ${relativeLabel(v, today)}`}
          tone={task.due_date && task.due_date < today && task.status !== "done" ? "red" : undefined}
        />
        <ImportantChip value={task.priority === "high"} onChange={(v) => save({ priority: v ? "high" : "medium" })} />
      </div>

      {(task.status === "blocked" || pendingBlocked) && (
        <div className="blocked-box">
          <input
            autoFocus={pendingBlocked}
            value={blockedReason}
            onChange={(e) => setBlockedReason(e.target.value)}
            onBlur={() =>
              task.status === "blocked" && blockedReason.trim() && blockedReason !== task.blocked_reason && save({ blocked_reason: blockedReason.trim() })
            }
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

      <section className="updates">
        <h3 className="section-label">Verlauf</h3>
        <UpdateInput taskId={task.id} />
        <UpdateTimeline taskId={task.id} />
      </section>

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

      <Disclosure title="Checkliste" meta={cl.total > 0 ? `${cl.done}/${cl.total}` : undefined} defaultOpen={cl.total > 0}>
        <ul className="checklist">
          {task.checklist.map((item, i) => (
            <li key={i}>
              <input
                type="checkbox"
                className="check"
                checked={item.done}
                onChange={() => save({ checklist: task.checklist.map((c, j) => (j === i ? { ...c, done: !c.done } : c)) })}
              />
              <span className={item.done ? "is-done-text" : ""}>{item.text}</span>
              <button
                className="icon-btn hover-only"
                aria-label="Punkt entfernen"
                onClick={() => save({ checklist: task.checklist.filter((_, j) => j !== i) })}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newItem.trim()) return;
            save({ checklist: [...task.checklist, { text: newItem.trim(), done: false }] });
            setNewItem("");
          }}
        >
          <input className="plain-input" value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Punkt hinzufügen…" />
        </form>
      </Disclosure>

      {/* Links nur noch anzeigen, wenn früher welche angehängt wurden */}
      {attachedCount > 0 && (
        <Disclosure title="Links" meta={attachedCount} defaultOpen>
          <AttachedLinks target={{ taskId: task.id }} />
        </Disclosure>
      )}

      <p className="meta-line">
        Angelegt {formatDate(task.created_at.slice(0, 10))}
        {task.done_at && ` · erledigt ${formatDate(task.done_at.slice(0, 10))}`}
        {sourceNote && (
          <>
            {" · aus "}
            <a href={`#/notizen/${sourceNote.id}`} onClick={onClose}>
              {sourceNote.title}
            </a>
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
