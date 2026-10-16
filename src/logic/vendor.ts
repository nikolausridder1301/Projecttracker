// Anbieter-Punkte (z. B. Tacto): Kategorien, Status-Abläufe, Alter und Jour-fixe-Text.
import type { Company, Id, IsoDate, Person, VendorCategory, VendorItem } from "../data/types";
import { daysBetween, formatDate } from "./dates";

export interface StatusDef {
  value: string;
  label: string;
  /** erledigt = zählt nicht mehr als offen */
  final?: boolean;
  /** ab diesem Status liegt der Punkt beim Anbieter (setzt reported_at) */
  atVendor?: boolean;
  tone?: "blue" | "green" | "red";
}

export interface CategoryDef {
  value: VendorCategory;
  label: string;
  plural: string;
  /** kurzer Reitername */
  short: string;
  /** Platzhalter der Erfassungszeile */
  placeholder: string;
  statuses: StatusDef[];
}

export const CATEGORIES: CategoryDef[] = [
  {
    value: "feature",
    label: "Feature Request",
    plural: "Feature Requests",
    short: "Features",
    placeholder: "Neuen Feature Request erfassen…",
    statuses: [
      { value: "idea", label: "Idee" },
      { value: "requested", label: "Angefragt", atVendor: true, tone: "blue" },
      { value: "promised", label: "Zugesagt", atVendor: true, tone: "blue" },
      { value: "done", label: "Umgesetzt", final: true, tone: "green" },
      { value: "rejected", label: "Abgelehnt", final: true },
    ],
  },
  {
    value: "question",
    label: "Frage",
    plural: "Fragen",
    short: "Fragen",
    placeholder: "Neue Frage erfassen…",
    statuses: [
      { value: "open", label: "Offen" },
      { value: "asked", label: "Gestellt", atVendor: true, tone: "blue" },
      { value: "answered", label: "Beantwortet", final: true, tone: "green" },
    ],
  },
  {
    value: "bug",
    label: "Bug",
    plural: "Bugs",
    short: "Bugs",
    placeholder: "Neuen Bug erfassen…",
    statuses: [
      { value: "open", label: "Offen", tone: "red" },
      { value: "reported", label: "Gemeldet", atVendor: true, tone: "blue" },
      { value: "in_progress", label: "In Arbeit", atVendor: true, tone: "blue" },
      { value: "fixed", label: "Behoben", final: true, tone: "green" },
    ],
  },
  {
    value: "best_practice",
    label: "Best Practice",
    plural: "Best Practices",
    short: "Best Practices",
    placeholder: "Neue Best Practice erfassen…",
    statuses: [],
  },
  {
    value: "claim",
    label: "Fail & Claim",
    plural: "Fails & Claims",
    short: "Claims",
    placeholder: "Neuen Fail & Claim erfassen…",
    statuses: [
      { value: "open", label: "Offen", tone: "red" },
      { value: "escalated", label: "Eskaliert", atVendor: true, tone: "red" },
      { value: "resolved", label: "Gelöst", final: true, tone: "green" },
      { value: "compensated", label: "Kompensiert", final: true, tone: "green" },
    ],
  },
];

export const categoryDef = (c: VendorCategory): CategoryDef => CATEGORIES.find((d) => d.value === c)!;

/** Neuer Punkt mit Standardwerten (Titel aus der Erfassungszeile). */
export function newVendorItem(category: VendorCategory, title: string, companyIds: Id[]) {
  return {
    title,
    body: "",
    category,
    status: initialStatus(category),
    company_ids: companyIds,
    topic_id: null,
    priority: "medium" as const,
    contact_person_ids: [],
    ticket: "",
    answer: "",
    promised: "",
    actual: "",
    evidence_url: "",
    reported_at: null,
    status_changed_at: null,
  };
}

/** Ticketfeld erst zeigen, wenn der Punkt beim Anbieter ist (oder schon eins eingetragen ist). */
export function showTicket(item: Pick<VendorItem, "category" | "status" | "ticket">): boolean {
  const sd = statusDef(item);
  return item.ticket !== "" || !!sd?.atVendor || !!sd?.final;
}

export function initialStatus(c: VendorCategory): string {
  return categoryDef(c).statuses[0]?.value ?? "";
}

export function statusDef(item: Pick<VendorItem, "category" | "status">): StatusDef | undefined {
  return categoryDef(item.category).statuses.find((s) => s.value === item.status);
}

/** Offen = hat einen Status-Ablauf und ist noch nicht in einem Endzustand. */
export function isOpenItem(item: Pick<VendorItem, "category" | "status">): boolean {
  const def = categoryDef(item.category);
  if (def.statuses.length === 0) return false;
  return !statusDef(item)?.final;
}

/** Felder, die sich beim Statuswechsel mit ändern (reported_at beim ersten Weg zum Anbieter). */
export function statusPatch(item: Pick<VendorItem, "category" | "reported_at">, status: string, today: IsoDate) {
  const def = categoryDef(item.category).statuses.find((s) => s.value === status);
  return {
    status,
    status_changed_at: new Date().toISOString(),
    reported_at: item.reported_at ?? (def?.atVendor || def?.final ? today : null),
  };
}

/** „seit 23 T. bei Tacto" bzw. „seit 5 T. offen" – nur für offene Punkte. */
export function ageLabel(item: VendorItem, today: IsoDate, vendorName = "Anbieter"): string {
  if (!isOpenItem(item)) return "";
  const since = item.reported_at ?? item.created_at.slice(0, 10);
  const days = Math.max(0, daysBetween(since, today));
  const where = statusDef(item)?.atVendor ? `bei ${vendorName}` : "offen";
  return days === 0 ? `seit heute ${where}` : `seit ${days} T. ${where}`;
}

/** Betrifft der Punkt diese Firma? Leere Liste = alle Gesellschaften. */
export function affectsCompany(item: Pick<VendorItem, "company_ids">, companyId: Id): boolean {
  return item.company_ids.length === 0 || item.company_ids.includes(companyId);
}

export function companiesLabel(ids: Id[], companies: Pick<Company, "id" | "short">[]): string {
  if (ids.length === 0) return "Alle Firmen";
  return ids.map((id) => companies.find((c) => c.id === id)?.short ?? "?").join(", ");
}

/** Text für den Jour fixe mit dem Anbieter: alle offenen Punkte nach Kategorie. */
export function jourFixeText(
  items: VendorItem[],
  companies: Pick<Company, "id" | "short">[],
  people: Pick<Person, "id" | "name">[],
  today: IsoDate,
  vendorName = "Anbieter",
): string {
  const lines: string[] = [`Offene Punkte ${vendorName} – Stand ${formatDate(today)}`, ""];
  for (const cat of CATEGORIES) {
    const open = items.filter((i) => i.deleted_at === null && i.category === cat.value && isOpenItem(i));
    if (open.length === 0) continue;
    lines.push(`${cat.plural} (${open.length})`);
    for (const i of open) {
      const meta = [
        statusDef(i)?.label,
        companiesLabel(i.company_ids, companies),
        i.priority === "high" ? "Prio hoch" : "",
        i.ticket ? `Ticket ${i.ticket}` : "",
        i.contact_person_ids.map((id) => people.find((p) => p.id === id)?.name ?? "").join(", "),
        ageLabel(i, today, vendorName),
      ].filter(Boolean);
      lines.push(`- ${i.title} (${meta.join(" · ")})`);
    }
    lines.push("");
  }
  if (lines.length === 2) lines.push("Keine offenen Punkte.");
  return lines.join("\n").trim();
}
