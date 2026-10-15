import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLookups, useStore } from "../data/store";
import { TRAFFIC_LABEL, type Company, type TrafficLight } from "../data/types";
import { formatDate, todayIso } from "../logic/dates";
import { todayView } from "../logic/tasks";
import { CompanyLogo, TrafficDot } from "../ui/common";
import { FollowUpForm, TaskList, TaskRow, useTaskActions } from "../ui/tasks";

export function TodayPage() {
  const { db } = useStore();
  const today = todayIso();
  const v = useMemo(() => todayView(db.tasks, today), [db.tasks, today]);
  const allClear = v.overdue.length + v.today.length + v.week.length + v.followUp.length + v.blocked.length === 0;
  const weekday = new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="page">
      <div className="page-head">
        <h1>Heute</h1>
        <span className="muted">{weekday}</span>
      </div>

      <TrafficBar />

      {allClear ? (
        <div className="card all-clear">✓ Alles erledigt für heute.</div>
      ) : (
        <div className="today-grid">
          <section className="card">
            <h2>Meine Fälligen</h2>
            {v.overdue.length > 0 && (
              <>
                <h4 className="bucket overdue">Überfällig ({v.overdue.length})</h4>
                <TaskList tasks={v.overdue} />
              </>
            )}
            <h4 className="bucket">Heute ({v.today.length})</h4>
            <TaskList tasks={v.today} empty="Nichts für heute fällig." />
            {v.week.length > 0 && (
              <>
                <h4 className="bucket">Diese Woche ({v.week.length})</h4>
                <TaskList tasks={v.week} />
              </>
            )}
          </section>

          <section className="card">
            <h2>Heute nachhaken</h2>
            {v.followUp.length === 0 ? (
              <div className="empty small">Niemand zum Nachhaken.</div>
            ) : (
              <div className="task-list">
                {v.followUp.map((t) => (
                  <FollowUpRow key={t.id} taskId={t.id} />
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <h2>Blockiert</h2>
            <TaskList tasks={v.blocked} empty="Nichts blockiert." />
          </section>
        </div>
      )}
    </div>
  );
}

/** Delegierte Aufgabe mit direktem "Nachgehakt"/Mail. */
export function FollowUpRow({ taskId }: { taskId: string }) {
  const { db } = useStore();
  const { mailto } = useTaskActions();
  const [open, setOpen] = useState(false);
  const task = db.tasks.find((t) => t.id === taskId);
  if (!task) return null;
  const followups = db.task_followups
    .filter((f) => f.task_id === task.id && f.deleted_at === null)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const count = followups.length;
  const last = followups.find((f) => f.note);
  return (
    <div className="followup-wrap">
      <TaskRow
        task={task}
        extra={
          <>
            {task.follow_up_date && (
              <span className={`muted small${task.follow_up_date <= todayIso() ? " overdue" : ""}`} title="Nachhaken am">
                ⏰ {formatDate(task.follow_up_date)}
              </span>
            )}
            {count > 0 && <span className="muted small" title="Bisher nachgefragt">{count}×</span>}
            <a className="btn small" href={mailto(task)} title="Mail schreiben">
              ✉
            </a>
            <button className="btn small" onClick={() => setOpen(!open)}>
              Nachgehakt
            </button>
          </>
        }
      />
      {last && (
        <div className="muted small last-followup" title={`Letzte Notiz vom ${formatDate(last.date)}`}>
          „{last.note}“ ({formatDate(last.date)})
        </div>
      )}
      {open && <FollowUpForm task={task} onDone={() => setOpen(false)} />}
    </div>
  );
}

export function TrafficBar() {
  const { companies } = useLookups();
  return (
    <div className="traffic-bar">
      {companies.map((c) => (
        <TrafficTile key={c.id} company={c} />
      ))}
    </div>
  );
}

function TrafficTile({ company }: { company: Company }) {
  return (
    <div className="traffic-tile" title={company.traffic_comment || TRAFFIC_LABEL[company.traffic_light]}>
      <Link to={`/firmen/${company.id}`} className="traffic-link">
        <CompanyLogo company={company} size={36} />
        <span className="traffic-name">{company.short}</span>
      </Link>
      <TrafficPicker company={company} />
    </div>
  );
}

export function TrafficPicker({ company, withComment }: { company: Company; withComment?: boolean }) {
  const { update } = useStore();
  const [comment, setComment] = useState(company.traffic_comment);
  const set = (light: TrafficLight) =>
    void update("companies", company.id, { traffic_light: light, traffic_changed_at: new Date().toISOString() }).catch(() => {});
  return (
    <div className="traffic-picker">
      <div className="row tight">
        {(["green", "yellow", "red"] as TrafficLight[]).map((l) => (
          <button
            key={l}
            className={`dot-btn${company.traffic_light === l ? " active" : ""}`}
            onClick={() => set(l)}
            aria-label={`Ampel ${TRAFFIC_LABEL[l]}`}
            aria-pressed={company.traffic_light === l}
          >
            <TrafficDot light={l} />
          </button>
        ))}
      </div>
      {withComment && (
        <input
          className="traffic-comment"
          placeholder="Kommentar zur Ampel"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onBlur={() =>
            comment !== company.traffic_comment &&
            void update("companies", company.id, { traffic_comment: comment, traffic_changed_at: new Date().toISOString() }).catch(() => {})
          }
        />
      )}
    </div>
  );
}
