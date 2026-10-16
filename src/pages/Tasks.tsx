import { SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLookups, useStore } from "../data/store";
import { STATUS_LABEL, type Id, type Task, type TaskStatus } from "../data/types";
import { endOfWeek, formatDate, todayIso } from "../logic/dates";
import { compareTasks, isActive, splitDone } from "../logic/tasks";
import { CompanyFilter, Empty, FilterSelect, usePersisted } from "../ui/common";
import { TaskList, TaskRow } from "../ui/tasks";
import { useCaptureContext } from "../ui/uiState";

export interface TaskFilter {
  /** leer = alle Firmen */
  companies: Id[];
  topic: Id | "";
  /** "" alle, "me" ich, "delegated" alle Delegierten, sonst Personen-ID */
  assignee: string;
  status: TaskStatus | "" | "active";
  /** nur als wichtig markierte */
  important: boolean;
  due: "" | "overdue" | "week" | "none";
  showDone: boolean;
  groupBy: "" | "company" | "topic" | "person" | "status";
}

const INITIAL: TaskFilter = {
  companies: [],
  topic: "",
  assignee: "",
  status: "",
  important: false,
  due: "",
  showDone: false,
  groupBy: "company",
};

export function applyFilter(tasks: Task[], f: TaskFilter, today = todayIso()): Task[] {
  const weekEnd = endOfWeek(today);
  return tasks
    .filter(isActive)
    .filter((t) => f.showDone || f.status === "done" || t.status !== "done")
    .filter((t) => f.companies.length === 0 || f.companies.includes(t.company_id))
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
    .filter((t) => !f.important || t.priority === "high")
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
  const [stored, setF] = usePersisted<TaskFilter>("tasks", INITIAL);
  // Ältere gespeicherte Filter (eine Firma, Status „In Arbeit“) still bereinigen
  const f: TaskFilter = {
    ...stored,
    companies: Array.isArray(stored.companies) ? stored.companies : [],
    status: (["", "active", "open", "blocked", "done"] as string[]).includes(stored.status) ? stored.status : "",
  };
  useCaptureContext(f.companies.length === 1 ? f.companies[0] : undefined);
  const tasks = useMemo(() => applyFilter(db.tasks, f), [db.tasks, f]);
  // Früher gespeicherte Gruppierung „nach Thema“ gibt es nicht mehr
  const groupBy = f.groupBy === "topic" ? "company" : f.groupBy;
  const set = (patch: Partial<TaskFilter>) => setF({ ...f, ...patch });

  return (
    <div className="page">
      <div className="page-head">
        <h1>Aufgaben</h1>
        <span className="muted">{tasks.length}</span>
      </div>
      <TaskFilterBar f={f} set={set} reset={() => setF({ ...INITIAL, groupBy: f.groupBy })} />
      {tasks.length === 0 ? <Empty>Keine Aufgaben für diese Filter.</Empty> : <TaskSections tasks={tasks} groupBy={groupBy} />}
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
    // Auswahllisten liegen außerhalb (Portal) – Klicks darin schließen das Filtermenü nicht
    const onDown = (e: MouseEvent) =>
      !ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest?.(".dropdown-menu") && setOpen(false);
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  // Zahl der "versteckten" Filter, damit sichtbar ist, dass etwas aktiv ist
  const personFilter = f.assignee !== "" && f.assignee !== "me" && f.assignee !== "delegated";
  const advanced = [personFilter ? "x" : "", f.status, f.important ? "x" : "", f.due, f.showDone ? "x" : ""].filter(Boolean).length;

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
      {!hideCompany && <CompanyFilter value={f.companies} onChange={(v) => set({ companies: v })} />}
      <div className="popover-anchor" ref={ref}>
        <button className={`btn${advanced > 0 ? " active-filter" : ""}`} onClick={() => setOpen(!open)} aria-expanded={open}>
          <SlidersHorizontal size={15} /> Filter{advanced > 0 && <span className="count">{advanced}</span>}
        </button>
        {open && (
          <div className="popover">
            <label>
              Person
              <FilterSelect
                title="Person"
                value={personFilter ? f.assignee : ""}
                options={[{ value: "", label: "Alle" }, ...people.map((p) => ({ value: p.id, label: p.name }))]}
                onChange={(v) => set({ assignee: v })}
              />
            </label>
            <label>
              Status
              <FilterSelect
                title="Status"
                value={f.status}
                options={[{ value: "", label: "Alle" }, ...(Object.keys(STATUS_LABEL) as TaskStatus[]).map((st) => ({ value: st, label: STATUS_LABEL[st] }))]}
                onChange={(v) => set({ status: v as TaskFilter["status"] })}
              />
            </label>
            <label>
              Fällig
              <FilterSelect
                title="Fällig"
                value={f.due}
                options={[
                  { value: "", label: "Egal" },
                  { value: "overdue", label: "Überfällig" },
                  { value: "week", label: "Bis Ende der Woche" },
                  { value: "none", label: "Ohne Datum" },
                ]}
                onChange={(v) => set({ due: v as TaskFilter["due"] })}
              />
            </label>
            <label>
              Gruppieren
              <FilterSelect
                title="Gruppieren"
                value={f.groupBy}
                options={[
                  { value: "", label: "Nicht gruppieren" },
                  { value: "company", label: "nach Firma" },
                  { value: "person", label: "nach Verantwortlichem" },
                  { value: "status", label: "nach Status" },
                ]}
                onChange={(v) => set({ groupBy: v as TaskFilter["groupBy"] })}
              />
            </label>
            <label className="inline">
              <input type="checkbox" className="check" checked={f.important} onChange={(e) => set({ important: e.target.checked })} /> Nur wichtige
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
