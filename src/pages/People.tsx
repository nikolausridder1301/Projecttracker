import { ArrowLeft, Handshake, Mail } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLookups, useStore } from "../data/store";
import type { Id, Person } from "../data/types";
import { compareTasks, isActive, isOpen } from "../logic/tasks";
import { CompanyBadge, CompanySelect, Empty } from "../ui/common";
import { TaskList } from "../ui/tasks";
import { NoteLink } from "../ui/uiState";

export function PeoplePage() {
  const { db, insert } = useStore();
  const { people, companyById } = useLookups();
  const [showInactive, setShowInactive] = useState(false);
  const [name, setName] = useState("");
  const [companyId, setCompanyId] = useState<Id | "">("");
  const navigate = useNavigate();

  const openCount = useMemo(() => {
    const m = new Map<Id, number>();
    for (const t of db.tasks) if (isActive(t) && isOpen(t)) for (const id of t.assignee_person_ids) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [db.tasks]);

  const list = people
    .filter((p) => showInactive || p.active)
    .sort(
      (a, b) =>
        (companyById.get(a.company_id ?? "")?.sort ?? 99) - (companyById.get(b.company_id ?? "")?.sort ?? 99) ||
        a.name.localeCompare(b.name, "de"),
    );

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const [p] = await insert("people", [
      { name: name.trim(), company_id: companyId || null, role: "", email: "", phone: "", active: true },
    ]);
    setName("");
    navigate(`/personen/${p.id}`);
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Personen</h1>
        <span className="muted">{list.length}</span>
        <span className="spacer" />
        <label className="inline">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Inaktive zeigen
        </label>
      </div>
      <form className="card row" onSubmit={(e) => void add(e)}>
        <input placeholder="Neue Person: Name" value={name} onChange={(e) => setName(e.target.value)} />
        <CompanySelect value={companyId} onChange={setCompanyId} allowAll="– Firma –" />
        <button className="btn primary" type="submit">
          Anlegen
        </button>
      </form>
      {list.length === 0 ? (
        <Empty>Noch keine Personen. Lege die Ansprechpartner an, an die du Aufgaben delegierst.</Empty>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Firma</th>
                <th>Rolle</th>
                <th>E-Mail</th>
                <th>Offen</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className={p.active ? "" : "inactive"} onClick={() => navigate(`/personen/${p.id}`)}>
                  <td>
                    <Link to={`/personen/${p.id}`}>{p.name}</Link>
                    {!p.active && <span className="muted small"> (inaktiv)</span>}
                  </td>
                  <td>
                    <CompanyBadge id={p.company_id} />
                  </td>
                  <td className="muted">{p.role}</td>
                  <td className="muted">{p.email}</td>
                  <td>{openCount.get(p.id) ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function PersonDetailPage() {
  const { id } = useParams();
  const { db } = useStore();
  const person = db.people.find((p) => p.id === id);
  if (!person || person.deleted_at) return <Empty>Person nicht gefunden.</Empty>;
  return <PersonEditor key={person.id} person={person} />;
}

function PersonEditor({ person }: { person: Person }) {
  const { db, update, trash, toast } = useStore();
  const navigate = useNavigate();
  const [v, setV] = useState(person);
  const [showDone, setShowDone] = useState(false);
  const save = (patch: Partial<Person>) => void update("people", person.id, patch).catch(() => {});
  const blur = (k: "name" | "role" | "email" | "phone") => () => {
    if (k === "name" && !v.name.trim()) return setV({ ...v, name: person.name });
    if (v[k] !== person[k]) save({ [k]: v[k].trim() });
  };

  const tasks = db.tasks.filter((t) => isActive(t) && t.assignee_person_ids.includes(person.id)).sort(compareTasks);
  const open = tasks.filter(isOpen);
  const meetings = db.notes.filter((n) => isActive(n) && n.participant_ids.includes(person.id));

  const remove = () => {
    if (open.length > 0) {
      toast(`${person.name} hat noch ${open.length} offene Aufgabe(n) – bitte stattdessen auf „inaktiv“ setzen.`, "error");
      return;
    }
    void trash("people", person.id, person.name).then(() => navigate("/personen"));
  };

  return (
    <div className="page narrow">
      <div className="page-head">
        <Link to="/personen" className="back-link">
          <ArrowLeft size={16} /> Personen
        </Link>
        <span className="spacer" />
        <Link to={`/meeting?p=${person.id}`} className="btn">
          <Handshake size={16} /> Meeting vorbereiten
        </Link>
        <label className="inline">
          <input type="checkbox" checked={person.active} onChange={(e) => save({ active: e.target.checked })} /> aktiv
        </label>
        <button className="btn ghost" onClick={remove}>
          Löschen
        </button>
      </div>
      <div className="card editor">
        <input className="title-input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} onBlur={blur("name")} />
        <div className="grid2">
          <div className="field">
            <label>Firma</label>
            <CompanySelect value={person.company_id ?? ""} onChange={(c) => save({ company_id: c || null })} allowAll="– keine –" />
          </div>
          <div className="field">
            <label>Rolle</label>
            <input value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })} onBlur={blur("role")} placeholder="z. B. Key-User Einkauf" />
          </div>
          <div className="field">
            <label>E-Mail</label>
            <input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} onBlur={blur("email")} />
          </div>
          <div className="field">
            <label>Telefon</label>
            <input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} onBlur={blur("phone")} />
          </div>
        </div>
        {person.email && (
          <a className="btn" href={`mailto:${encodeURIComponent(person.email)}`}>
            <Mail size={15} /> Mail schreiben
          </a>
        )}
      </div>
      <section className="card">
        <div className="section-head">
          <h3>Delegierte Aufgaben ({open.length} offen)</h3>
          <span className="spacer" />
          <label className="inline">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Erledigte zeigen
          </label>
        </div>
        <TaskList tasks={showDone ? tasks : open} empty="Keine offenen Aufgaben." />
      </section>
      {meetings.length > 0 && (
        <section className="card">
          <h3>Teilgenommen an</h3>
          {meetings.map((n) => (
            <div key={n.id}>
              <NoteLink id={n.id}>{n.title}</NoteLink>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
