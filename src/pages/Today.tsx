import { CheckCircle2 } from "lucide-react";
import { useMemo } from "react";
import { useStore } from "../data/store";
import { todayIso } from "../logic/dates";
import { todayView } from "../logic/tasks";
import { usePersisted } from "../ui/common";
import { TaskList } from "../ui/tasks";

export function TodayPage() {
  const { db, allDb, projects } = useStore();
  const [scope, setScope] = usePersisted<{ all: boolean }>("today", { all: false });
  const today = todayIso();
  const multi = projects.filter((p) => !p.archived).length > 1;
  const all = multi && scope.all;
  // „Alle Projekte“: Aufgaben aller nicht archivierten Projekte
  const tasks = useMemo(() => {
    if (!all) return db.tasks;
    const active = new Set(projects.filter((p) => !p.archived).map((p) => p.id));
    return allDb.tasks.filter((t) => active.has(t.project_id));
  }, [all, db.tasks, allDb.tasks, projects]);
  const v = useMemo(() => todayView(tasks, today), [tasks, today]);
  const mine = v.overdue.length + v.today.length + v.week.length;
  const allClear = mine + v.blocked.length === 0;
  const weekday = new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="page">
      <div className="page-head">
        <h1>Heute</h1>
        <span className="muted">{weekday}</span>
        <span className="spacer" />
        {multi && (
          <div className="seg-group">
            <button className={`seg${!all ? " active" : ""}`} onClick={() => setScope({ all: false })}>
              Dieses Projekt
            </button>
            <button className={`seg${all ? " active" : ""}`} onClick={() => setScope({ all: true })}>
              Alle Projekte
            </button>
          </div>
        )}
      </div>

      {allClear ? (
        <div className="all-clear">
          <CheckCircle2 size={18} /> Alles erledigt für heute – nichts fällig, nichts blockiert.
        </div>
      ) : (
        <div className="today-grid">
          {mine > 0 && (
            <section className="card">
              <h2 className="group-title">
                Fällig <span className="muted">{mine}</span>
              </h2>
              {(
                [
                  ["Überfällig", v.overdue, true],
                  ["Heute", v.today, false],
                  ["Diese Woche", v.week, false],
                ] as const
              ).map(
                ([label, list, red]) =>
                  list.length > 0 && (
                    <div key={label}>
                      <h4 className={`bucket${red ? " overdue" : ""}`}>{label}</h4>
                      <TaskList tasks={[...list]} showProject={all} />
                    </div>
                  ),
              )}
            </section>
          )}

          {v.blocked.length > 0 && (
            <section className="card">
              <h2 className="group-title">
                Blockiert <span className="muted">{v.blocked.length}</span>
              </h2>
              <TaskList tasks={v.blocked} showProject={all} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
