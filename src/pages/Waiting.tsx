import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useLookups, useStore } from "../data/store";
import type { Task } from "../data/types";
import { formatDate, todayIso } from "../logic/dates";
import { STALE_DAYS, daysSinceUpdate, isActive, isDelegated, isOpen, staleLabel } from "../logic/tasks";
import { CompanyBadge, Empty } from "../ui/common";
import { TaskRow, useLatestUpdates } from "../ui/tasks";

// „Delegiert“: alle offenen Delegationen nach Person – was am längsten ohne Update ist, steht oben.

export function WaitingPage() {
  const { db } = useStore();
  const { personById } = useLookups();
  const today = todayIso();
  const latest = useLatestUpdates();
  const stale = (t: Task) => daysSinceUpdate(t, latest.get(t.id), today);

  const groups = useMemo(() => {
    const open = db.tasks.filter((t) => isActive(t) && isOpen(t) && isDelegated(t));
    const m = new Map<string, Task[]>();
    // Aufgaben mit mehreren Personen stehen bei jeder von ihnen
    for (const t of open) for (const pid of t.assignee_person_ids) m.set(pid, [...(m.get(pid) ?? []), t]);
    return [...m.entries()]
      .map(([pid, tasks]) => ({ pid, tasks: tasks.sort((a, b) => stale(b) - stale(a)) }))
      .sort((a, b) => stale(b.tasks[0]) - stale(a.tasks[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.tasks, latest, today]);

  // Aufgaben mit mehreren Personen nur einmal zählen
  const total = new Set(groups.flatMap((g) => g.tasks.map((t) => t.id))).size;
  const staleCount = new Set(groups.flatMap((g) => g.tasks.filter((t) => stale(t) >= STALE_DAYS).map((t) => t.id))).size;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Delegiert</h1>
        <span className="muted">
          {total} offen{staleCount > 0 && ` · ${staleCount} seit über 2 Wochen ohne Update`}
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
                    <TaskRow
                      key={t.id}
                      task={t}
                      subExtra={t.due_date ? `fällig ${formatDate(t.due_date)}` : undefined}
                      rightLabel={
                        <span className={`due${stale(t) >= STALE_DAYS ? " overdue" : ""}`}>{staleLabel(stale(t), latest.has(t.id))}</span>
                      }
                    />
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
