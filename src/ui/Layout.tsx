import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useStore } from "../data/store";
import { daysBetween, todayIso } from "../logic/dates";
import { todayCount, todayView } from "../logic/tasks";
import { SK_LOGO } from "./common";
import { QuickCapture } from "./QuickCapture";
import { SearchPalette } from "./SearchPalette";
import { TaskPanel } from "./tasks";
import { useUi } from "./uiState";

const NAV = [
  { to: "/", label: "Heute", icon: "☀" },
  { to: "/aufgaben", label: "Aufgaben", icon: "✓" },
  { to: "/wartet", label: "Wartet auf…", icon: "⏳" },
  { to: "/notizen", label: "Notizen", icon: "✎" },
  { to: "/links", label: "Links", icon: "🔗" },
  { to: "/personen", label: "Personen", icon: "👤" },
  { to: "/firmen", label: "Firmen", icon: "🏢" },
];

export function Layout({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const { db, backend } = useStore();
  const { openCapture, setSearchOpen, capture, searchOpen, openTaskId } = useUi();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const online = useOnline();

  useEffect(() => setMenuOpen(false), [location.pathname]);

  // Tab-Titel mit Anzahl offener Heute-Punkte (SPEC 6.2)
  const count = useMemo(() => todayCount(todayView(db.tasks, todayIso())), [db.tasks]);
  useEffect(() => {
    document.title = count > 0 ? `(${count}) Projecttracker` : "Projecttracker";
  }, [count]);

  // Tastenkürzel: N = Schnellerfassung, Strg+K = Suche
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (!typing && !capture && !searchOpen && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        openCapture();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [capture, searchOpen, openCapture, setSearchOpen, openTaskId]);

  const lastExport = db.app_meta[0]?.last_export_at ?? null;
  const exportDue = !lastExport || daysBetween(lastExport.slice(0, 10), todayIso()) > 14;

  return (
    <div className={`app${menuOpen ? " menu-open" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <img src={SK_LOGO} alt="SK Group" width={32} height={32} />
          <span>Projecttracker</span>
        </div>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"} className="nav-item">
              <span className="nav-icon" aria-hidden>
                {n.icon}
              </span>
              {n.label}
              {n.to === "/" && count > 0 && <span className="nav-count">{count}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <NavLink to="/papierkorb" className="nav-item small">
            🗑 Papierkorb
          </NavLink>
          <NavLink to="/einstellungen" className="nav-item small">
            ⚙ Einstellungen
          </NavLink>
          <div className="muted small user-line" title={email}>
            {email}
          </div>
          <button className="nav-item small" onClick={onSignOut}>
            ⏻ Abmelden
          </button>
        </div>
      </aside>
      <div className="sidebar-scrim" onClick={() => setMenuOpen(false)} />

      <div className="main">
        <header className="topbar">
          <button className="btn ghost menu-btn" onClick={() => setMenuOpen(true)} aria-label="Menü">
            ☰
          </button>
          <button className="search-btn" onClick={() => setSearchOpen(true)}>
            <span>🔍 Suchen…</span>
            <kbd>Strg K</kbd>
          </button>
          <span className="spacer" />
          <button className="btn primary" onClick={() => openCapture()} title="Neu (Taste N)">
            + Neu
          </button>
        </header>

        {!online && <div className="banner error">Offline – Änderungen werden nicht gespeichert. Eingaben in Formularen bleiben als Entwurf erhalten.</div>}
        {backend.kind === "demo" && <div className="banner info">Demo-Modus: lokale Beispieldaten ohne Supabase (nur Entwicklung).</div>}
        {exportDue && (
          <div className="banner warn">
            {lastExport ? "Dein letztes Backup ist älter als 14 Tage." : "Du hast noch kein Backup exportiert."}{" "}
            <NavLink to="/einstellungen">Jetzt exportieren →</NavLink>
          </div>
        )}

        <main className="content">
          <Outlet />
        </main>
      </div>

      <TaskPanel />
      <QuickCapture />
      <SearchPalette />
      <Toasts />
    </div>
  );
}

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

function Toasts() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span>{t.text}</span>
          {t.undo && (
            <button
              className="btn small"
              onClick={() => {
                t.undo!();
                dismissToast(t.id);
              }}
            >
              Rückgängig
            </button>
          )}
          <button className="btn ghost small" onClick={() => dismissToast(t.id)} aria-label="Schließen">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
