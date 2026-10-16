import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useLookups, useStore } from "../data/store";
import type { Task } from "../data/types";
import { todayIso } from "../logic/dates";
import { compareTasks, effectiveDue, isActive, isOpen, personsOf } from "../logic/tasks";
import { CompanyBadge, Empty } from "../ui/common";
import { TaskRow } from "../ui/tasks";

// „Delegiert“: alle offenen Delegationen nach Person – was zuerst fällig ist, steht oben
// (nächster Termin aus Fälligkeit und offenen Schritten).

export function WaitingPage() {
  const { db } = useStore();
  const { personById, me } = useLookups();
  const today = todayIso();
  const dueKey = (t: Task) => effectiveDue(t) ?? "9999-99-99";

  const groups = useMemo(() => {
    // Delegiert = an andere; die eigene Person zählt nicht
    const others = (t: Task) => personsOf(t).filter((id) => id !== me?.id);
    const open = db.tasks.filter((t) => isActive(t) && isOpen(t) && others(t).length > 0);
    const m = new Map<string, Task[]>();
    // Bei jeder Person, die verantwortlich ist oder einen offenen Schritt hat
    for (const t of open) for (const pid of others(t)) m.set(pid, [...(m.get(pid) ?? []), t]);
    return [...m.entries()]
      .map(([pid, tasks]) => ({ pid, tasks: tasks.sort(compareTasks) }))
      .sort((a, b) => (dueKey(a.tasks[0]) < dueKey(b.tasks[0]) ? -1 : dueKey(a.tasks[0]) > dueKey(b.tasks[0]) ? 1 : 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.tasks, me?.id]);

  // Aufgaben mit mehreren Personen nur einmal zählen
  const total = new Set(groups.flatMap((g) => g.tasks.map((t) => t.id))).size;
  const overdueCount = new Set(groups.flatMap((g) => g.tasks.filter((t) => dueKey(t) < today).map((t) => t.id))).size;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Delegiert</h1>
        <span className="muted">
          {total} offen{overdueCount > 0 && ` · ${overdueCount} überfällig`}
        </span>
      </div>
      {groups.length === 0 ? (
        <Empty>Keine offenen Delegationen. Delegieren: In einer Aufgabe unter „Verantwortlich“ eine Person wählen.</Empty>
      ) : (
        <div className="groups">
          {groups.map(({ pid, tasks }) => {
            const p = personById.get(pid);
            return (
              <section key={pid} className="card">
                <h3 className="row">
                  <Link to={`/personen/${pid}`}>{p?.name ?? "?"}</Link>
                  {p?.company_id && <CompanyBadge id={p.company_id} />}
                  {p?.role && <span className="muted small">{p.role}</span>}
                  <span className="muted">({tasks.length})</span>
                </h3>
                <div className="task-list">
                  {tasks.map((t) => (
                    <TaskRow key={t.id} task={t} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
