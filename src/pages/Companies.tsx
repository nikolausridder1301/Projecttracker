import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLookups, useStore } from "../data/store";
import { TRAFFIC_LABEL, type Person } from "../data/types";
import { todayIso } from "../logic/dates";
import { isActive, isOpen } from "../logic/tasks";
import { CompanyLogo, Empty, TrafficDot, usePersisted } from "../ui/common";
import { CompanyPeople } from "./Contact";

// „Firmen & Personen“: Firmen-Karten mit ihren Personen. Ein Klick auf Firma
// oder Person öffnet dieselbe Detailansicht (siehe Contact.tsx).

const norm = (t: string) => t.toLocaleLowerCase("de").normalize("NFKD").replace(/[̀-ͯ]/g, "");

export function CompaniesPage() {
  const { db } = useStore();
  const { companies, people } = useLookups();
  const today = todayIso();
  const [q, setQ] = useState("");
  const [view, setView] = usePersisted<{ inactive: boolean }>("companies", { inactive: false });

  const stats = useMemo(() => {
    const m = new Map<string, { open: number; overdue: number; blocked: number }>();
    for (const t of db.tasks) {
      if (!isActive(t) || !isOpen(t)) continue;
      for (const cid of t.company_ids) {
        const s = m.get(cid) ?? { open: 0, overdue: 0, blocked: 0 };
        s.open++;
        if (t.due_date && t.due_date < today) s.overdue++;
        if (t.status === "blocked") s.blocked++;
        m.set(cid, s);
      }
    }
    return m;
  }, [db.tasks, today]);

  const query = norm(q.trim());
  const visiblePeople = people
    .filter((p) => view.inactive || p.active)
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
  const peopleOf = (companyId: string | null) => visiblePeople.filter((p) => p.company_id === companyId);
  const personHit = (p: Person) => !query || norm(`${p.name} ${p.role}`).includes(query);

  const cards = companies
    .map((c) => {
      const all = peopleOf(c.id);
      const companyHit = !query || norm(`${c.name} ${c.short}`).includes(query);
      const persons = companyHit ? all : all.filter(personHit);
      return { c, persons, show: companyHit || persons.length > 0 };
    })
    .filter((x) => x.show);
  const withoutCompany = peopleOf(null).filter(personHit);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Firmen &amp; Personen</h1>
        <span className="spacer" />
        <label className="inline">
          <input type="checkbox" className="check" checked={view.inactive} onChange={(e) => setView({ inactive: e.target.checked })} /> Inaktive zeigen
        </label>
      </div>
      <div className="filters">
        <label className="search-field">
          <Search size={16} aria-hidden />
          <input placeholder="Firma oder Person suchen…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      {cards.length === 0 && withoutCompany.length === 0 ? (
        <Empty>Nichts gefunden.</Empty>
      ) : (
        <div className="company-grid">
          {cards.map(({ c, persons }) => {
            const s = stats.get(c.id) ?? { open: 0, overdue: 0, blocked: 0 };
            return (
              <div key={c.id} className="card company-card">
                <Link to={`/firmen/${c.id}`} className="company-card-head">
                  <CompanyLogo company={c} size={44} />
                  <div>
                    <div className="task-title">{c.name}</div>
                    <div className="row tight">
                      <TrafficDot light={c.traffic_light} /> <span className="muted small">{TRAFFIC_LABEL[c.traffic_light]}</span>
                    </div>
                  </div>
                </Link>
                {c.traffic_comment && <p className="muted small">{c.traffic_comment}</p>}
                <div className="company-stats">
                  <span>{s.open} offen</span>
                  {s.overdue > 0 && <span className="overdue">{s.overdue} überfällig</span>}
                  {s.blocked > 0 && <span className="blocked-reason">{s.blocked} blockiert</span>}
                </div>
                <CompanyPeople companyId={c.id} people={persons} compact />
              </div>
            );
          })}
          {withoutCompany.length > 0 && (
            <div className="card company-card">
              <div className="company-card-head">
                <div className="task-title">Ohne Firma</div>
              </div>
              <CompanyPeople companyId={null} people={withoutCompany} compact />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
