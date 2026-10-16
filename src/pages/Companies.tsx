import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLookups, useStore } from "../data/store";
import type { Id } from "../data/types";
import { todayIso } from "../logic/dates";
import { effectiveDue, isActive, isOpen } from "../logic/tasks";
import { Avatar, CompanyBadge, CompanyLogo, CompanySelect, Empty, usePersisted } from "../ui/common";
import { openPerPerson } from "./Contact";

// „Kontakte“: oben die Firmen, darunter die Personen – jeweils gleich aufgebaute
// Karten. Ein Klick öffnet dieselbe Detailansicht (siehe Contact.tsx).

const norm = (t: string) => t.toLocaleLowerCase("de").normalize("NFKD").replace(/[̀-ͯ]/g, "");
const tasksLabel = (n: number) => (n === 1 ? "1 offen" : `${n} offen`);

export function CompaniesPage() {
  const { db, insert } = useStore();
  const { companies, people, companyById, me } = useLookups();
  const today = todayIso();
  const [q, setQ] = useState("");
  const [view, setView] = usePersisted<{ inactive: boolean }>("companies", { inactive: false });
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCompany, setNewCompany] = useState<Id | "">("");

  // Firma: Aufgaben, die die Firma betreffen
  const companyStats = useMemo(() => {
    const m = new Map<string, { open: number; overdue: number }>();
    for (const t of db.tasks) {
      if (!isActive(t) || !isOpen(t)) continue;
      for (const cid of t.company_ids) {
        const s = m.get(cid) ?? { open: 0, overdue: 0 };
        s.open++;
        const due = effectiveDue(t);
        if (due && due < today) s.overdue++;
        m.set(cid, s);
      }
    }
    return m;
  }, [db.tasks, today]);
  // Person: Aufgaben, für die sie verantwortlich ist oder einen offenen Schritt hat
  const personOpen = useMemo(() => openPerPerson(db.tasks, me?.id), [db.tasks, me?.id]);

  const query = norm(q.trim());
  const shownCompanies = companies.filter((c) => !query || norm(`${c.name} ${c.short}`).includes(query));
  const shownPeople = people
    .filter((p) => view.inactive || p.active)
    .filter((p) => !query || norm(`${p.name} ${p.role} ${companyById.get(p.company_id ?? "")?.name ?? ""}`).includes(query))
    .sort(
      (a, b) =>
        (companyById.get(a.company_id ?? "")?.sort ?? 99) - (companyById.get(b.company_id ?? "")?.sort ?? 99) ||
        a.name.localeCompare(b.name, "de"),
    );
  const peopleCount = (cid: Id) => people.filter((p) => p.active && p.company_id === cid).length;

  const addPerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await insert("people", [{ name: newName.trim(), company_id: newCompany || null, role: "", email: "", phone: "", active: true, is_me: false }]).catch(() => {});
    setNewName("");
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Kontakte</h1>
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

      {shownCompanies.length + shownPeople.length === 0 && <Empty>Nichts gefunden.</Empty>}

      {shownCompanies.length > 0 && (
        <>
          <div className="section-divider first">
            <span>Firmen</span>
            <span className="muted">{shownCompanies.length}</span>
          </div>
          <div className="contact-grid">
            {shownCompanies.map((c) => {
              const s = companyStats.get(c.id) ?? { open: 0, overdue: 0 };
              const n = peopleCount(c.id);
              return (
                <Link key={c.id} to={`/firmen/${c.id}`} className="card contact-card">
                  <CompanyLogo company={c} size={44} />
                  <div className="contact-card-body">
                    <div className="contact-card-name">{c.name}</div>
                    <div className="contact-card-sub">{n === 0 ? "Noch keine Personen" : n === 1 ? "1 Person" : `${n} Personen`}</div>
                  </div>
                  {s.open > 0 && <span className={`count-pill${s.overdue > 0 ? " red" : ""}`}>{s.overdue > 0 ? `${s.overdue} überfällig` : tasksLabel(s.open)}</span>}
                </Link>
              );
            })}
          </div>
        </>
      )}

      {(shownPeople.length > 0 || !query) && (
        <>
          <div className="section-divider">
            <span>Personen</span>
            <span className="muted">{shownPeople.length}</span>
            <button className="btn ghost small section-action" onClick={() => setAdding(!adding)}>
              <Plus size={14} /> Person
            </button>
          </div>
          {adding && (
            <form className="card row person-new" onSubmit={(e) => void addPerson(e)}>
              <input autoFocus placeholder="Name der neuen Person" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <CompanySelect value={newCompany} onChange={setNewCompany} allowAll="Firma?" />
              <button className="btn primary" type="submit">
                Anlegen
              </button>
            </form>
          )}
          <div className="contact-grid">
            {shownPeople.map((p) => {
              const open = personOpen.get(p.id) ?? 0;
              return (
                <Link key={p.id} to={`/personen/${p.id}`} className={`card contact-card${p.active ? "" : " inactive"}`}>
                  <span className="contact-card-avatar">
                    <Avatar name={p.name} />
                  </span>
                  <div className="contact-card-body">
                    <div className="contact-card-name">{p.name}</div>
                    <div className="contact-card-sub">
                      {p.company_id ? <CompanyBadge id={p.company_id} /> : <span>ohne Firma</span>}
                      {p.role && <span className="contact-card-role">{p.role}</span>}
                      {!p.active && <span>inaktiv</span>}
                    </div>
                  </div>
                  {open > 0 && <span className="count-pill">{tasksLabel(open)}</span>}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
