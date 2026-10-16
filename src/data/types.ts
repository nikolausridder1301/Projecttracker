// Datenmodell, 1:1 zu supabase/migrations/001_schema.sql (SPEC.md Abschnitt 5).

export type Id = string;
export type IsoDate = string; // "2026-10-15"
export type IsoDateTime = string;

interface Base {
  id: Id;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
  deleted_at: IsoDateTime | null;
}

/** Datensätze, die zu genau einem Projekt gehören. */
interface InProject {
  project_id: Id;
}

export type TrafficLight = "green" | "yellow" | "red";
export type TaskStatus = "open" | "blocked" | "done";
/** "high" = als wichtig markiert (Fahne), sonst "medium" */
export type Priority = "high" | "medium";
export type NoteKind = "note" | "meeting" | "decision";

export interface Project extends Base {
  name: string;
  short: string;
  color: string;
  /** Firma (externer Partner), deren Anbieter-Bereich im Menü erscheint; null = aus */
  vendor_company_id: Id | null;
  sort: number;
  archived: boolean;
}

export interface Company extends Base, InProject {
  name: string;
  short: string;
  color: string;
  logo_key: string | null;
  is_overarching: boolean;
  /** Externer Partner (z. B. Software-Anbieter), keine Gesellschaft der Gruppe */
  is_external: boolean;
  traffic_light: TrafficLight;
  traffic_comment: string;
  traffic_changed_at: IsoDateTime | null;
  sort: number;
}

export interface Topic extends Base, InProject {
  name: string;
  sort: number;
  archived: boolean;
}

export interface LinkCategory extends Base, InProject {
  name: string;
  sort: number;
}

export interface Person extends Base, InProject {
  name: string;
  company_id: Id | null;
  role: string;
  email: string;
  phone: string;
  active: boolean;
}

export interface ChecklistItem {
  text: string;
  done: boolean;
}

export interface Task extends Base, InProject {
  title: string;
  description: string;
  company_id: Id;
  topic_id: Id | null;
  /** null = "Ich", sonst Delegation */
  assignee_person_id: Id | null;
  status: TaskStatus;
  blocked_reason: string;
  priority: Priority;
  due_date: IsoDate | null;
  follow_up_date: IsoDate | null;
  done_at: IsoDateTime | null;
  checklist: ChecklistItem[];
  group_id: Id | null;
  source_note_id: Id | null;
}

export interface TaskFollowup extends Base {
  task_id: Id;
  date: IsoDate;
  note: string;
}

export interface Note extends Base, InProject {
  title: string;
  body: string;
  kind: NoteKind;
  company_id: Id;
  topic_id: Id | null;
  meeting_date: IsoDate | null;
  participant_ids: Id[];
  participants_text: string;
}

export interface Link extends Base, InProject {
  title: string;
  url: string;
  company_id: Id;
  topic_id: Id | null;
  category_id: Id | null;
  description: string;
}

export interface Attachment extends Base {
  link_id: Id;
  task_id: Id | null;
  note_id: Id | null;
}

export type VendorCategory = "feature" | "question" | "bug" | "best_practice" | "claim";

/** Anbieter-Punkt (Feature Request, Frage, Bug, Best Practice, Fail & Claim). */
export interface VendorItem extends Base, InProject {
  title: string;
  body: string;
  category: VendorCategory;
  /** Werte je Kategorie, siehe logic/vendor.ts */
  status: string;
  /** leer = alle Gesellschaften */
  company_ids: Id[];
  topic_id: Id | null;
  priority: Priority;
  contact_person_id: Id | null;
  ticket: string;
  answer: string;
  promised: string;
  actual: string;
  evidence_url: string;
  /** Datum, an dem der Punkt erstmals an den Anbieter ging */
  reported_at: IsoDate | null;
  status_changed_at: IsoDateTime | null;
}

/** Eine Änderung der Firmen-Ampel mit Begründung. */
export interface TrafficHistory extends Base, InProject {
  company_id: Id;
  /** null = erster Eintrag (vorheriger Stand unbekannt) */
  from_light: TrafficLight | null;
  to_light: TrafficLight;
  comment: string;
}

export type MilestoneState = "not_started" | "on_track" | "at_risk" | "delayed" | "done" | "n_a";

/** Stand eines Meilensteins (Thema) bei einer Firma. */
export interface MilestoneStatus extends Base, InProject {
  topic_id: Id;
  company_id: Id;
  status: MilestoneState;
  target_date: IsoDate | null;
  comment: string;
}

export interface AppMeta extends Base {
  last_export_at: IsoDateTime | null;
  /** Reihenfolge der Menüpunkte (Schlüssel aus ui/nav.ts); leer = Standard */
  nav_order: string[];
}

export interface Tables {
  projects: Project;
  companies: Company;
  topics: Topic;
  link_categories: LinkCategory;
  people: Person;
  notes: Note;
  tasks: Task;
  task_followups: TaskFollowup;
  links: Link;
  attachments: Attachment;
  app_meta: AppMeta;
  vendor_items: VendorItem;
  traffic_history: TrafficHistory;
  milestone_status: MilestoneStatus;
}

export type TableName = keyof Tables;

export const TABLE_NAMES: TableName[] = [
  "projects",
  "companies",
  "topics",
  "link_categories",
  "people",
  "notes",
  "tasks",
  "task_followups",
  "links",
  "attachments",
  "app_meta",
  "vendor_items",
  "traffic_history",
  "milestone_status",
];

export type Db = { [K in TableName]: Tables[K][] };

/** Tabellen mit project_id – werden in der App auf das aktuelle Projekt gefiltert. */
export const PROJECT_TABLES = [
  "companies",
  "topics",
  "link_categories",
  "people",
  "notes",
  "tasks",
  "links",
  "vendor_items",
  "traffic_history",
  "milestone_status",
] as const satisfies readonly TableName[];

/** Felder, die beim Anlegen vom Backend gesetzt werden. project_id ergänzt der Store. */
export type NewRow<K extends TableName> = Omit<Tables[K], keyof Base | "project_id"> & { id?: Id; project_id?: Id };
export type Patch<K extends TableName> = Partial<Omit<Tables[K], "id" | "created_at" | "updated_at">>;

export const STATUS_LABEL: Record<TaskStatus, string> = {
  open: "Offen",
  blocked: "Blockiert",
  done: "Erledigt",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  high: "Wichtig",
  medium: "Normal",
};

export const NOTE_KIND_LABEL: Record<NoteKind, string> = {
  note: "Notiz",
  meeting: "Meeting-Protokoll",
  decision: "Entscheidung",
};

export const TRAFFIC_LABEL: Record<TrafficLight, string> = {
  green: "Grün",
  yellow: "Gelb",
  red: "Rot",
};
