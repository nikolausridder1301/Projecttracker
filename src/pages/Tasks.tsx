import { SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLookups, useStore } from "../data/store";
import { PRIORITY_LABEL, STATUS_LABEL, type Id, type Priority, type Task, type TaskStatus } from "../data/types";
import { endOfWeek, formatDate, todayIso } from "../logic/dates";
import { compareTasks, isActive, splitDone } from "../logic/tasks";
import { CompanySelect, Empty, TopicSelect, usePersisted } from "../ui/common";
import { TaskList, TaskRow } from "../ui/tasks";
import { useCaptureContext } from "../ui/uiState";

export interface TaskFilter {
  company: Id | "";
  topic: Id | "";
  /** "" alle, "me" ich, "delegated" alle Delegierten, sonst Personen-ID */
  assignee: string;
  status: TaskStatus | "" | "active";
  priority: Priority | "";
  due: "" | "overdue" | "week" | "none";
  showDone: boolean;
  groupBy: "" | "company" | "topic" | "person" | "status";
}

const INITIAL: TaskFilter = {
  company: "",
  topic: "",
  assignee: "",
  status: "",
  priority: "",
  due: "",
  showDone: false,
  groupBy: "company",
};

export function applyFilter(tasks: Task[], f: TaskFilter, today = todayIso()): Task[] {
  const weekEnd = endOfWeek(today);
  return tasks
    .filter(isActive)
    .filter((t) => f.showDone || f.status === "done" || t.status !== "done")
    .filter((t) => !f.company || t.company_id === f.company)
    .filter((t) => !f.topic || t.topic_id === f.topic)
    .filter((t) =>
      !f.assignee
        ? true
        : f.assignee === "me"
          ? t.assignee_person_id === null
          : f.assignee === "delegated"
            ? t.assignee_person_id !== null
            : t.assignee_person_id === f.assignee,
    )
    .filter((t) => !f.status || f.status === "active" || t.status === f.status)
    .filter((t) => !f.priority || t.priority === f.priority)
    .filter((t) =>
      f.due === "overdue"
        ? t.due_date !== null && t.due_date < today && t.status !== "done"
        : f.due === "week"
          ? t.due_date !== null && t.due_date <= weekEnd
          : f.due === "none"
            ? t.due_date === null
            : true,
    )
    .sort(compareTasks);
}

export function TasksPage() {
  const { db } = useStore();
  const [f, setF] = usePersisted<TaskFilter>("tasks", INITIAL);
  useCaptureContext(f.company || undefined, f.topic || undefined);
  const tasks = useMemo(() => applyFilter(db.tasks, f), [db.tasks, f]);
  const set = (patch: Partial<TaskFilter>) => setF({ ...f, ...patch });

  return (
    <div className="page">
      <div className="page-head">
        <h1>Aufgaben</h1>
        <span className="muted">{tasks.length}</span>
      </div>
      <TaskFilterBar f={f} set={set} reset={() => setF({ ...INITIAL, groupBy: f.groupBy })} />
      {tasks.length === 0 ? <Empty>Keine Aufgaben für diese Filter.</Empty> : <TaskSections tasks={tasks} groupBy={f.groupBy} />}
    </div>
  );
}

export function TaskFilterBar({
  f,
  set,
  reset,
  hideCompany,
}: {
  f: TaskFilter;
  set: (p: Partial<TaskFilter>) => void;
  reset: () => void;
  isFiltered?: boolean;
  hideCompany?: boolean;
}) {
  const { people } = useLookups();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  // Zahl der "versteckten" Filter, damit sichtbar ist, dass etwas aktiv ist
  const personFilter = f.assignee !== "" && f.assignee !== "me" && f.assignee !== "delegated";
  const advanced = [f.topic, personFilter ? "x" : "", f.status, f.priority, f.due, f.showDone ? "x" : ""].filter(Boolean).length;

  return (
    <div className="filters">
      <div className="seg-group">
        {(
          [
            ["", "Alle"],
            ["me", "Meine"],
            ["delegated", "Delegiert"],
          ] as const
        ).map(([v, label]) => (
          <button key={v} className={`seg${f.assignee === v ? " active" : ""}`} onClick={() => set({ assignee: v })}>
            {label}
          </button>
        ))}
      </div>
      {!hideCompany && <CompanySelect className="compact" value={f.company} onChange={(v) => set({ company: v })} allowAll="Alle Firmen" />}
      <div className="popover-anchor" ref={ref}>
        <button className={`btn${advanced > 0 ? " active-filter" : ""}`} onClick={() => setOpen(!open)} aria-expanded={open}>
          <SlidersHorizontal size={15} /> Filter{advanced > 0 && <span className="count">{advanced}</span>}
        </button>
        {open && (
          <div className="popover">
            <label>
              Thema
              <TopicSelect value={f.topic} onChange={(v) => set({ topic: v })} emptyLabel="Alle" />
            </label>
            <label>
              Person
              <select value={personFilter ? f.assignee : ""} onChange={(e) => set({ assignee: e.target.value })}>
                <option value="">Alle</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select value={f.status} onChange={(e) => set({ status: e.target.value as TaskFilter["status"] })}>
                <option value="">Alle</option>
                {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Priorität
              <select value={f.priority} onChange={(e) => set({ priority: e.target.value as Priority | "" })}>
                <option value="">Alle</option>
                {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fällig
              <select value={f.due} onChange={(e) => set({ due: e.target.value as TaskFilter["due"] })}>
                <option value="">Egal</option>
                <option value="overdue">Überfällig</option>
                <option value="week">Bis Ende der Woche</option>
                <option value="none">Ohne Datum</option>
              </select>
            </label>
            <label>
              Gruppieren
              <select value={f.groupBy} onChange={(e) => set({ groupBy: e.target.value as TaskFilter["groupBy"] })}>
                <option value="">Nicht gruppieren</option>
                <option value="company">nach Firma</option>
                <option value="topic">nach Thema</option>
                <option value="person">nach Verantwortlichem</option>
                <option value="status">nach Status</option>
              </select>
            </label>
            <label className="inline">
              <input type="checkbox" className="check" checked={f.showDone} onChange={(e) => set({ showDone: e.target.checked })} /> Erledigte zeigen
            </label>
            <button className="btn ghost" onClick={reset}>
              Zurücksetzen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Offene Aufgaben (gruppiert), darunter abgesetzt die Erledigten als eigene
 * Liste nach Erledigt-Datum – so mischen sich beide nie.
 */
export function TaskSections({ tasks, groupBy, showCompany = true }: { tasks: Task[]; groupBy: TaskFilter["groupBy"]; showCompany?: boolean }) {
  const { open, done } = splitDone(tasks);
  return (
    <>
      {open.length > 0 ? (
        <GroupedTasks tasks={open} groupBy={groupBy} showCompany={showCompany} />
      ) : (
        done.length > 0 && <div className="empty-inline">Keine offenen Aufgaben.</div>
      )}
      {done.length > 0 && (
        <>
          <div className="section-divider">
            <span>Erledigt</span>
            <span className="muted">{done.length}</span>
          </div>
          <div className="card list-card done-list">
            {done.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                showCompany={showCompany}
                rightLabel={<span className="due">{t.done_at ? formatDate(t.done_at.slice(0, 10)) : ""}</span>}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}

export function GroupedTasks({ tasks, groupBy, showCompany = true }: { tasks: Task[]; groupBy: TaskFilter["groupBy"]; showCompany?: boolean }) {
  const { companyById, topicById, personById, companies, topics } = useLookups();
  if (!groupBy) {
    return (
      <div className="card">
        <TaskList tasks={tasks} showCompany={showCompany} />
      </div>
    );
  }
  const keyOf = (t: Task): string =>
    groupBy === "company"
      ? t.company_id
      : groupBy === "topic"
        ? (t.topic_id ?? "")
        : groupBy === "person"
          ? (t.assignee_person_id ?? "")
          : t.status;
  const labelOf = (k: string): string =>
    groupBy === "company"
      ? (companyById.get(k)?.name ?? "?")
      : groupBy === "topic"
        ? (topicById.get(k)?.name ?? "Ohne Thema")
        : groupBy === "person"
          ? (k ? (personById.get(k)?.name ?? "?") : "Ich")
          : STATUS_LABEL[k as TaskStatus];
  const order = (k: string): number =>
    groupBy === "company"
      ? companies.findIndex((c) => c.id === k)
      : groupBy === "topic"
        ? k
          ? topics.findIndex((t) => t.id === k)
          : 999
        : groupBy === "person"
          ? k
            ? 1
            : 0
          : (Object.keys(STATUS_LABEL) as string[]).indexOf(k);

  const groups = new Map<string, Task[]>();
  for (const t of tasks) {
    const k = keyOf(t);
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  const keys = [...groups.keys()].sort((a, b) => order(a) - order(b) || labelOf(a).localeCompare(labelOf(b), "de"));

  return (
    <div className="groups">
      {keys.map((k) => (
        <section key={k} className="card">
          <h3 className="group-title">
            {labelOf(k)} <span className="muted">{groups.get(k)!.length}</span>
          </h3>
          <TaskList tasks={groups.get(k)!} showCompany={showCompany && groupBy !== "company"} />
        </section>
      ))}
    </div>
  );
}
