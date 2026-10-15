import { useEffect, useState } from "react";
import { useLookups, useStore } from "../data/store";
import { PRIORITY_LABEL, STATUS_LABEL, type Priority, type Task, type TaskStatus } from "../data/types";
import { addWorkdays, formatDate, relativeLabel, todayIso } from "../logic/dates";
import { checklistProgress, groupProgress, validateTask } from "../logic/tasks";
import { AttachedLinks } from "./links";
import {
  AssigneeSelect,
  CompanyBadge,
  CompanySelect,
  Markdown,
  PrioBadge,
  StatusBadge,
  TopicSelect,
} from "./common";
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
// Zeile
// ---------------------------------------------------------------------------

export function TaskRow({ task, showCompany = true, extra }: { task: Task; showCompany?: boolean; extra?: React.ReactNode }) {
  const { db } = useStore();
  const { topicById, personById, companyById } = useLookups();
  const { openTask } = useUi();
  const { setDone } = useTaskActions();
  const today = todayIso();
  const cl = checklistProgress(task);
  const group = task.group_id ? groupProgress(db.tasks, task.group_id) : null;
  const person = task.assignee_person_id ? personById.get(task.assignee_person_id) : undefined;
  const done = task.status === "done";
  const overdue = !done && task.due_date !== null && task.due_date < today;

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
        <span className="task-title">{task.title}</span>
        <span className="task-meta">
          {showCompany && <CompanyBadge id={task.company_id} />}
          {task.topic_id && <span className="muted">{topicById.get(task.topic_id)?.name}</span>}
          {person && <span className="person-chip">→ {person.name}</span>}
          {task.status === "blocked" && <span className="blocked-reason">⛔ {task.blocked_reason}</span>}
          {cl.total > 0 && (
            <span className="muted">
              ☑ {cl.done}/{cl.total}
            </span>
          )}
          {group && group.total > 1 && (
            <span
              className="muted"
              title={`Offen: ${group.openCompanyIds.map((id) => companyById.get(id)?.short).join(", ") || "–"}`}
            >
              ⧉ {group.done}/{group.total} Firmen
            </span>
          )}
        </span>
      </button>
      <span className="task-right">
        {extra}
        {task.status === "in_progress" && <StatusBadge status="in_progress" />}
        <PrioBadge priority={task.priority} />
        {task.due_date && (
          <span className={`due${overdue ? " overdue" : ""}`} title={`Fällig ${formatDate(task.due_date)}`}>
            {relativeLabel(task.due_date, today)}
          </span>
        )}
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
  const [next, setNext] = useState(addWorkdays(todayIso(), 3));
  return (
    <form
      className="followup-form"
      onSubmit={async (e) => {
        e.preventDefault();
        await followUp(task, note.trim(), next || null);
        onDone();
      }}
    >
      <input autoFocus placeholder="Notiz (optional), z. B. „Sagt Freitag zu“" value={note} onChange={(e) => setNote(e.target.value)} />
      <label className="inline">
        Nächstes Nachhaken
        <input type="date" value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      <button className="btn primary" type="submit">
        Speichern
      </button>
      <button className="btn" type="button" onClick={onDone}>
        Abbrechen
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
  const { companyById, noteById, personById } = useLookups();
  const { mailto } = useTaskActions();
  const { openCapture } = useUi();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [editDesc, setEditDesc] = useState(false);
  const [blockedReason, setBlockedReason] = useState(task.blocked_reason);
  const [pendingBlocked, setPendingBlocked] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [followUpOpen, setFollowUpOpen] = useState(false);

  const save = (patch: Parameters<typeof update<"tasks">>[2]) => void update("tasks", task.id, patch).catch(() => {});

  const followups = db.task_followups
    .filter((f) => f.task_id === task.id && f.deleted_at === null)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const group = task.group_id ? groupProgress(db.tasks, task.group_id) : null;
  const sourceNote = task.source_note_id ? noteById.get(task.source_note_id) : undefined;
  const person = task.assignee_person_id ? personById.get(task.assignee_person_id) : undefined;

  const setStatus = (status: TaskStatus) => {
    if (status === "blocked") {
      if (!blockedReason.trim()) {
        setPendingBlocked(true);
        return;
      }
    }
    save({ status, done_at: status === "done" ? new Date().toISOString() : null });
  };

  const confirmBlocked = () => {
    const err = validateTask({ title, status: "blocked", blocked_reason: blockedReason });
    if (err) return toast(err, "error");
    save({ status: "blocked", blocked_reason: blockedReason.trim(), done_at: null });
    setPendingBlocked(false);
  };

  return (
    <div className="editor">
      <div className="panel-head">
        <span className="muted">Aufgabe</span>
        <span className="spacer" />
        <button className="btn ghost" onClick={() => void trash("tasks", task.id, task.title).then(onClose)}>
          Löschen
        </button>
        <button className="btn ghost" onClick={onClose} aria-label="Schließen">
          ✕
        </button>
      </div>

      <input
        className="title-input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => (title.trim() ? title !== task.title && save({ title: title.trim() }) : setTitle(task.title))}
      />

      <div className="status-switch" role="radiogroup" aria-label="Status">
        {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
          <button
            key={s}
            role="radio"
            aria-checked={task.status === s}
            className={`seg status-${s}${task.status === s || (s === "blocked" && pendingBlocked) ? " active" : ""}`}
            onClick={() => setStatus(s)}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {(task.status === "blocked" || pendingBlocked) && (
        <div className="field">
          <label>Grund für „Blockiert“ (Pflicht)</label>
          <div className="row">
            <input
              autoFocus={pendingBlocked}
              value={blockedReason}
              onChange={(e) => setBlockedReason(e.target.value)}
              onBlur={() => task.status === "blocked" && blockedReason.trim() && save({ blocked_reason: blockedReason.trim() })}
              onKeyDown={(e) => e.key === "Enter" && pendingBlocked && confirmBlocked()}
              placeholder="Woran hängt es?"
            />
            {pendingBlocked && (
              <>
                <button className="btn primary" onClick={confirmBlocked}>
                  Blockieren
                </button>
                <button className="btn" onClick={() => setPendingBlocked(false)}>
                  Abbrechen
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="grid2">
        <div className="field">
          <label>Firma</label>
          <CompanySelect value={task.company_id} onChange={(v) => save({ company_id: v })} />
        </div>
        <div className="field">
          <label>Thema</label>
          <TopicSelect value={task.topic_id ?? ""} onChange={(v) => save({ topic_id: v || null })} />
        </div>
        <div className="field">
          <label>Verantwortlich</label>
          <AssigneeSelect value={task.assignee_person_id ?? ""} onChange={(v) => save({ assignee_person_id: v || null })} />
        </div>
        <div className="field">
          <label>Priorität</label>
          <select value={task.priority} onChange={(e) => save({ priority: e.target.value as Priority })}>
            {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Fällig</label>
          <input type="date" value={task.due_date ?? ""} onChange={(e) => save({ due_date: e.target.value || null })} />
        </div>
        {task.assignee_person_id && (
          <div className="field">
            <label>Nachhaken am</label>
            <input
              type="date"
              value={task.follow_up_date ?? ""}
              onChange={(e) => save({ follow_up_date: e.target.value || null })}
            />
          </div>
        )}
      </div>

      {task.assignee_person_id && (
        <section className="section">
          <div className="section-head">
            <h3>Nachhaken</h3>
            <span className="muted">{followups.length}× nachgefragt</span>
            <span className="spacer" />
            <a className="btn" href={mailto(task)} title={person?.email ? `Mail an ${person.email}` : "Keine E-Mail hinterlegt"}>
              ✉ Mail
            </a>
            {!followUpOpen && (
              <button className="btn primary" onClick={() => setFollowUpOpen(true)}>
                Nachgehakt
              </button>
            )}
          </div>
          {followUpOpen && <FollowUpForm task={task} onDone={() => setFollowUpOpen(false)} />}
          {followups.length > 0 && (
            <ul className="history">
              {followups.map((f) => (
                <li key={f.id}>
                  <span className="muted">{formatDate(f.date)}</span> {f.note || <em className="muted">ohne Notiz</em>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h3>Beschreibung</h3>
          <span className="spacer" />
          <button className="btn ghost" onClick={() => setEditDesc(!editDesc)}>
            {editDesc ? "Fertig" : "Bearbeiten"}
          </button>
        </div>
        {editDesc ? (
          <textarea
            autoFocus
            rows={8}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => description !== task.description && save({ description })}
            placeholder="Markdown möglich: **fett**, - Liste, [Link](https://…)"
          />
        ) : description.trim() ? (
          <div onDoubleClick={() => setEditDesc(true)}>
            <Markdown text={description} />
          </div>
        ) : (
          <button className="link-btn muted" onClick={() => setEditDesc(true)}>
            + Beschreibung hinzufügen
          </button>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h3>Checkliste</h3>
          {task.checklist.length > 0 && (
            <span className="muted">
              {checklistProgress(task).done}/{task.checklist.length}
            </span>
          )}
        </div>
        <ul className="checklist">
          {task.checklist.map((item, i) => (
            <li key={i}>
              <input
                type="checkbox"
                checked={item.done}
                onChange={() =>
                  save({ checklist: task.checklist.map((c, j) => (j === i ? { ...c, done: !c.done } : c)) })
                }
              />
              <span className={item.done ? "is-done-text" : ""}>{item.text}</span>
              <button
                className="btn ghost small"
                aria-label="Punkt entfernen"
                onClick={() => save({ checklist: task.checklist.filter((_, j) => j !== i) })}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newItem.trim()) return;
            save({ checklist: [...task.checklist, { text: newItem.trim(), done: false }] });
            setNewItem("");
          }}
        >
          <input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="+ Punkt hinzufügen (Enter)" />
        </form>
      </section>

      <section className="section">
        <div className="section-head">
          <h3>Links</h3>
          <span className="spacer" />
          <button
            className="btn ghost"
            onClick={() => openCapture({ type: "link", companyId: task.company_id, topicId: task.topic_id ?? undefined, attachTo: { taskId: task.id } })}
          >
            + Neuer Link
          </button>
        </div>
        <AttachedLinks target={{ taskId: task.id }} />
      </section>

      {(group || sourceNote) && (
        <section className="section">
          {group && group.total > 1 && (
            <p className="muted">
              Teil einer Gruppe: {group.done}/{group.total} Firmen erledigt
              {group.openCompanyIds.length > 0 &&
                ` · offen: ${group.openCompanyIds.map((id) => companyById.get(id)?.short).join(", ")}`}
            </p>
          )}
          {sourceNote && (
            <p className="muted">
              Entstanden aus: <a href={`#/notizen/${sourceNote.id}`} onClick={onClose}>{sourceNote.title}</a>
            </p>
          )}
        </section>
      )}

      <p className="muted small">
        Angelegt {formatDate(task.created_at.slice(0, 10))}
        {task.done_at && ` · erledigt ${formatDate(task.done_at.slice(0, 10))}`}
      </p>
    </div>
  );
}

/** Aufgaben eines bestimmten Filters als Liste. */
export function TaskList({ tasks, showCompany = true, empty }: { tasks: Task[]; showCompany?: boolean; empty?: string }) {
  if (tasks.length === 0) return empty ? <div className="empty small">{empty}</div> : null;
  return (
    <div className="task-list">
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} showCompany={showCompany} />
      ))}
    </div>
  );
}

