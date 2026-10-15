import { CalendarClock, Flag, Mail, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useLookups, useStore } from "../data/store";
import { PRIORITY_LABEL, STATUS_LABEL, type Priority, type Task, type TaskStatus } from "../data/types";
import { addWorkdays, formatDate, relativeLabel, todayIso } from "../logic/dates";
import { checklistProgress, groupProgress, validateTask } from "../logic/tasks";
import { AttachedLinks } from "./links";
import { AutoText, Avatar, ChipDate, ChipSelect, CompanyBadge, Disclosure } from "./common";
import { ProjectBadge } from "./ProjectSwitcher";
import { useUi } from "./uiState";

// ---------------------------------------------------------------------------
// Aktionen
// ---------------------------------------------------------------------------

export function useTaskActions() {
  const { update, insert, toast } = useStore();
  const { personById } = useLookups();

  const setDone = (t: Task, done: boolean) =>
    update("tasks", t.id, done ? { status: "done", done_at: new Date().toISOString() } : { status: "open", done_at: null });

  /** Nachfrage protokollieren; nächstes Datum setzen oder Aufgabe abschließen. */
  const followUp = async (t: Task, note: string, next: string | null, done = false) => {
    await insert("task_followups", [{ task_id: t.id, date: todayIso(), note }]);
    if (done) {
      await update("tasks", t.id, { follow_up_date: null, status: "done", done_at: new Date().toISOString() });
      toast(`Erledigt: ${t.title}`);
    } else {
      await update("tasks", t.id, { follow_up_date: next });
      toast(next ? `Notiert – nächstes Nachhaken ${formatDate(next)}` : "Notiert – kein weiteres Nachhaken geplant");
    }
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

export function TaskRow({
  task,
  showCompany = true,
  showProject = false,
  extra,
  rightLabel,
  subExtra,
}: {
  task: Task;
  showCompany?: boolean;
  /** Projekt-Kürzel zeigen („Heute – Alle Projekte“) */
  showProject?: boolean;
  extra?: React.ReactNode;
  /** ersetzt die Fälligkeit rechts (z. B. Grund fürs Nachhaken) */
  rightLabel?: React.ReactNode;
  /** zusätzliche Angabe in der zweiten Zeile */
  subExtra?: React.ReactNode;
}) {
  const { allDb: db, project: currentProject, setProject } = useStore();
  const { personById, companyById, projectById } = useLookups();
  const { openTask } = useUi();
  const taskProject = projectById.get(task.project_id);
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
          {task.priority === "high" && !done && <Flag size={14} className="tone-red flag" aria-label="Hohe Priorität" />}
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
// Nachhaken
// ---------------------------------------------------------------------------

const NEXT_OPTIONS = [
  { key: "3", label: "in 3 Tagen", days: 3 },
  { key: "5", label: "in 1 Woche", days: 5 },
  { key: "10", label: "in 2 Wochen", days: 10 },
] as const;

/** Wochentag + Datum, z. B. „Di, 20.10.“ */
export function shortDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = new Date(y, m - 1, d).toLocaleDateString("de-DE", { weekday: "short" }).replace(".", "");
  return `${wd}, ${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.`;
}

/**
 * „Nachfrage notieren“: Was wurde gefragt/vereinbart? Wann wieder nachhaken –
 * oder ist die Sache damit erledigt? Jede Nachfrage wird als eigener Eintrag
 * im Verlauf gespeichert, nichts wird überschrieben.
 */
export function FollowUpForm({ task, onDone }: { task: Task; onDone: () => void }) {
  const { followUp, mailto } = useTaskActions();
  const today = todayIso();
  const [note, setNote] = useState("");
  const [choice, setChoice] = useState<string>("3");
  const [custom, setCustom] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const next =
    choice === "none" ? null : choice === "custom" ? custom : addWorkdays(today, NEXT_OPTIONS.find((o) => o.key === choice)!.days);

  return (
    <form
      className="followup-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await followUp(task, note.trim(), next, done);
          onDone();
        } catch {
          /* Fehler wurde gemeldet */
        } finally {
          setBusy(false);
        }
      }}
    >
      <input
        autoFocus
        className="followup-note"
        placeholder="Was hast du gefragt oder erfahren? (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <label className="inline followup-done">
        <input type="checkbox" className="check" checked={done} onChange={(e) => setDone(e.target.checked)} />
        Damit erledigt – Aufgabe abschließen
      </label>
      {!done && (
        <div className="followup-next">
          <span className="muted small">Nächstes Nachhaken</span>
          <div className="seg-group">
            {NEXT_OPTIONS.map((o) => (
              <button type="button" key={o.key} className={`seg${choice === o.key ? " active" : ""}`} onClick={() => setChoice(o.key)}>
                {o.label}
              </button>
            ))}
            <button type="button" className={`seg${choice === "none" ? " active" : ""}`} onClick={() => setChoice("none")}>
              keins
            </button>
          </div>
          <ChipDate
            icon={<CalendarClock size={14} />}
            value={choice === "custom" ? custom : null}
            onChange={(v) => {
              setCustom(v);
              setChoice(v ? "custom" : "3");
            }}
            placeholder="Datum wählen"
            title="Eigenes Datum"
            format={shortDay}
          />
          <span className="muted small followup-preview">{next ? `→ ${shortDay(next)}` : "→ kein Termin"}</span>
        </div>
      )}
      <div className="row">
        <a className="btn ghost" href={mailto(task)}>
          <Mail size={15} /> Mail schreiben
        </a>
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={onDone}>
          Abbrechen
        </button>
        <button className="btn primary" type="submit" disabled={busy}>
          {done ? "Erledigt speichern" : "Notieren"}
        </button>
      </div>
    </form>
  );
}

/** Alle Nachfragen als Zeitleiste, neueste oben; einzelne Einträge löschbar. */
export function FollowUpHistory({ taskId, limit = 3 }: { taskId: string; limit?: number }) {
  const { allDb, purge } = useStore();
  const [all, setAll] = useState(false);
  const entries = allDb.task_followups
    .filter((f) => f.task_id === taskId && f.deleted_at === null)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  if (entries.length === 0) return null;
  const shown = all ? entries : entries.slice(0, limit);
  return (
    <ol className="timeline" aria-label="Verlauf der Nachfragen">
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
  const { companies, topics, people, companyById, noteById, personById } = useLookups();
  const { mailto, setDone } = useTaskActions();
  const { openCapture } = useUi();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [descOpen, setDescOpen] = useState(false);
  const showDescription = descOpen || description.trim() !== "";
  const [blockedReason, setBlockedReason] = useState(task.blocked_reason);
  const [pendingBlocked, setPendingBlocked] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [followUpOpen, setFollowUpOpen] = useState(false);

  const save = (patch: Parameters<typeof update<"tasks">>[2]) => void update("tasks", task.id, patch).catch(() => {});

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
            </span>
            <a className="icon-btn" href={mailto(task)} title={person?.email ? `Mail an ${person.email}` : "Keine E-Mail hinterlegt"}>
              <Mail size={16} />
            </a>
          </div>
          {/* Während das Formular offen ist, legt es den nächsten Termin fest – keine doppelte Angabe */}
          {!followUpOpen && (
          <div className="row">
            <span className="muted small">Nächstes Nachhaken</span>
            <ChipDate
              icon={<CalendarClock size={14} />}
              title="Nächstes Nachhaken"
              value={task.follow_up_date}
              onChange={(v) => save({ follow_up_date: v })}
              placeholder="kein Termin"
              format={shortDay}
              tone={task.follow_up_date && task.follow_up_date <= today ? "red" : undefined}
            />
            <span className="spacer" />
            <button className="btn primary" onClick={() => setFollowUpOpen(true)}>
              Nachfrage notieren
            </button>
          </div>
          )}
          {followUpOpen && <FollowUpForm task={task} onDone={() => setFollowUpOpen(false)} />}
          <FollowUpHistory taskId={task.id} />
        </div>
      )}

      {/* Beschreibung nur zeigen, wenn es eine gibt oder sie gerade geschrieben wird */}
      {showDescription ? (
        <AutoText
          value={description}
          onChange={setDescription}
          onBlur={() => {
            if (description !== task.description) save({ description });
            if (!description.trim()) setDescOpen(false);
          }}
          placeholder="Was genau ist zu tun? (fließt auch in die Nachfrage-Mail ein)"
          minRows={2}
          autoFocus={descOpen && !task.description}
        />
      ) : (
        <button className="link-btn add-desc" onClick={() => setDescOpen(true)}>
          + Beschreibung hinzufügen
        </button>
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
