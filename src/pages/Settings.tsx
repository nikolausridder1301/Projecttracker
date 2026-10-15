import { ArrowDown, ArrowUp, Download } from "lucide-react";
import { useState } from "react";
import { resetDemoData } from "../data/backend";
import { useLookups, useStore } from "../data/store";
import type { Company, LinkCategory, Topic } from "../data/types";
import { formatDateTime, todayIso } from "../logic/dates";
import { CompanyLogo } from "../ui/common";

export function SettingsPage() {
  const { db, backend } = useStore();
  const lastExport = db.app_meta[0]?.last_export_at ?? null;
  return (
    <div className="page narrow">
      <div className="page-head">
        <h1>Einstellungen</h1>
      </div>

      <section className="card">
        <h2>Backup</h2>
        <p className="muted">
          Lädt alle Daten (inkl. Papierkorb) als JSON-Datei herunter. Lege sie in deinem OneDrive ab.
          {lastExport ? ` Letzter Export: ${formatDateTime(lastExport)}.` : " Noch kein Export."}
        </p>
        <ExportButton />
        {backend.kind === "demo" && (
          <button
            className="btn ghost"
            onClick={() => {
              resetDemoData();
              location.reload();
            }}
          >
            Demo-Daten zurücksetzen
          </button>
        )}
      </section>

      <CompaniesSettings />
      <TopicsSettings />
      <CategoriesSettings />
    </div>
  );
}

function ExportButton() {
  const { db, update, insert } = useStore();
  const run = async () => {
    const data = { exported_at: new Date().toISOString(), version: 1, tables: db };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `projecttracker-backup-${todayIso()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    const now = new Date().toISOString();
    const meta = db.app_meta[0];
    if (meta) await update("app_meta", meta.id, { last_export_at: now }).catch(() => {});
    else await insert("app_meta", [{ last_export_at: now }]).catch(() => {});
  };
  return (
    <button className="btn primary" onClick={() => void run()}>
      <Download size={16} /> Export als JSON
    </button>
  );
}

function CompaniesSettings() {
  const { companies } = useLookups();
  const { insert } = useStore();
  return (
    <section className="card">
      <h2>Firmen</h2>
      <table className="table">
        <thead>
          <tr>
            <th />
            <th>Name</th>
            <th>Kürzel</th>
            <th>Farbe</th>
          </tr>
        </thead>
        <tbody>
          {companies.map((c) => (
            <CompanyRow key={c.id} company={c} />
          ))}
        </tbody>
      </table>
      <button
        className="btn ghost"
        onClick={() =>
          void insert("companies", [
            {
              name: "Neue Firma",
              short: "NEU",
              color: "#5a6577",
              logo_key: null,
              is_overarching: false,
              is_external: false,
              traffic_light: "green",
              traffic_comment: "",
              traffic_changed_at: null,
              sort: companies.length,
            },
          ]).catch(() => {})
        }
      >
        + Firma
      </button>
    </section>
  );
}

function CompanyRow({ company }: { company: Company }) {
  const { update } = useStore();
  const [v, setV] = useState(company);
  const save = (k: "name" | "short" | "color") => () =>
    v[k].trim() && v[k] !== company[k] ? void update("companies", company.id, { [k]: v[k].trim() }).catch(() => {}) : setV(company);
  return (
    <tr>
      <td>
        <CompanyLogo company={company} size={24} />
      </td>
      <td>
        <input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} onBlur={save("name")} />
      </td>
      <td>
        <input className="short-input" value={v.short} maxLength={5} onChange={(e) => setV({ ...v, short: e.target.value })} onBlur={save("short")} />
      </td>
      <td>
        <input type="color" value={v.color} onChange={(e) => setV({ ...v, color: e.target.value })} onBlur={save("color")} />
      </td>
    </tr>
  );
}

function TopicsSettings() {
  const { db, insert, update } = useStore();
  const all = db.topics.filter((t) => t.deleted_at === null).sort((a, b) => a.sort - b.sort);
  const [name, setName] = useState("");
  const move = (t: Topic, dir: -1 | 1) => {
    const i = all.findIndex((x) => x.id === t.id);
    const other = all[i + dir];
    if (!other) return;
    void update("topics", t.id, { sort: other.sort });
    void update("topics", other.id, { sort: t.sort });
  };
  return (
    <section className="card">
      <h2>Themen</h2>
      {all.map((t, i) => (
        <div key={t.id} className={`row settings-row${t.archived ? " inactive" : ""}`}>
          <RenameInput value={t.name} onSave={(name) => void update("topics", t.id, { name })} />
          <button className="btn ghost small" disabled={i === 0} onClick={() => move(t, -1)} aria-label="nach oben">
            <ArrowUp size={14} />
          </button>
          <button className="btn ghost small" disabled={i === all.length - 1} onClick={() => move(t, 1)} aria-label="nach unten">
            <ArrowDown size={14} />
          </button>
          <button className="btn ghost small" onClick={() => void update("topics", t.id, { archived: !t.archived })}>
            {t.archived ? "Reaktivieren" : "Archivieren"}
          </button>
        </div>
      ))}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          void insert("topics", [{ name: name.trim(), sort: (all.at(-1)?.sort ?? 0) + 1, archived: false }]).catch(() => {});
          setName("");
        }}
      >
        <input placeholder="Neues Thema" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn" type="submit">
          Hinzufügen
        </button>
      </form>
    </section>
  );
}

function CategoriesSettings() {
  const { db, insert, update } = useStore();
  const { categories } = useLookups();
  const [name, setName] = useState("");
  const remove = (c: LinkCategory) => {
    if (db.links.some((l) => l.deleted_at === null && l.category_id === c.id)) {
      if (!window.confirm(`Kategorie „${c.name}“ wird noch verwendet. Trotzdem entfernen? Die Links behalten ihren Eintrag, die Kategorie wird ausgeblendet.`)) return;
    }
    void update("link_categories", c.id, { deleted_at: new Date().toISOString() });
  };
  return (
    <section className="card">
      <h2>Link-Kategorien</h2>
      {categories.map((c) => (
        <div key={c.id} className="row settings-row">
          <RenameInput value={c.name} onSave={(name) => void update("link_categories", c.id, { name })} />
          <button className="btn ghost small" onClick={() => remove(c)}>
            Entfernen
          </button>
        </div>
      ))}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          void insert("link_categories", [{ name: name.trim(), sort: categories.length }]).catch(() => {});
          setName("");
        }}
      >
        <input placeholder="Neue Kategorie" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn" type="submit">
          Hinzufügen
        </button>
      </form>
    </section>
  );
}

function RenameInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <input
      className="grow"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => (v.trim() && v !== value ? onSave(v.trim()) : setV(value))}
    />
  );
}
