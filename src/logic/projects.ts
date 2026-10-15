// Neues Projekt aus einem bestehenden ableiten: Stammdaten werden kopiert
// (neue IDs, Firmenbezüge umgehängt), Arbeitsdaten wie Aufgaben nicht.
import type { Company, Db, Id, LinkCategory, NewRow, Person, Topic } from "../data/types";

export interface ProjectCopy {
  companies: NewRow<"companies">[];
  people: NewRow<"people">[];
  topics: NewRow<"topics">[];
  link_categories: NewRow<"link_categories">[];
  /** neue ID der Anbieter-Firma, falls das Quellprojekt einen Anbieter-Bereich hat */
  vendorCompanyId: Id | null;
}

const alive = <T extends { deleted_at: string | null }>(l: T[]) => l.filter((r) => r.deleted_at === null);

export function copyProjectMasterData(
  db: Pick<Db, "projects" | "companies" | "people" | "topics" | "link_categories">,
  sourceProjectId: Id,
  newProjectId: Id,
  newId: () => Id = () => crypto.randomUUID(),
): ProjectCopy {
  const inSource = <T extends { project_id: Id; deleted_at: string | null }>(l: T[]) =>
    alive(l).filter((r) => r.project_id === sourceProjectId);

  const companyMap = new Map<Id, Id>();
  const companies = inSource<Company>(db.companies).map((c) => {
    const id = newId();
    companyMap.set(c.id, id);
    return {
      id,
      project_id: newProjectId,
      name: c.name,
      short: c.short,
      color: c.color,
      logo_key: c.logo_key,
      is_overarching: c.is_overarching,
      is_external: c.is_external,
      // Ampel startet im neuen Projekt neutral
      traffic_light: "green" as const,
      traffic_comment: "",
      traffic_changed_at: null,
      sort: c.sort,
    };
  });

  const people = inSource<Person>(db.people)
    .filter((p) => p.active)
    .map((p) => ({
      id: newId(),
      project_id: newProjectId,
      name: p.name,
      company_id: p.company_id ? (companyMap.get(p.company_id) ?? null) : null,
      role: p.role,
      email: p.email,
      phone: p.phone,
      active: true,
    }));

  const topics = inSource<Topic>(db.topics)
    .filter((t) => !t.archived)
    .map((t) => ({ id: newId(), project_id: newProjectId, name: t.name, sort: t.sort, archived: false }));

  const link_categories = inSource<LinkCategory>(db.link_categories).map((c) => ({
    id: newId(),
    project_id: newProjectId,
    name: c.name,
    sort: c.sort,
  }));

  const source = db.projects.find((p) => p.id === sourceProjectId);
  const vendorCompanyId = source?.vendor_company_id ? (companyMap.get(source.vendor_company_id) ?? null) : null;

  return { companies, people, topics, link_categories, vendorCompanyId };
}

/** Kürzel aus dem Projektnamen, z. B. „ERP-Einführung“ → „ERP“. */
export function suggestShort(name: string): string {
  const words = name.trim().split(/[\s\-_/]+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}
