// Startdaten für den lokalen Demo-Modus. Firmen, Themen und Kategorien
// entsprechen supabase/migrations/002_seed.sql; Aufgaben/Notizen sind Beispiele.
import { addDays, todayIso } from "../logic/dates";
import type { Db } from "./types";

export function demoSeed(): Db {
  const now = new Date().toISOString();
  const projectId = crypto.randomUUID();
  const meta = () => ({ id: crypto.randomUUID(), created_at: now, updated_at: now, deleted_at: null });
  // Alle Beispieldaten gehören zum Demo-Projekt „Tacto“
  const base = () => ({ ...meta(), project_id: projectId });
  const today = todayIso();

  const companies = (
    [
      ["SK Group (Übergreifend)", "SK", "#161b26", "sk", true],
      ["HAZEMAG", "HAZ", "#c2410c", "hazemag", false],
      ["Allmineral", "ALM", "#0f766e", "allmineral", false],
      ["Maximator", "MAX", "#1d4ed8", "maximator", false],
      ["Maximator Hydrogen", "MXH", "#0891b2", "maximator-hydrogen", false],
      ["FEST", "FEST", "#7c3aed", "fest", false],
      ["Perforator", "PER", "#be123c", "perforator", false],
      ["Tacto", "TAC", "#ea7a0c", "tacto", false],
    ] as const
  ).map(([name, short, color, logo_key, is_overarching], sort) => ({
    ...base(),
    name,
    short,
    color,
    logo_key,
    is_overarching,
    is_external: name === "Tacto",
    traffic_light: (sort === 5 ? "red" : sort === 2 ? "yellow" : "green") as "red" | "yellow" | "green",
    traffic_comment: sort === 5 ? "ERP-Datenexport fehlt noch" : "",
    traffic_changed_at: null,
    sort,
  }));

  const topics = [
    "Projektmanagement/Allgemein",
    "Datentransfer: lesen",
    "Datentransfer: schreiben",
    "Warengruppen",
    "Analytics",
    "Einsparungen (Hinweise)",
    "RFQs",
    "Agenten",
    "Lieferantenabfragen",
    "Lieferantenbewertungen",
    "Auftragsbestätigung",
    "Schulung/Academy",
    "Stammdaten",
  ].map((name, sort) => ({ ...base(), name, sort, archived: false }));

  const link_categories = ["Konzept", "Vertrag/Angebot", "Schulung", "Technik", "Protokoll", "Sonstiges"].map(
    (name, sort) => ({ ...base(), name, sort }),
  );

  const [sk, haz, alm, , , fest] = companies;
  const people = [
    { ...base(), name: "Anna Beispiel", company_id: haz.id, role: "Key-User Einkauf", email: "anna@example.com", phone: "", active: true },
    { ...base(), name: "Max Muster", company_id: fest.id, role: "IT / ERP", email: "max@example.com", phone: "", active: true },
  ];

  const task = (o: Partial<Db["tasks"][number]>) => ({
    ...base(),
    title: "",
    description: "",
    company_ids: [sk.id],
    topic_id: null,
    assignee_person_ids: [] as string[],
    status: "open" as const,
    blocked_reason: "",
    priority: "medium" as const,
    due_date: null,
    follow_up_date: null,
    done_at: null,
    checklist: [],
    source_note_id: null,
    ...o,
  });

  const tasks = [
    task({ title: "Steuerkreis-Unterlage vorbereiten", due_date: today, priority: "high", topic_id: topics[0].id }),
    task({ title: "Warengruppen-Mapping prüfen", company_ids: [alm.id], due_date: addDays(today, -2), topic_id: topics[3].id }),
    task({
      title: "Datenexport aus ERP bereitstellen",
      company_ids: [fest.id],
      assignee_person_ids: [people[1].id],
      follow_up_date: today,
      due_date: addDays(today, 3),
      topic_id: topics[1].id,
      priority: "high",
    }),
    task({
      title: "Academy-Schulung abschließen",
      company_ids: [haz.id],
      assignee_person_ids: [people[0].id],
      follow_up_date: addDays(today, 4),
      topic_id: topics[11].id,
      checklist: [
        { text: "Grundlagen", done: true, milestone: true },
        { text: "Modul 1", done: true },
        { text: "Vertiefung", done: false, milestone: true, due: addDays(today, 10) },
        { text: "Modul 2", done: false, person_ids: [people[0].id], due: addDays(today, -1) },
      ],
    }),
    task({
      title: "Schreibschnittstelle ERP",
      company_ids: [haz.id],
      status: "blocked",
      blocked_reason: "Warten auf Freigabe ERP-Anbieter",
      topic_id: topics[2].id,
    }),
  ];

  // Beispiel-Fortschritt: einige Meilensteine bei einigen Firmen
  const demoMilestones = () => {
    const [, hazC, almC, maxC, , festC] = companies;
    const st = (topic: number, company: { id: string }, status: Db["milestone_status"][number]["status"], extra: object = {}) => ({
      ...base(),
      topic_id: topics[topic].id,
      company_id: company.id,
      status,
      target_date: null,
      comment: "",
      ...extra,
    });
    return [
      st(1, hazC, "done"),
      st(1, almC, "done"),
      st(1, festC, "delayed", { comment: "Nur Test-Datei empfangen, Ticket beim ERP-Anbieter", target_date: addDays(today, -5) }),
      st(2, hazC, "at_risk", { comment: "Schreibfunktion in Arbeit", target_date: addDays(today, 14) }),
      st(3, almC, "on_track"),
      st(3, maxC, "on_track", { target_date: addDays(today, 30) }),
      st(11, hazC, "on_track"),
    ];
  };

  const projects = [
    {
      ...meta(),
      id: projectId,
      name: "Tacto",
      short: "TAC",
      color: "#ea7a0c",
      report_url: "https://nikolausridder1301.github.io/tacto/",
      vendor_company_id: companies.find((c) => c.is_external)?.id ?? null,
      sort: 0,
      archived: false,
    },
  ];

  return {
    projects,
    companies,
    topics,
    link_categories,
    people,
    notes: [],
    tasks,
    task_followups: [],
    links: [],
    attachments: [],
    app_meta: [{ ...meta(), last_export_at: null, nav_order: [] }],
    vendor_items: [],
    traffic_history: [],
    milestone_status: demoMilestones(),
  };
}
