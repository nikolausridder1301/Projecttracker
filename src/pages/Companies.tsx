import { ArrowLeft, Handshake } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLookups, useStore } from "../data/store";
import { TRAFFIC_LABEL, type Company } from "../data/types";
import { todayIso } from "../logic/dates";
import { isActive, isOpen } from "../logic/tasks";
import { affectsCompany, ageLabel, categoryDef, isOpenItem, statusDef } from "../logic/vendor";
import { CompanyLogo, Empty, TrafficDot } from "../ui/common";
import { LinkRow } from "../ui/links";
import { NoteLink, useCaptureContext } from "../ui/uiState";
import { CompanyMilestones } from "../ui/milestones";
import { TrafficDialog, TrafficHistoryList, TrafficStatus } from "../ui/traffic";
import { useVendor } from "../ui/vendor";
import { CATEGORY_ICON } from "./Tacto";
import { TaskFilterBar, TaskSections, applyFilter, type TaskFilter } from "./Tasks";

export function CompaniesPage() {
  const { db } = useStore();
  const { companies } = useLookups();
  const today = todayIso();
  const stats = useMemo(() => {
    const m = new Map<string, { open: number; overdue: number; blocked: number }>();
    for (const t of db.tasks) {
      if (!isActive(t) || !isOpen(t)) continue;
      const s = m.get(t.company_id) ?? { open: 0, overdue: 0, blocked: 0 };
      s.open++;
      if (t.due_date && t.due_date < today) s.overdue++;
      if (t.status === "blocked") s.blocked++;
      m.set(t.company_id, s);
    }
    return m;
  }, [db.tasks, today]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Firmen</h1>
      </div>
      <div className="company-grid">
        {companies.map((c) => {
          const s = stats.get(c.id) ?? { open: 0, overdue: 0, blocked: 0 };
          return (
            <Link key={c.id} to={`/firmen/${c.id}`} className="card company-card">
              <div className="row">
                <CompanyLogo company={c} size={44} />
                <div>
                  <div className="task-title">{c.name}</div>
                  <div className="row tight">
                    <TrafficDot light={c.traffic_light} /> <span className="muted small">{TRAFFIC_LABEL[c.traffic_light]}</span>
                  </div>
                </div>
              </div>
              {c.traffic_comment && <p className="muted small">{c.traffic_comment}</p>}
              <div className="company-stats">
                <span>{s.open} offen</span>
                {s.overdue > 0 && <span className="overdue">{s.overdue} überfällig</span>}
                {s.blocked > 0 && <span className="blocked-reason">{s.blocked} blockiert</span>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function CompanyDetailPage() {
  const { id } = useParams();
  const { db } = useStore();
  const c = db.companies.find((x) => x.id === id);
  if (!c || c.deleted_at) return <Empty>Firma nicht gefunden.</Empty>;
  return <CompanyView key={c.id} company={c} />;
}

type Tab = "ms" | "tasks" | "notes" | "links" | "tacto" | "ampel";

function CompanyView({ company }: { company: Company }) {
  const { db } = useStore();
  const { people } = useLookups();
  const [tab, setTab] = useState<Tab>("tasks");
  const [trafficOpen, setTrafficOpen] = useState(false);
  const [f, setF] = useState<TaskFilter>({
    companies: [company.id],
    topic: "",
    assignee: "",
    status: "",
    important: false,
    due: "",
    showDone: false,
    groupBy: "",
  });
  useCaptureContext(company.id);

  const tasks = useMemo(() => applyFilter(db.tasks, f), [db.tasks, f]);
  const notes = db.notes.filter((n) => isActive(n) && n.company_id === company.id).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const vendor = useVendor();
  // Offene Anbieter-Punkte, die diese Gesellschaft betreffen (auf der Anbieter-Firma selbst: alle offenen)
  const vendorItems = db.vendor_items
    .filter((i) => isActive(i) && isOpenItem(i) && (company.is_external || affectsCompany(i, company.id)))
    .sort((a, b) => (a.reported_at ?? a.created_at) < (b.reported_at ?? b.created_at) ? -1 : 1);
  const links = db.links.filter((l) => isActive(l) && l.company_id === company.id).sort((a, b) => a.title.localeCompare(b.title, "de"));
  const contacts = people.filter((p) => p.company_id === company.id && p.active);

  return (
    <div className="page">
      <div className="page-head">
        <Link to="/firmen" className="back-link">
          <ArrowLeft size={16} /> Firmen
        </Link>
        <span className="spacer" />
        <Link to={`/meeting?c=${company.id}`} className="btn">
          <Handshake size={16} /> Meeting vorbereiten
        </Link>
      </div>
      <div className="card company-head">
        <CompanyLogo company={company} size={64} />
        <div className="grow">
          <h1>{company.name}</h1>
          <div className="row">
            <TrafficStatus company={company} />
            <button className="btn small" onClick={() => setTrafficOpen(true)}>
              Ampel ändern
            </button>
          </div>
          {company.traffic_comment && <p className="traffic-comment-text">{company.traffic_comment}</p>}
        </div>
        <div className="contacts">
          <div className="muted small">Ansprechpartner</div>
          {contacts.length === 0 && <div className="muted small">–</div>}
          {contacts.map((p) => (
            <div key={p.id}>
              <Link to={`/personen/${p.id}`}>{p.name}</Link> <span className="muted small">{p.role}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="tabs">
        {(
          [
            ["ms", "Meilensteine"],
            ["tasks", `Aufgaben (${db.tasks.filter((t) => isActive(t) && isOpen(t) && t.company_id === company.id).length})`],
            ["notes", `Notizen (${notes.length})`],
            ["links", `Links (${links.length})`],
            ...(vendor ? ([["tacto", `${vendor.name} (${vendorItems.length})`]] as [Tab, string][]) : []),
            ["ampel", "Ampel-Verlauf"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button key={k} className={`tab${tab === k ? " active" : ""}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "tasks" && (
        <>
          <TaskFilterBar f={f} set={(p) => setF({ ...f, ...p })} reset={() => setF({ ...f, topic: "", assignee: "", status: "", important: false, due: "", showDone: false })} hideCompany />
          {tasks.length === 0 ? <Empty>Keine Aufgaben.</Empty> : <TaskSections tasks={tasks} groupBy={f.groupBy} showCompany={false} />}
        </>
      )}
      {tab === "notes" &&
        (notes.length === 0 ? (
          <Empty>Keine Notizen.</Empty>
        ) : (
          <div className="card">
            {notes.map((n) => (
              <NoteLink key={n.id} id={n.id} className="note-row">
                <span className="note-main">
                  <span className="task-title">{n.title}</span>
                </span>
              </NoteLink>
            ))}
          </div>
        ))}
      {tab === "links" &&
        (links.length === 0 ? (
          <Empty>Keine Links.</Empty>
        ) : (
          <div className="card">
            {links.map((l) => (
              <LinkRow key={l.id} link={l} />
            ))}
          </div>
        ))}
      {tab === "tacto" &&
        (vendorItems.length === 0 ? (
          <Empty>Keine offenen Punkte.</Empty>
        ) : (
          <div className="card list-card">
            {vendorItems.map((i) => {
              const Icon = CATEGORY_ICON[i.category];
              const sd = statusDef(i);
              return (
                <Link key={i.id} to={`/anbieter?id=${i.id}`} className="vendor-row">
                  <Icon size={18} className="row-icon" />
                  <span className="note-main">
                    <span className="task-title">{i.title}</span>
                    <span className="task-sub">{categoryDef(i.category).label}</span>
                  </span>
                  {sd && <span className={`status-pill${sd.tone ? ` tone-${sd.tone}` : ""}`}>{sd.label}</span>}
                  <span className="age">{ageLabel(i, todayIso(), vendor?.name)}</span>
                </Link>
              );
            })}
          </div>
        ))}
      {tab === "ms" && (
        <div className="card">
          <CompanyMilestones company={company} />
        </div>
      )}
      {tab === "ampel" && (
        <div className="card">
          <TrafficHistoryList companyId={company.id} />
        </div>
      )}
      {trafficOpen && <TrafficDialog company={company} onClose={() => setTrafficOpen(false)} />}
    </div>
  );
}
