import { CalendarClock, Flag, Mail, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useLookups, useStore } from "../data/store";
import { PRIORITY_LABEL, STATUS_LABEL, type Priority, type Task, type TaskStatus } from "../data/types";
import { addWorkdays, formatDate, relativeLabel, todayIso } from "../logic/dates";
import { checklistProgress, groupProgress, validateTask } from "../logic/tasks";
import { AttachedLinks } from "./links";
import { AutoText, Avatar, ChipDate, ChipSelect, CompanyBadge, Disclosure } from "./common";
import { useUi } from "./uiState";

// ---------------------------------------------------------------------------
// Aktionen
// ---------------------------------------------------------------------------

export function useTaskActions() {
  const { update, insert, toast } = useStore();
  const { personById } = useLookups();

  const setDone = (t: Task, done: boolean) =>
    update("tasks", t.id, done ? { status: "done", done_at: new Date().toISOString() } : { status: "open", done_at: null });

  const followUp = async (t: Task, note: string, next: string | null) => {
    await insert("task_followups", [{ task_id: t.id, date: todayIso(), note }]);
    await update("tasks", t.id, { follow_up_date: next });
    toast(`Nachgehakt: ${t.title}`);
  };

  const mailto = (t: Task) => {
    const p = t.assignee_person_id ? personById.get(t.assignee_person_id) : undefined;
    const subject = `Nachfrage: ${t.title}`;
    const lines = [
      `Hallo ${p?.name.split(" ")[0] ?? ""},`,
      "",
      `kurze Nachfrage zum Stand bei „${t.title}“${t.due_date ? ` (fällig ${formatDate(t.due_date)})` : ""}.`,
      ...(t.description.trim() ? ["", t.description.trim()] : []),
      "",
      "Danke und viele Grüße",
    ];
    return `mailto:${encodeURIComponent(p?.email ?? "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
  };

  return { setDone, followUp, mailto };
}

// ---------------------------------------------------------------------------
// Zeile: Titel links, rechts nur Firma, Person (Initialen) und Fälligkeit.
// ---------------------------------------------------------------------------

export function TaskRow({ task, showCompany = true, extra }: { task: Task; showCompany?: boolean; extra?: React.ReactNode }) {
  const { db } = useStore();
  const { personById, companyById } = useLookups();
  const { openTask } = useUi();
  const { setDone } = useTaskActions();
  const today = todayIso();
  const cl = checklistProgress(task);
  const group = task.group_id ? groupProgress(db.tasks, task.group_id) : null;
  const person = task.assignee_person_id ? personById.get(task.assignee_person_id) : undefined;
  const done = task.status === "done";
  const overdue = !done && task.due_date !== null && task.due_date < today;

  const sub: React.ReactNode[] = [];
  if (task.status === "blocked") sub.push(<span key="b" className="tone-red">Blockiert: {task.blocked_reason}</span>);
  if (task.status === "in_progress") sub.push(<span key="i" className="tone-blue">In Arbeit</span>);
  if (cl.total > 0) sub.push(<span key="c">{cl.done}/{cl.total} Punkte</span>);
  if (group && group.total > 1)
    sub.push(
      <span key="g" title={`Offen: ${group.openCompanyIds.map((id) => companyById.get(id)?.short).join(", ") || "–"}`}>
        {group.done}/{group.total} Firmen
      </span>,
    );

  return (
    <div className={`task-row${done ? " is-done" : ""}`}>
      <input
        type="checkbox"
        className="check"
        checked={done}
        onChange={(e) => void setDone(task, e.target.checked)}
        aria-label={done ? "Als offen markieren" : "Als erledigt markieren"}
      />
      <button className="task-main" onClick={() => openTask(task.id)}>
        <span className="task-title">
          {task.priority === "high" && !done && <Flag size={14} className="tone-red flag" aria-label="Hohe Priorität" />}
          {task.title}
        </span>
        {sub.length > 0 && <span className="task-sub">{sub}</span>}
      </button>
      <span className="task-right">
        {extra}
        {showCompany && <CompanyBadge id={task.company_id} />}
        {person && <Avatar name={person.name} title={`Delegiert an ${person.name}`} />}
        <span className={`due${overdue ? " overdue" : ""}`} title={task.due_date ? `Fällig ${formatDate(task.due_date)}` : undefined}>
          {task.due_date ? relativeLabel(task.due_date, today) : ""}
        </span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nachhaken
// ---------------------------------------------------------------------------

export function FollowUpForm({ task, onDone }: { task: Task; onDone: () => void }) {
  const { followUp } = useTaskActions();
  const [note, setNote] = useState("");
  const [next, setNext] = useState<string | null>(addWorkdays(todayIso(), 3));
  return (
    <form
      className="followup-form"
      onSubmit={async (e) => {
        e.preventDefault();
        await followUp(task, note.trim(), next);
        onDone();
      }}
    >
      <input autoFocus placeholder="Was wurde gesagt? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <ChipDate
        icon={<CalendarClock size={14} />}
        value={next}
        onChange={setNext}
        placeholder="Nächstes Mal"
        title="Nächstes Nachhaken"
        format={(v) => `wieder ${formatDate(v)}`}
      />
      <button className="btn primary" type="submit">
        Speichern
      </button>
      <button className="icon-btn" type="button" onClick={onDone} aria-label="Abbrechen">
        <X size={16} />
      </button>
    </form>
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
  const { companies, topics, people, companyById, noteById, personById } = useLookups();
  const { mailto, setDone } = useTaskActions();
  const { openCapture } = useUi();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [blockedReason, setBlockedReason] = useState(task.blocked_reason);
  const [pendingBlocked, setPendingBlocked] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [followUpOpen, setFollowUpOpen] = useState(false);

  const save = (patch: Parameters<typeof update<"tasks">>[2]) => void update("tasks", task.id, patch).catch(() => {});

  const followups = db.task_followups
    .filter((f) => f.task_id === task.id && f.deleted_at === null)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const attachedCount = db.attachments.filter((a) => a.deleted_at === null && a.task_id === task.id).length;
  const group = task.group_id ? groupProgress(db.tasks, task.group_id) : null;
  const sourceNote = task.source_note_id ? noteById.get(task.source_note_id) : undefined;
  const delegated = task.assignee_person_id !== null;
  const person = delegated ? personById.get(task.assignee_person_id!) : undefined;
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

  const statusTone: Record<TaskStatus, string | undefined> = { open: undefined, in_progress: "blue", blocked: "red", done: "green" };

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
          onChange={(v) =>
            save({ assignee_person_id: v || null, follow_up_date: v && !task.follow_up_date ? addWorkdays(today, 3) : task.follow_up_date })
          }
        />
        <ChipDate
          title="Fällig"
          value={task.due_date}
          onChange={(v) => save({ due_date: v })}
          placeholder="Fällig"
          format={(v) => `fällig ${relativeLabel(v, today)}`}
          tone={task.due_date && task.due_date < today && task.status !== "done" ? "red" : undefined}
        />
        <ChipSelect
          title="Thema"
          value={task.topic_id ?? ""}
          placeholder="Thema"
          options={[
            { value: "", label: "Kein Thema" },
            ...topics.filter((t) => !t.archived || t.id === task.topic_id).map((t) => ({ value: t.id, label: t.name })),
          ]}
          onChange={(v) => save({ topic_id: v || null })}
        />
        <ChipSelect
          title="Priorität"
          icon={<Flag size={14} />}
          tone={task.priority === "high" ? "red" : undefined}
          value={task.priority === "medium" ? "" : task.priority}
          placeholder="Priorität"
          options={[
            { value: "", label: "Mittel" },
            { value: "high", label: PRIORITY_LABEL.high },
            { value: "low", label: PRIORITY_LABEL.low },
          ]}
          onChange={(v) => save({ priority: (v || "medium") as Priority })}
        />
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

      {delegated && (
        <div className="delegation-box">
          <div className="row">
            {person && <Avatar name={person.name} />}
            <span className="grow">
              Wartet auf <strong>{person?.name ?? "?"}</strong>
              {followups.length > 0 && <span className="muted"> · {followups.length}× nachgefragt</span>}
            </span>
            <ChipDate
              icon={<CalendarClock size={14} />}
              title="Nachhaken am"
              value={task.follow_up_date}
              onChange={(v) => save({ follow_up_date: v })}
              placeholder="Nachhaken"
              format={(v) => relativeLabel(v, today)}
              tone={task.follow_up_date && task.follow_up_date <= today ? "red" : undefined}
            />
          </div>
          {followUpOpen ? (
            <FollowUpForm task={task} onDone={() => setFollowUpOpen(false)} />
          ) : (
            <div className="row">
              <button className="btn" onClick={() => setFollowUpOpen(true)}>
                Nachgehakt
              </button>
              <a className="btn ghost" href={mailto(task)} title={person?.email ? `Mail an ${person.email}` : "Keine E-Mail hinterlegt"}>
                <Mail size={15} /> Mail
              </a>
            </div>
          )}
        </div>
      )}

      <AutoText
        value={description}
        onChange={setDescription}
        onBlur={() => description !== task.description && save({ description })}
        placeholder="Notizen…"
        minRows={2}
      />

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

      <Disclosure
        title="Links"
        meta={attachedCount > 0 ? attachedCount : undefined}
        defaultOpen={attachedCount > 0}
        action={
          <button
            className="icon-btn"
            title="Neuer Link"
            onClick={() =>
              openCapture({ type: "link", companyId: task.company_id, topicId: task.topic_id ?? undefined, attachTo: { taskId: task.id } })
            }
          >
            <Plus size={16} />
          </button>
        }
      >
        <AttachedLinks target={{ taskId: task.id }} />
      </Disclosure>

      {followups.length > 0 && (
        <Disclosure title="Verlauf" meta={followups.length}>
          <ul className="history">
            {followups.map((f) => (
              <li key={f.id}>
                <span className="muted">{formatDate(f.date)}</span> {f.note || <span className="muted">nachgefragt</span>}
              </li>
            ))}
          </ul>
        </Disclosure>
      )}

      <p className="meta-line">
        Angelegt {formatDate(task.created_at.slice(0, 10))}
        {task.done_at && ` · erledigt ${formatDate(task.done_at.slice(0, 10))}`}
        {group && group.total > 1 && (
          <>
            {" · "}
            {group.done}/{group.total} Firmen erledigt
            {group.openCompanyIds.length > 0 && ` (offen: ${group.openCompanyIds.map((id) => companyById.get(id)?.short).join(", ")})`}
          </>
        )}
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
export function TaskList({ tasks, showCompany = true, empty }: { tasks: Task[]; showCompany?: boolean; empty?: string }) {
  if (tasks.length === 0) return empty ? <div className="empty-inline">{empty}</div> : null;
  return (
    <div className="task-list">
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} showCompany={showCompany} />
      ))}
    </div>
  );
}
