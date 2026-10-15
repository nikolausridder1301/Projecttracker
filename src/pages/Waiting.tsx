import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useLookups, useStore } from "../data/store";
import type { Task } from "../data/types";
import { todayIso } from "../logic/dates";
import { isActive, isDelegated, isOpen } from "../logic/tasks";
import { CompanyBadge, Empty } from "../ui/common";
import { FollowUpRow } from "./Today";

// "Wartet auf…" (SPEC 6.4): alle offenen Delegationen nach Person.

export function WaitingPage() {
  const { db } = useStore();
  const { personById } = useLookups();
  const today = todayIso();

  const groups = useMemo(() => {
    const open = db.tasks.filter((t) => isActive(t) && isOpen(t) && isDelegated(t));
    const m = new Map<string, Task[]>();
    for (const t of open) m.set(t.assignee_person_id!, [...(m.get(t.assignee_person_id!) ?? []), t]);
    const key = (t: Task) => t.follow_up_date ?? t.due_date ?? "9999";
    return [...m.entries()]
      .map(([pid, tasks]) => ({ pid, tasks: tasks.sort((a, b) => (key(a) < key(b) ? -1 : 1)) }))
      .sort((a, b) => (key(a.tasks[0]) < key(b.tasks[0]) ? -1 : 1));
  }, [db.tasks]);

  const total = groups.reduce((s, g) => s + g.tasks.length, 0);
  const dueNow = groups.reduce((s, g) => s + g.tasks.filter((t) => t.follow_up_date && t.follow_up_date <= today).length, 0);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Wartet auf…</h1>
        <span className="muted">
          {total} offene Delegationen{dueNow > 0 && ` · ${dueNow} heute nachhaken`}
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
                    <FollowUpRow key={t.id} taskId={t.id} />
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
