import { CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useLookups, useStore } from "../data/store";
import { TRAFFIC_LABEL, type Company } from "../data/types";
import { todayIso } from "../logic/dates";
import { followUpReason, todayView } from "../logic/tasks";
import { sinceLabel } from "../logic/traffic";
import { TrafficDialog } from "../ui/traffic";
import { CompanyLogo, TrafficDot, usePersisted } from "../ui/common";
import { FollowUpForm, TaskList, TaskRow, shortDay } from "../ui/tasks";

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
  const allClear = mine + v.followUp.length + v.blocked.length === 0;
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

      {!all && <TrafficBar />}

      {allClear ? (
        <div className="all-clear">
          <CheckCircle2 size={18} /> Alles erledigt für heute – nichts fällig, niemand zum Nachhaken, nichts blockiert.
        </div>
      ) : (
        <div className="today-grid">
          {mine > 0 && (
            <section className="card">
              <h2 className="group-title">
                Meine Fälligen <span className="muted">{mine}</span>
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

          {v.followUp.length > 0 && (
            <section className="card">
              <h2 className="group-title">
                Heute nachhaken <span className="muted">{v.followUp.length}</span>
              </h2>
              <div className="task-list">
                {v.followUp.map((t) => (
                  <FollowUpRow key={t.id} taskId={t.id} showProject={all} />
                ))}
              </div>
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

/** Delegierte Aufgabe mit direktem "Nachgehakt"/Mail. */
export function FollowUpRow({ taskId, showProject }: { taskId: string; showProject?: boolean }) {
  const { allDb: db } = useStore();
  const [open, setOpen] = useState(false);
  const task = db.tasks.find((t) => t.id === taskId);
  if (!task) return null;
  const today = todayIso();
  const followups = db.task_followups
    .filter((f) => f.task_id === task.id && f.deleted_at === null)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const last = followups[0];
  const reason = followUpReason(task, today);

  // Rechts: warum jetzt (Frist/Nachhaken fällig) – sonst wann das nächste Mal
  const right = reason ? (
    <span className={`followup-reason${reason.urgent ? " overdue" : ""}`}>{reason.label}</span>
  ) : (
    <span className="followup-reason">{task.follow_up_date ? `nachhaken ${shortDay(task.follow_up_date)}` : "kein Termin"}</span>
  );
  // Zweite Zeile: Stand der Nachfragen in einem Satz
  const summary =
    followups.length === 0
      ? "noch nicht nachgefragt"
      : `${followups.length}× nachgefragt · zuletzt ${shortDay(last.date)}${last.note ? `: „${last.note}“` : ""}`;

  return (
    <div className="followup-wrap">
      <TaskRow
        task={task}
        showProject={showProject}
        rightLabel={right}
        subExtra={summary}
        extra={
          !open && (
            <button className="btn small" onClick={() => setOpen(true)}>
              Nachfrage notieren
            </button>
          )
        }
      />
      {open && <FollowUpForm task={task} onDone={() => setOpen(false)} />}
    </div>
  );
}

export function TrafficBar() {
  const { companies } = useLookups();
  const [editing, setEditing] = useState<Company | null>(null);
  return (
    <>
      <div className="traffic-bar">
        {companies.map((c) => (
          <TrafficTile key={c.id} company={c} onOpen={() => setEditing(c)} />
        ))}
      </div>
      {editing && <TrafficDialog company={companies.find((c) => c.id === editing.id) ?? editing} onClose={() => setEditing(null)} />}
    </>
  );
}

/** Kachel: Logo, Kürzel, ein Ampelpunkt + „seit …“. Klick öffnet den Ampel-Dialog. */
function TrafficTile({ company, onOpen }: { company: Company; onOpen: () => void }) {
  const since = sinceLabel(company.traffic_changed_at, todayIso());
  return (
    <button
      className={`traffic-tile light-${company.traffic_light}`}
      onClick={onOpen}
      title={`${company.name}: ${TRAFFIC_LABEL[company.traffic_light]}${company.traffic_comment ? ` – ${company.traffic_comment}` : ""}`}
    >
      <CompanyLogo company={company} size={36} />
      <span className="traffic-name">{company.short}</span>
      <span className="traffic-state">
        <TrafficDot light={company.traffic_light} />
        {since && <span>{since}</span>}
      </span>
    </button>
  );
}
