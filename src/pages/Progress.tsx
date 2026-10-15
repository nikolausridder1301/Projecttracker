import { useState } from "react";
import { Link } from "react-router-dom";
import { useLookups, useStore } from "../data/store";
import type { Company, Topic } from "../data/types";
import { todayIso } from "../logic/dates";
import { MILESTONE_STATES, isOverdue, progress } from "../logic/milestones";
import { CompanyLogo, Empty } from "../ui/common";
import { MilestoneCell, MilestoneDialog, StateIcon } from "../ui/milestones";

// Fortschritt: Meilensteine (Zeilen) × Gesellschaften (Spalten). Klick auf
// eine Zelle setzt Status, Zieldatum und Kommentar.

export function ProgressPage() {
  const { db } = useStore();
  const { companies } = useLookups();
  const [editing, setEditing] = useState<{ topic: Topic; company: Company } | null>(null);
  const today = todayIso();

  const topics = db.topics.filter((t) => t.deleted_at === null && !t.archived).sort((a, b) => a.sort - b.sort);
  const cols = companies.filter((c) => !c.is_external);
  const cells = db.milestone_status.filter((m) => m.deleted_at === null);
  const cellFor = (t: Topic, c: Company) => cells.find((m) => m.topic_id === t.id && m.company_id === c.id);
  const overdueCount = cells.filter((m) => isOverdue(m, today)).length;

  if (topics.length === 0) {
    return (
      <div className="page">
        <div className="page-head">
          <h1>Fortschritt</h1>
        </div>
        <Empty>
          Noch keine Meilensteine. Lege sie unter <Link to="/einstellungen">Einstellungen → Meilensteine</Link> an.
        </Empty>
      </div>
    );
  }

  return (
    <div className="page wide">
      <div className="page-head">
        <h1>Fortschritt</h1>
        {overdueCount > 0 && <span className="overdue small">{overdueCount} Zieldatum überschritten</span>}
      </div>

      <div className="ms-legend">
        {MILESTONE_STATES.map((s) => (
          <span key={s.value} className={`ms-legend-item tone-${s.tone}`}>
            <span className={`ms-cell tone-${s.tone} mini`}>
              <StateIcon state={s.value} size={12} />
            </span>
            {s.label}
          </span>
        ))}
      </div>

      <div className="card matrix-card">
        <div className="matrix-scroll">
          <table className="matrix">
            <thead>
              <tr>
                <th className="matrix-corner">Meilenstein</th>
                {cols.map((c) => {
                  const p = progress(
                    cells.filter((m) => m.company_id === c.id),
                    topics.length,
                  );
                  return (
                    <th key={c.id}>
                      <Link to={`/firmen/${c.id}`} className="matrix-company" title={c.name}>
                        <CompanyLogo company={c} size={28} />
                        <span>{c.short}</span>
                        <span className="muted small">
                          {p.done}/{p.total}
                        </span>
                      </Link>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {topics.map((t) => (
                <tr key={t.id}>
                  <th className="matrix-row-head">{t.name}</th>
                  {cols.map((c) => (
                    <td key={c.id}>
                      <MilestoneCell cell={cellFor(t, c)} topic={t} company={c} onOpen={() => setEditing({ topic: t, company: c })} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <MilestoneDialog
          cell={cellFor(editing.topic, editing.company)}
          topic={editing.topic}
          company={editing.company}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
