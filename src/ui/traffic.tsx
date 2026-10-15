import { ArrowRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../data/store";
import { TRAFFIC_LABEL, type Company, type TrafficLight } from "../data/types";
import { formatDate, todayIso } from "../logic/dates";
import { sinceLabel, validateTrafficChange } from "../logic/traffic";
import { AutoText, CompanyLogo, TrafficDot } from "./common";

// Firmen-Ampel: in Übersichten nur anzeigen, ändern bewusst im Dialog –
// mit Begründung (Pflicht bei Gelb/Rot) und Verlauf.

const LIGHTS: TrafficLight[] = ["green", "yellow", "red"];

/** Verlauf einer Firma, neueste zuerst. */
export function useTrafficHistory(companyId: string) {
  const { db } = useStore();
  return db.traffic_history
    .filter((h) => h.company_id === companyId && h.deleted_at === null)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function TrafficHistoryList({ companyId, limit }: { companyId: string; limit?: number }) {
  const entries = useTrafficHistory(companyId);
  if (entries.length === 0) return <div className="empty-inline">Noch keine Änderungen festgehalten.</div>;
  return (
    <ol className="timeline traffic-history">
      {(limit ? entries.slice(0, limit) : entries).map((h) => (
        <li key={h.id}>
          <span className="timeline-date">{formatDate(h.created_at.slice(0, 10))}</span>
          <span className="traffic-change" title={`${h.from_light ? TRAFFIC_LABEL[h.from_light] : "–"} → ${TRAFFIC_LABEL[h.to_light]}`}>
            {h.from_light && h.from_light !== h.to_light && (
              <>
                <TrafficDot light={h.from_light} />
                <ArrowRight size={12} className="muted" />
              </>
            )}
            <TrafficDot light={h.to_light} />
          </span>
          <span className="timeline-text">{h.comment || <span className="muted">ohne Begründung</span>}</span>
        </li>
      ))}
    </ol>
  );
}

export function TrafficDialog({ company, onClose }: { company: Company; onClose: () => void }) {
  const { update, insert, toast } = useStore();
  const [light, setLight] = useState<TrafficLight>(company.traffic_light);
  const [comment, setComment] = useState(company.traffic_comment);
  const [busy, setBusy] = useState(false);
  const today = todayIso();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    const err = validateTrafficChange({ light: company.traffic_light, comment: company.traffic_comment }, { light, comment });
    if (err === "Keine Änderung.") return onClose();
    if (err) return toast(err, "error");
    setBusy(true);
    try {
      const text = comment.trim();
      await update("companies", company.id, { traffic_light: light, traffic_comment: text, traffic_changed_at: new Date().toISOString() });
      await insert("traffic_history", [{ company_id: company.id, from_light: company.traffic_light, to_light: light, comment: text }]);
      toast(`Ampel ${company.short}: ${TRAFFIC_LABEL[light]}`);
      onClose();
    } catch {
      /* Fehler wurde gemeldet */
    } finally {
      setBusy(false);
    }
  };

  const needsReason = light !== "green";

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal traffic-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="row">
          <CompanyLogo company={company} size={36} />
          <div className="grow">
            <h2>{company.name}</h2>
            <div className="muted small">
              Aktuell {TRAFFIC_LABEL[company.traffic_light]}
              {company.traffic_changed_at && ` · ${sinceLabel(company.traffic_changed_at, today)}`}
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Schließen">
            <X size={18} />
          </button>
        </div>

        <div className="traffic-options" role="radiogroup" aria-label="Ampel">
          {LIGHTS.map((l) => (
            <button
              type="button"
              key={l}
              role="radio"
              aria-checked={light === l}
              className={`traffic-option tone-${l}${light === l ? " selected" : ""}`}
              onClick={() => setLight(l)}
            >
              <TrafficDot light={l} />
              {TRAFFIC_LABEL[l]}
            </button>
          ))}
        </div>

        <label className="field">
          <span className="muted small">{needsReason ? "Warum? (Pflicht bei Gelb und Rot)" : "Kommentar (optional)"}</span>
          <AutoText value={comment} onChange={setComment} minRows={2} placeholder="z. B. Datenexport aus dem ERP fehlt noch" />
        </label>

        <div className="row">
          <Link to={`/firmen/${company.id}`} className="link-btn small" onClick={onClose}>
            Zur Firmenseite
          </Link>
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn primary" type="submit" disabled={busy}>
            Speichern
          </button>
        </div>

        <div className="traffic-dialog-history">
          <div className="muted small">Verlauf</div>
          <TrafficHistoryList companyId={company.id} limit={5} />
        </div>
      </form>
    </div>
  );
}

/** Kompakte Anzeige: ein Punkt + „seit …“, Kommentar als Tooltip. */
export function TrafficStatus({ company }: { company: Company }) {
  const since = sinceLabel(company.traffic_changed_at, todayIso());
  return (
    <span className="traffic-status" title={company.traffic_comment || TRAFFIC_LABEL[company.traffic_light]}>
      <TrafficDot light={company.traffic_light} />
      <span>{TRAFFIC_LABEL[company.traffic_light]}</span>
      {since && <span className="muted">{since}</span>}
    </span>
  );
}
