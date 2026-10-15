import { CheckCircle2, Mail } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLookups, useStore } from "../data/store";
import { TRAFFIC_LABEL, type Company, type TrafficLight } from "../data/types";
import { formatDate, relativeLabel, todayIso } from "../logic/dates";
import { todayView } from "../logic/tasks";
import { CompanyLogo, TrafficDot } from "../ui/common";
import { FollowUpForm, TaskList, TaskRow, useTaskActions } from "../ui/tasks";

export function TodayPage() {
  const { db } = useStore();
  const today = todayIso();
  const v = useMemo(() => todayView(db.tasks, today), [db.tasks, today]);
  const mine = v.overdue.length + v.today.length + v.week.length;
  const allClear = mine + v.followUp.length + v.blocked.length === 0;
  const weekday = new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="page">
      <div className="page-head">
        <h1>Heute</h1>
        <span className="muted">{weekday}</span>
      </div>

      <TrafficBar />

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
                      <TaskList tasks={[...list]} />
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
                  <FollowUpRow key={t.id} taskId={t.id} />
                ))}
              </div>
            </section>
          )}

          {v.blocked.length > 0 && (
            <section className="card">
              <h2 className="group-title">
                Blockiert <span className="muted">{v.blocked.length}</span>
              </h2>
              <TaskList tasks={v.blocked} />
            </section>
          )}
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
              <span className={`meta${task.follow_up_date <= todayIso() ? " overdue" : ""}`} title={`Nachhaken am ${formatDate(task.follow_up_date)}${count > 0 ? ` · ${count}× nachgefragt` : ""}`}>
                {relativeLabel(task.follow_up_date, todayIso())}
              </span>
            )}
            <a className="icon-btn" href={mailto(task)} title="Mail schreiben">
              <Mail size={15} />
            </a>
            <button className="btn small" onClick={() => setOpen(!open)} title="Nachgefragt – nächstes Datum setzen">
              Nachgehakt
            </button>
          </>
        }
      />
      {last && (
        <div className="last-followup" title={`Letzte Notiz vom ${formatDate(last.date)}`}>
          „{last.note}“ · {formatDate(last.date)}
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
