import { Check, ChevronsUpDown, Plus, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../data/store";
import type { Id } from "../data/types";
import { copyProjectMasterData, suggestShort } from "../logic/projects";
import { ChipSelect } from "./common";

// Projekt-Umschalter oben links: aktuelles Projekt, Wechsel, neues Projekt.

const COLORS = ["#ea7a0c", "#2563c9", "#0f766e", "#7c3aed", "#be123c", "#161b26"];

export function ProjectBadge({ color, short }: { color: string; short: string }) {
  return (
    <span className="project-badge" style={{ background: color }}>
      {short.slice(0, 3)}
    </span>
  );
}

export function ProjectSwitcher() {
  const { project, projects, setProject } = useStore();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const choose = (id: Id) => {
    setProject(id);
    setOpen(false);
    navigate("/");
  };

  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);

  // Nur ein Projekt: einfach den Namen zeigen – „Neues Projekt“ gibt es in den Einstellungen
  if (projects.length <= 1) {
    return (
      <div className="project-switcher">
        <div className="project-current static" title={project?.name}>
          {project ? <ProjectBadge color={project.color} short={project.short} /> : null}
          <span className="project-name">{project?.name ?? "Kein Projekt"}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="project-switcher" ref={ref}>
      <button className="project-current" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
        {project ? <ProjectBadge color={project.color} short={project.short} /> : null}
        <span className="project-name">{project?.name ?? "Kein Projekt"}</span>
        <ChevronsUpDown size={16} className="project-chevron" />
      </button>
      {open && (
        <div className="project-menu" role="menu">
          <div className="project-menu-label">Projekte</div>
          {[...active, ...archived].map((p) => (
            <button key={p.id} role="menuitem" className="project-item" onClick={() => choose(p.id)}>
              <ProjectBadge color={p.color} short={p.short} />
              <span className="grow">
                {p.name}
                {p.archived && <span className="muted"> · archiviert</span>}
              </span>
              {p.id === project?.id && <Check size={16} />}
            </button>
          ))}
          <div className="project-menu-sep" />
          <button
            role="menuitem"
            className="project-item"
            onClick={() => {
              setOpen(false);
              setCreating(true);
            }}
          >
            <Plus size={16} /> Neues Projekt…
          </button>
          <button
            role="menuitem"
            className="project-item"
            onClick={() => {
              setOpen(false);
              navigate("/einstellungen");
            }}
          >
            <Settings size={16} /> Projekteinstellungen
          </button>
        </div>
      )}
      {creating && <NewProjectDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

export function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const { allDb, project, projects, insert, update, setProject, toast } = useStore();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [short, setShort] = useState("");
  const [shortTouched, setShortTouched] = useState(false);
  const [color, setColor] = useState(COLORS[1]);
  const [source, setSource] = useState<Id | "">(project?.id ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const create = async () => {
    if (!name.trim()) return toast("Bitte einen Projektnamen eingeben.", "error");
    setBusy(true);
    try {
      const [p] = await insert("projects", [
        {
          name: name.trim(),
          short: (short.trim() || suggestShort(name)).toUpperCase().slice(0, 4),
          color,
          vendor_company_id: null,
          report_url: "",
          sort: projects.length,
          archived: false,
        },
      ]);
      if (source) {
        // Stammdaten kopieren: Firmen zuerst (Personen verweisen darauf)
        const copy = copyProjectMasterData(allDb, source, p.id);
        if (copy.companies.length) await insert("companies", copy.companies);
        if (copy.people.length) await insert("people", copy.people);
        if (copy.link_categories.length) await insert("link_categories", copy.link_categories);
        if (copy.vendorCompanyId) await update("projects", p.id, { vendor_company_id: copy.vendorCompanyId });
      }
      // Die eigene Person gehört in jedes Projekt – auch ohne Kopie der Stammdaten
      const me = allDb.people.find((x) => x.is_me && x.deleted_at === null);
      if (me && !(source && allDb.people.some((x) => x.project_id === source && x.is_me && x.deleted_at === null && x.active))) {
        await insert("people", [{ project_id: p.id, name: me.name, company_id: null, role: me.role, email: me.email, phone: me.phone, active: true, is_me: true }]);
      }
      setProject(p.id);
      toast(`Projekt „${p.name}“ angelegt`);
      onClose();
      navigate("/einstellungen");
    } catch {
      /* Fehler wurde gemeldet */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <h2>Neues Projekt</h2>
        <input
          autoFocus
          className="capture-input"
          placeholder="Projektname, z. B. „ERP-Einführung“"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!shortTouched) setShort(suggestShort(e.target.value));
          }}
        />
        <div className="row">
          <label className="inline">
            Kürzel
            <input
              className="short-input"
              maxLength={4}
              value={short}
              onChange={(e) => {
                setShort(e.target.value.toUpperCase());
                setShortTouched(true);
              }}
            />
          </label>
          <div className="row tight" role="radiogroup" aria-label="Farbe">
            {COLORS.map((c) => (
              <button
                type="button"
                key={c}
                className={`color-dot${c === color ? " active" : ""}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={`Farbe ${c}`}
                aria-checked={c === color}
                role="radio"
              />
            ))}
          </div>
        </div>
        <label className="field">
          <span className="muted small">Startet mit</span>
          <ChipSelect
            title="Startet mit"
            value={source}
            options={[
              ...projects.map((p) => ({ value: p.id, label: `Firmen, Personen, Meilensteine und Kategorien aus „${p.name}“ übernehmen` })),
              { value: "", label: "Leer starten" },
            ]}
            onChange={setSource}
          />
        </label>
        <p className="muted small">Aufgaben, Notizen, Links und Anbieter-Punkte werden nicht übernommen. Anpassen kannst du alles danach in den Projekteinstellungen.</p>
        <div className="row">
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn primary" type="submit" disabled={busy}>
            Projekt anlegen
          </button>
        </div>
      </form>
    </div>
  );
}
