import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../data/store";
import { search, type Hit, type HitType } from "../logic/search";
import { useUi } from "./uiState";

// Globale Suche (SPEC 6.9), geöffnet mit Strg+K.

const TYPE_LABEL: Record<HitType, string> = { task: "Aufgaben", note: "Notizen", vendor: "Tacto", link: "Links", person: "Personen" };

export function SearchPalette() {
  const { searchOpen, setSearchOpen } = useUi();
  if (!searchOpen) return null;
  return <Palette onClose={() => setSearchOpen(false)} />;
}

function Palette({ onClose }: { onClose: () => void }) {
  const { db } = useStore();
  const { openTask } = useUi();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const hits = useMemo(() => search(db, q), [db, q]);

  useEffect(() => setSel(0), [q]);

  const go = (h: Hit) => {
    onClose();
    if (h.type === "task") openTask(h.id);
    else if (h.type === "note") navigate(`/notizen/${h.id}`);
    else if (h.type === "person") navigate(`/personen/${h.id}`);
    else if (h.type === "vendor") navigate(`/tacto?id=${h.id}`);
    else {
      const l = db.links.find((x) => x.id === h.id);
      if (l) window.open(l.url, "_blank", "noopener,noreferrer");
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter" && hits[sel]) go(hits[sel]);
  };

  let lastType: HitType | null = null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal palette" role="dialog" aria-label="Suche">
        <input
          autoFocus
          className="capture-input"
          placeholder="Suchen in Aufgaben, Notizen, Links, Personen…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
        />
        <div className="palette-results">
          {q && hits.length === 0 && <div className="empty small">Nichts gefunden.</div>}
          {hits.map((h, i) => {
            const header = h.type !== lastType ? <div className="palette-group">{TYPE_LABEL[h.type]}</div> : null;
            lastType = h.type;
            return (
              <div key={`${h.type}-${h.id}`}>
                {header}
                <button className={`picker-item${i === sel ? " selected" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => go(h)}>
                  <span>{h.title}</span>
                  <span className="muted small">{h.sub}</span>
                </button>
              </div>
            );
          })}
        </div>
        
      </div>
    </div>
  );
}
