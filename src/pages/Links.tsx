import { useMemo, useState } from "react";
import { useLookups, useStore } from "../data/store";
import type { Id, Link } from "../data/types";
import { isActive, isValidUrl } from "../logic/tasks";
import { LinkRow } from "../ui/links";
import { CompanySelect, Empty, usePersisted } from "../ui/common";
import { useCaptureContext, useUi } from "../ui/uiState";

interface LinkFilter {
  company: Id | "";
  topic: Id | "";
  category: Id | "";
  q: string;
}

export function LinksPage() {
  const { db } = useStore();
  const { categories } = useLookups();
  const { openCapture } = useUi();
  const [f, setF] = usePersisted<LinkFilter>("links", { company: "", topic: "", category: "", q: "" });
  useCaptureContext(f.company || undefined);
  const set = (p: Partial<LinkFilter>) => setF({ ...f, ...p });
  const [editing, setEditing] = useState<Id | null>(null);

  const links = useMemo(() => {
    const q = f.q.toLowerCase();
    return db.links
      .filter(isActive)
      .filter((l) => !f.company || l.company_id === f.company)
      .filter((l) => !f.category || l.category_id === f.category)
      .filter((l) => !q || `${l.title} ${l.url} ${l.description}`.toLowerCase().includes(q))
      .sort((a, b) => a.title.localeCompare(b.title, "de"));
  }, [db.links, f]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Links</h1>
        <span className="muted">{links.length} Einträge</span>
        <span className="spacer" />
        <button className="btn primary" onClick={() => openCapture({ type: "link" })}>
          + Link
        </button>
      </div>
      <div className="filters">
        <CompanySelect value={f.company} onChange={(v) => set({ company: v })} allowAll="Alle Firmen" />
        <select value={f.category} onChange={(e) => set({ category: e.target.value })}>
          <option value="">Alle Kategorien</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
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
      company_id: v.company_id,
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
        <CompanySelect value={v.company_id} onChange={(c) => setV({ ...v, company_id: c })} />
        <select value={v.category_id ?? ""} onChange={(e) => setV({ ...v, category_id: e.target.value || null })}>
          <option value="">– keine Kategorie –</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
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
