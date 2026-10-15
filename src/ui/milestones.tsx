import { AlertTriangle, CalendarClock, Check, Clock, Minus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useStore } from "../data/store";
import type { Company, MilestoneState, MilestoneStatus, Topic } from "../data/types";
import { formatDate, todayIso } from "../logic/dates";
import { MILESTONE_STATES, isOverdue, stateDef } from "../logic/milestones";
import { AutoText, ChipDate, CompanyLogo } from "./common";

// Meilenstein-Zellen (Fortschritts-Matrix, Firmenseite) und Bearbeiten-Dialog.

export function StateIcon({ state, size = 14 }: { state: MilestoneState; size?: number }) {
  switch (state) {
    case "done":
      return <Check size={size} />;
    case "delayed":
      return <AlertTriangle size={size} />;
    case "at_risk":
      return <Clock size={size} />;
    case "n_a":
      return <Minus size={size} />;
    case "on_track":
      return <span className="ms-dot" />;
    default:
      return <span className="ms-dot hollow" />;
  }
}

/** Zelle: Symbol in Statusfarbe, darunter ggf. Zieldatum; rot umrandet, wenn überfällig. */
export function MilestoneCell({
  cell,
  topic,
  company,
  onOpen,
  showLabel = false,
}: {
  cell: MilestoneStatus | undefined;
  topic: Topic;
  company: Company;
  onOpen: () => void;
  showLabel?: boolean;
}) {
  const today = todayIso();
  const state = cell?.status ?? "not_started";
  const def = stateDef(state);
  const overdue = cell ? isOverdue(cell, today) : false;
  const title = [
    `${topic.name} · ${company.short}: ${def.label}`,
    cell?.target_date ? `Ziel ${formatDate(cell.target_date)}${overdue ? " (überschritten)" : ""}` : "",
    cell?.comment ?? "",
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <button className={`ms-cell tone-${def.tone}${overdue ? " overdue-cell" : ""}`} onClick={onOpen} title={title} aria-label={title}>
      <StateIcon state={state} />
      {showLabel && <span>{def.label}</span>}
      {cell?.target_date && state !== "done" && state !== "n_a" && (
        <span className={`ms-date${overdue ? " overdue" : ""}`}>{formatDate(cell.target_date).slice(0, 6)}</span>
      )}
    </button>
  );
}

export function MilestoneDialog({
  cell,
  topic,
  company,
  onClose,
}: {
  cell: MilestoneStatus | undefined;
  topic: Topic;
  company: Company;
  onClose: () => void;
}) {
  const { insert, update, toast } = useStore();
  const [state, setState] = useState<MilestoneState>(cell?.status ?? "not_started");
  const [target, setTarget] = useState<string | null>(cell?.target_date ?? null);
  const [comment, setComment] = useState(cell?.comment ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    setBusy(true);
    try {
      const patch = { status: state, target_date: target, comment: comment.trim() };
      if (cell) await update("milestone_status", cell.id, patch);
      else await insert("milestone_status", [{ topic_id: topic.id, company_id: company.id, ...patch }]);
      toast(`${topic.name} · ${company.short}: ${stateDef(state).label}`);
      onClose();
    } catch {
      /* Fehler wurde gemeldet */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal ms-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="row">
          <CompanyLogo company={company} size={32} />
          <div className="grow">
            <h2>{topic.name}</h2>
            <div className="muted small">{company.name}</div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Schließen">
            <X size={18} />
          </button>
        </div>
        <div className="ms-options" role="radiogroup" aria-label="Status">
          {MILESTONE_STATES.map((s) => (
            <button
              type="button"
              key={s.value}
              role="radio"
              aria-checked={state === s.value}
              className={`ms-option tone-${s.tone}${state === s.value ? " selected" : ""}`}
              onClick={() => setState(s.value)}
            >
              <StateIcon state={s.value} />
              {s.label}
            </button>
          ))}
        </div>
        <div className="row">
          <span className="muted small">Zieldatum</span>
          <ChipDate icon={<CalendarClock size={14} />} title="Zieldatum" value={target} onChange={setTarget} placeholder="kein Ziel" format={formatDate} />
        </div>
        <label className="field">
          <span className="muted small">Kommentar (optional)</span>
          <AutoText value={comment} onChange={setComment} minRows={2} placeholder="z. B. Schnittstelle wartet auf ERP-Anbieter" />
        </label>
        <div className="row">
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn primary" type="submit" disabled={busy}>
            Speichern
          </button>
        </div>
      </form>
    </div>
  );
}

/** Meilensteine einer Firma als Liste (Firmenseite). */
export function CompanyMilestones({ company }: { company: Company }) {
  const { db } = useStore();
  const topics = db.topics.filter((t) => t.deleted_at === null && !t.archived).sort((a, b) => a.sort - b.sort);
  const [editing, setEditing] = useState<Topic | null>(null);
  const cellFor = (t: Topic) => db.milestone_status.find((m) => m.deleted_at === null && m.topic_id === t.id && m.company_id === company.id);
  if (topics.length === 0) return <div className="empty-inline">Keine Meilensteine angelegt (Einstellungen → Meilensteine).</div>;
  return (
    <>
      <div className="ms-list">
        {topics.map((t) => {
          const cell = cellFor(t);
          return (
            <div key={t.id} className="ms-list-row">
              <span className="grow">
                {t.name}
                {cell?.comment && <span className="task-sub">{cell.comment}</span>}
              </span>
              <MilestoneCell cell={cell} topic={t} company={company} onOpen={() => setEditing(t)} showLabel />
            </div>
          );
        })}
      </div>
      {editing && <MilestoneDialog cell={cellFor(editing)} topic={editing} company={company} onClose={() => setEditing(null)} />}
    </>
  );
}
