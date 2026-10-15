import { Building2, CheckSquare, Download, Hourglass, Link2, LogOut, Menu, NotebookPen, Plus, Search, Settings, Sparkles, Sun, Trash2, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useStore } from "../data/store";
import { todayIso } from "../logic/dates";
import { todayCount, todayView } from "../logic/tasks";
import { useBackup } from "./backup";
import { SK_LOGO } from "./common";
import { QuickCapture } from "./QuickCapture";
import { SearchPalette } from "./SearchPalette";
import { TaskPanel } from "./tasks";
import { useUi } from "./uiState";

const NAV = [
  { to: "/", label: "Heute", icon: Sun },
  { to: "/aufgaben", label: "Aufgaben", icon: CheckSquare },
  { to: "/wartet", label: "Wartet auf…", icon: Hourglass },
  { to: "/notizen", label: "Notizen", icon: NotebookPen },
  { to: "/tacto", label: "Tacto", icon: Sparkles },
  { to: "/links", label: "Links", icon: Link2 },
  { to: "/personen", label: "Personen", icon: Users },
  { to: "/firmen", label: "Firmen", icon: Building2 },
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

  const backup = useBackup();

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
              <n.icon size={18} className="nav-icon" aria-hidden />
              {n.label}
              {n.to === "/" && count > 0 && <span className="nav-count">{count}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <NavLink to="/papierkorb" className="nav-item small">
            <Trash2 size={16} className="nav-icon" aria-hidden /> Papierkorb
          </NavLink>
          <NavLink to="/einstellungen" className="nav-item small">
            <Settings size={16} className="nav-icon" aria-hidden /> Einstellungen
          </NavLink>
          <div className="muted small user-line" title={email}>
            {email}
          </div>
          <button className="nav-item small" onClick={onSignOut}>
            <LogOut size={16} className="nav-icon" aria-hidden /> Abmelden
          </button>
        </div>
      </aside>
      <div className="sidebar-scrim" onClick={() => setMenuOpen(false)} />

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setMenuOpen(true)} aria-label="Menü">
            <Menu size={20} />
          </button>
          <button className="search-btn" onClick={() => setSearchOpen(true)}>
            <Search size={16} />
            <span className="grow">Suchen</span>
            <kbd>Strg K</kbd>
          </button>
          <span className="spacer" />
          <button className="icon-btn backup-btn" onClick={() => void backup.run()} title={backup.label} aria-label={backup.label}>
            <Download size={18} />
            {backup.due && <span className="badge-dot" />}
          </button>
          <button className="btn primary" onClick={() => openCapture()} title="Neu (Taste N)">
            <Plus size={16} /> Neu
          </button>
        </header>

        {!online && <div className="banner error">Offline – Änderungen werden gerade nicht gespeichert.</div>}
        {backend.kind === "demo" && <div className="banner info">Demo-Modus mit Beispieldaten</div>}

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
          <button className="icon-btn" onClick={() => dismissToast(t.id)} aria-label="Schließen">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
