import { useMemo } from "react";
import { useLookups, useStore } from "../data/store";
import type { Id, Task } from "../data/types";
import { formatDate, localDate } from "../logic/dates";
import { compareTasks, isActive, isMine, personsOf, splitDone } from "../logic/tasks";
import { CompanyFilter, Empty, FilterSelect, usePersisted } from "../ui/common";
import { TaskList, TaskRow } from "../ui/tasks";
import { useCaptureContext } from "../ui/uiState";

// Aufgaben: eine schlanke Filterleiste – Alle/Meine/Delegiert, Firmen,
// Gruppieren und „Erledigte zeigen“. Fälliges steht auf „Heute“, Delegiertes
// unter „Delegiert“; dafür braucht es hier keine weiteren Filter.

export interface TaskFilter {
  /** leer = alle Firmen */
  companies: Id[];
  /** "" alle, "me" ohne Verantwortliche, "delegated" mit Person (verantwortlich oder im Schritt) */
  assignee: "" | "me" | "delegated";
  showDone: boolean;
  groupBy: "" | "company" | "person";
}

const INITIAL: TaskFilter = { companies: [], assignee: "", showDone: false, groupBy: "company" };

/** Früher gespeicherte Filter (Thema, Status, Fälligkeit …) still auf die heutigen Felder bringen. */
function cleanFilter(stored: Partial<TaskFilter> & Record<string, unknown>): TaskFilter {
  return {
    companies: Array.isArray(stored.companies) ? (stored.companies as Id[]) : [],
    assignee: stored.assignee === "me" || stored.assignee === "delegated" ? stored.assignee : "",
    showDone: stored.showDone === true,
    groupBy: stored.groupBy === "" || stored.groupBy === "person" ? stored.groupBy : "company",
  };
}

export function applyFilter(tasks: Task[], f: TaskFilter): Task[] {
  return tasks
    .filter(isActive)
    .filter((t) => f.showDone || t.status !== "done")
    .filter((t) => f.companies.length === 0 || t.company_ids.some((c) => f.companies.includes(c)))
    .filter((t) =>
      f.assignee === "me" ? isMine(t) : f.assignee === "delegated" ? personsOf(t).length > 0 : true,
    )
    .sort(compareTasks);
}

export function TasksPage() {
  const { db } = useStore();
  const [stored, setF] = usePersisted<TaskFilter>("tasks", INITIAL);
  const f = cleanFilter(stored as TaskFilter & Record<string, unknown>);
  useCaptureContext(f.companies.length === 1 ? f.companies[0] : undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tasks = useMemo(() => applyFilter(db.tasks, f), [db.tasks, JSON.stringify(f)]);
  const set = (patch: Partial<TaskFilter>) => setF({ ...f, ...patch });

  return (
    <div className="page">
      <div className="page-head">
        <h1>Aufgaben</h1>
        <span className="muted">{tasks.length}</span>
      </div>
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
        <CompanyFilter value={f.companies} onChange={(v) => set({ companies: v })} />
        <FilterSelect
          title="Gruppieren"
          value={f.groupBy}
          options={[
            { value: "company", label: "Nach Firma" },
            { value: "person", label: "Nach Person" },
            { value: "", label: "Nicht gruppieren" },
          ]}
          onChange={(v) => set({ groupBy: v as TaskFilter["groupBy"] })}
        />
        <label className="inline">
          <input type="checkbox" className="check" checked={f.showDone} onChange={(e) => set({ showDone: e.target.checked })} /> Erledigte zeigen
        </label>
      </div>
      {tasks.length === 0 ? <Empty>Keine Aufgaben für diese Filter.</Empty> : <TaskSections tasks={tasks} groupBy={f.groupBy} />}
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
                rightLabel={<span className="due">{t.done_at ? formatDate(localDate(t.done_at)) : ""}</span>}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}

export function GroupedTasks({ tasks, groupBy, showCompany = true }: { tasks: Task[]; groupBy: TaskFilter["groupBy"]; showCompany?: boolean }) {
  const { companyById, personById, companies, me } = useLookups();
  if (!groupBy) {
    return (
      <div className="card">
        <TaskList tasks={tasks} showCompany={showCompany} />
      </div>
    );
  }
  // Eine Aufgabe steht in jeder ihrer Gruppen: bei jeder Firma bzw. jeder Person
  // (verantwortlich oder im offenen Schritt); ohne Firma/Person in einer eigenen Gruppe.
  const keysOf = (t: Task): string[] => {
    // die eigene Person steht in der Gruppe „ich“ (leerer Schlüssel)
    const keys = groupBy === "company" ? t.company_ids : [...new Set(personsOf(t).map((id) => (id === me?.id ? "" : id)))];
    return keys.length > 0 ? keys : [""];
  };
  const labelOf = (k: string): string =>
    groupBy === "company" ? (k ? (companyById.get(k)?.name ?? "?") : "Ohne Firma") : k ? (personById.get(k)?.name ?? "?") : (me?.name ?? "Ich");
  const order = (k: string): number =>
    groupBy === "company" ? (k ? companies.findIndex((c) => c.id === k) : 999) : k ? 1 : 0;

  const groups = new Map<string, Task[]>();
  for (const t of tasks) {
    for (const k of keysOf(t)) groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  const keys = [...groups.keys()].sort((a, b) => order(a) - order(b) || labelOf(a).localeCompare(labelOf(b), "de"));

  return (
    <div className="groups">
      {keys.map((k) => (
        <section key={k || "none"} className="card">
          <h3 className="group-title">
            {labelOf(k)} <span className="muted">{groups.get(k)!.length}</span>
          </h3>
          <TaskList tasks={groups.get(k)!} showCompany={showCompany && groupBy !== "company"} />
        </section>
      ))}
    </div>
  );
}
