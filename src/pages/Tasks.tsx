import { useMemo } from "react";
import { useLookups, useStore } from "../data/store";
import { PRIORITY_LABEL, STATUS_LABEL, type Id, type Priority, type Task, type TaskStatus } from "../data/types";
import { endOfWeek, todayIso } from "../logic/dates";
import { compareTasks, isActive } from "../logic/tasks";
import { CompanySelect, Empty, TopicSelect, usePersisted } from "../ui/common";
import { TaskList } from "../ui/tasks";
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
  const isFiltered = JSON.stringify({ ...f, groupBy: "" }) !== JSON.stringify({ ...INITIAL, groupBy: "" });

  return (
    <div className="page">
      <div className="page-head">
        <h1>Aufgaben</h1>
        <span className="muted">{tasks.length} Einträge</span>
      </div>
      <TaskFilterBar f={f} set={set} reset={() => setF({ ...INITIAL, groupBy: f.groupBy })} isFiltered={isFiltered} />
      {tasks.length === 0 ? <Empty>Keine Aufgaben für diese Filter.</Empty> : <GroupedTasks tasks={tasks} groupBy={f.groupBy} />}
    </div>
  );
}

export function TaskFilterBar({
  f,
  set,
  reset,
  isFiltered,
  hideCompany,
}: {
  f: TaskFilter;
  set: (p: Partial<TaskFilter>) => void;
  reset: () => void;
  isFiltered: boolean;
  hideCompany?: boolean;
}) {
  const { people } = useLookups();
  return (
    <div className="filters">
      {!hideCompany && <CompanySelect value={f.company} onChange={(v) => set({ company: v })} allowAll="Alle Firmen" />}
      <TopicSelect value={f.topic} onChange={(v) => set({ topic: v })} emptyLabel="Alle Themen" />
      <select value={f.assignee} onChange={(e) => set({ assignee: e.target.value })}>
        <option value="">Alle Verantwortlichen</option>
        <option value="me">Ich</option>
        <option value="delegated">Alle Delegierten</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <select value={f.status} onChange={(e) => set({ status: e.target.value as TaskFilter["status"] })}>
        <option value="">Alle Status</option>
        {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <select value={f.priority} onChange={(e) => set({ priority: e.target.value as Priority | "" })}>
        <option value="">Alle Prioritäten</option>
        {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
          <option key={p} value={p}>
            {PRIORITY_LABEL[p]}
          </option>
        ))}
      </select>
      <select value={f.due} onChange={(e) => set({ due: e.target.value as TaskFilter["due"] })}>
        <option value="">Jede Fälligkeit</option>
        <option value="overdue">Überfällig</option>
        <option value="week">Bis Ende der Woche</option>
        <option value="none">Ohne Datum</option>
      </select>
      <select value={f.groupBy} onChange={(e) => set({ groupBy: e.target.value as TaskFilter["groupBy"] })} title="Gruppieren">
        <option value="">Nicht gruppieren</option>
        <option value="company">nach Firma</option>
        <option value="topic">nach Thema</option>
        <option value="person">nach Verantwortlichem</option>
        <option value="status">nach Status</option>
      </select>
      <label className="inline">
        <input type="checkbox" checked={f.showDone} onChange={(e) => set({ showDone: e.target.checked })} /> Erledigte zeigen
      </label>
      {isFiltered && (
        <button className="btn ghost small" onClick={reset}>
          Filter zurücksetzen
        </button>
      )}
    </div>
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
          <h3>
            {labelOf(k)} <span className="muted">({groups.get(k)!.length})</span>
          </h3>
          <TaskList tasks={groups.get(k)!} showCompany={showCompany && groupBy !== "company"} />
        </section>
      ))}
    </div>
  );
}
