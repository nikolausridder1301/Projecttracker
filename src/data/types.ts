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

export type TrafficLight = "green" | "yellow" | "red";
export type TaskStatus = "open" | "in_progress" | "blocked" | "done";
export type Priority = "high" | "medium" | "low";
export type NoteKind = "note" | "meeting" | "decision";

export interface Company extends Base {
  name: string;
  short: string;
  color: string;
  logo_key: string | null;
  is_overarching: boolean;
  traffic_light: TrafficLight;
  traffic_comment: string;
  traffic_changed_at: IsoDateTime | null;
  sort: number;
}

export interface Topic extends Base {
  name: string;
  sort: number;
  archived: boolean;
}

export interface LinkCategory extends Base {
  name: string;
  sort: number;
}

export interface Person extends Base {
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

export interface Task extends Base {
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

export interface Note extends Base {
  title: string;
  body: string;
  kind: NoteKind;
  company_id: Id;
  topic_id: Id | null;
  meeting_date: IsoDate | null;
  participant_ids: Id[];
  participants_text: string;
}

export interface Link extends Base {
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

export interface AppMeta extends Base {
  last_export_at: IsoDateTime | null;
}

export interface Tables {
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
}

export type TableName = keyof Tables;

export const TABLE_NAMES: TableName[] = [
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
];

export type Db = { [K in TableName]: Tables[K][] };

/** Felder, die beim Anlegen vom Backend gesetzt werden. */
export type NewRow<K extends TableName> = Omit<Tables[K], keyof Base> & { id?: Id };
export type Patch<K extends TableName> = Partial<Omit<Tables[K], "id" | "created_at" | "updated_at">>;

export const STATUS_LABEL: Record<TaskStatus, string> = {
  open: "Offen",
  in_progress: "In Arbeit",
  blocked: "Blockiert",
  done: "Erledigt",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  high: "Hoch",
  medium: "Mittel",
  low: "Niedrig",
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
