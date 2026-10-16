import { useMemo, useState } from "react";
import { useLookups, useStore } from "../data/store";
import type { Id, Link } from "../data/types";
import { isActive, isValidUrl } from "../logic/tasks";
import { LinkRow } from "../ui/links";
import { ChipSelect, CompaniesChip, CompanyFilter, Empty, FilterSelect, usePersisted } from "../ui/common";
import { useCaptureContext } from "../ui/uiState";

interface LinkFilter {
  /** leer = alle Firmen */
  companies: Id[];
  category: Id | "";
  q: string;
}

export function LinksPage() {
  const { db } = useStore();
  const { categories } = useLookups();
  const [stored, setF] = usePersisted<LinkFilter>("links", { companies: [], category: "", q: "" });
  const f = { ...stored, companies: Array.isArray(stored.companies) ? stored.companies : [] };
  useCaptureContext(f.companies.length === 1 ? f.companies[0] : undefined);
  const set = (p: Partial<LinkFilter>) => setF({ ...f, ...p });
  const [editing, setEditing] = useState<Id | null>(null);

  const links = useMemo(() => {
    const q = f.q.toLowerCase();
    return db.links
      .filter(isActive)
      .filter((l) => f.companies.length === 0 || l.company_ids.some((c) => f.companies.includes(c)))
      .filter((l) => !f.category || l.category_id === f.category)
      .filter((l) => !q || `${l.title} ${l.url} ${l.description}`.toLowerCase().includes(q))
      .sort((a, b) => a.title.localeCompare(b.title, "de"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.links, stored]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Links</h1>
        <span className="muted">{links.length} Einträge</span>
      </div>
      <div className="filters">
        <CompanyFilter value={f.companies} onChange={(v) => set({ companies: v })} />
        <FilterSelect
          title="Kategorie"
          value={f.category}
          options={[{ value: "", label: "Alle Kategorien" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
          onChange={(v) => set({ category: v })}
        />
        <input placeholder="Text filtern…" value={f.q} onChange={(e) => set({ q: e.target.value })} />
      </div>
      {links.length === 0 ? (
        <Empty>Keine Links. Dokumente bleiben im SharePoint – hier nur den Link ablegen.</Empty>
      ) : (
        <div className="card">
          {links.map((l) =>
            editing === l.id ? (
              <LinkEditor key={l.id} link={l} onDone={() => setEditing(null)} />
            ) : (
              <LinkRow
                key={l.id}
                link={l}
                actions={
                  <button className="btn ghost small" onClick={() => setEditing(l.id)}>
                    Bearbeiten
                  </button>
                }
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function LinkEditor({ link, onDone }: { link: Link; onDone: () => void }) {
  const { update, trash, toast } = useStore();
  const { categories } = useLookups();
  const [v, setV] = useState(link);
  const save = async () => {
    if (!v.title.trim()) return toast("Bitte einen Titel eingeben.", "error");
    if (!isValidUrl(v.url)) return toast("Bitte eine gültige Adresse mit http:// oder https:// eingeben.", "error");
    await update("links", link.id, {
      title: v.title.trim(),
      url: v.url.trim(),
      company_ids: v.company_ids,
      topic_id: v.topic_id,
      category_id: v.category_id,
      description: v.description,
    }).catch(() => {});
    onDone();
  };
  return (
    <div className="inline-editor">
      <div className="grid2">
        <input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="Titel" />
        <input value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} placeholder="https://…" />
        <div className="chips">
          <CompaniesChip value={v.company_ids} onChange={(ids) => setV({ ...v, company_ids: ids })} />
          <ChipSelect
            title="Kategorie"
            value={v.category_id ?? ""}
            placeholder="Kategorie"
            options={[{ value: "", label: "Keine Kategorie" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
            onChange={(c) => setV({ ...v, category_id: c || null })}
          />
        </div>
        <input value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} placeholder="Beschreibung (optional)" />
      </div>
      <div className="row">
        <button className="btn ghost" onClick={() => void trash("links", link.id, link.title)}>
          Löschen
        </button>
        <span className="spacer" />
        <button className="btn" onClick={onDone}>
          Abbrechen
        </button>
        <button className="btn primary" onClick={() => void save()}>
          Speichern
        </button>
      </div>
    </div>
  );
}
