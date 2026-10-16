import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { Backend } from "./backend";
import { PROJECT_TABLES, type Db, type Id, type NewRow, type Patch, type Project, type TableName, type Tables } from "./types";

// Zentraler Datenspeicher: alle Tabellen werden beim Start einmal geladen
// (Einzelnutzer, überschaubare Datenmengen) und danach optimistisch
// aktualisiert. Schlägt das Speichern fehl, wird der lokale Stand
// zurückgerollt und ein Fehler gemeldet – nichts geht still verloren.
//
// Projekte: `db` enthält nur die Daten des aktuellen Projekts – so arbeiten
// alle Ansichten unverändert projektbezogen. `allDb` ist der Gesamtbestand
// (Export, „Alle Projekte“, Projektwechsel). Neue Datensätze bekommen die
// project_id des aktuellen Projekts automatisch.

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "error";
  undo?: () => void;
}

interface StoreValue {
  /** Daten des aktuellen Projekts */
  db: Db;
  /** Alle Daten aller Projekte */
  allDb: Db;
  backend: Backend;
  project: Project | undefined;
  projects: Project[];
  setProject(id: Id): void;
  insert<K extends TableName>(table: K, rows: NewRow<K>[]): Promise<Tables[K][]>;
  update<K extends TableName>(table: K, id: Id, patch: Patch<K>): Promise<void>;
  /** Papierkorb: setzt deleted_at, mit "Rückgängig" für 5 Sekunden. */
  trash(table: TableName, id: Id, label: string): Promise<void>;
  restore(table: TableName, id: Id): Promise<void>;
  purge(table: TableName, id: Id): Promise<void>;
  toast(text: string, kind?: Toast["kind"], undo?: () => void): void;
  toasts: Toast[];
  dismissToast(id: number): void;
  reload(): Promise<void>;
}

const Ctx = createContext<StoreValue | null>(null);
const PROJECT_KEY = "projecttracker-project";
const isProjectTable = (t: TableName) => (PROJECT_TABLES as readonly string[]).includes(t);

function readStoredProject(): Id | null {
  try {
    return localStorage.getItem(PROJECT_KEY);
  } catch {
    return null;
  }
}

/** Gefilterte Sicht auf ein Projekt; Verlauf/Anhänge folgen ihren Aufgaben/Links. */
export function scopeDb(all: Db, projectId: Id | undefined): Db {
  if (!projectId) return all;
  const scoped = { ...all } as Db;
  for (const t of PROJECT_TABLES) {
    (scoped as Record<string, unknown[]>)[t] = (all[t] as { project_id: Id }[]).filter((r) => r.project_id === projectId);
  }
  const taskIds = new Set(scoped.tasks.map((t) => t.id));
  const linkIds = new Set(scoped.links.map((l) => l.id));
  scoped.task_followups = all.task_followups.filter((f) => taskIds.has(f.task_id));
  scoped.attachments = all.attachments.filter((a) => linkIds.has(a.link_id));
  return scoped;
}

export function StoreProvider({ backend, initial, children }: { backend: Backend; initial: Db; children: ReactNode }) {
  const [allDb, setDb] = useState<Db>(initial);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [projectId, setProjectId] = useState<Id | null>(readStoredProject);
  const nextToast = useRef(1);
  const dbRef = useRef(allDb);
  dbRef.current = allDb;

  const projects = useMemo(
    () => allDb.projects.filter((p) => p.deleted_at === null).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "de")),
    [allDb.projects],
  );
  // Gespeichertes Projekt, sonst erstes aktives
  const project = projects.find((p) => p.id === projectId) ?? projects.find((p) => !p.archived) ?? projects[0];
  const projectRef = useRef(project);
  projectRef.current = project;

  const db = useMemo(() => scopeDb(allDb, project?.id), [allDb, project?.id]);

  const setProject = useCallback((id: Id) => {
    setProjectId(id);
    try {
      localStorage.setItem(PROJECT_KEY, id);
    } catch {
      /* ignorieren */
    }
  }, []);

  const dismissToast = useCallback((id: number) => setToasts((l) => l.filter((t) => t.id !== id)), []);

  const toast = useCallback(
    (text: string, kind: Toast["kind"] = "info", undo?: () => void) => {
      const id = nextToast.current++;
      setToasts((l) => [...l, { id, text, kind, undo }]);
      setTimeout(() => dismissToast(id), kind === "error" ? 8000 : 5000);
    },
    [dismissToast],
  );

  const replaceRow = <K extends TableName>(table: K, row: Tables[K]) =>
    setDb((d) => ({ ...d, [table]: (d[table] as Tables[K][]).map((r) => (r.id === row.id ? row : r)) }));

  const insert = useCallback(
    async <K extends TableName>(table: K, rows: NewRow<K>[]) => {
      try {
        const pid = projectRef.current?.id;
        const prepared = isProjectTable(table) ? rows.map((r) => ({ project_id: pid, ...r })) : rows;
        const created = await backend.insert(table, prepared);
        setDb((d) => ({ ...d, [table]: [...(d[table] as Tables[K][]), ...created] }));
        return created;
      } catch (e) {
        toast(`Speichern fehlgeschlagen: ${(e as Error).message}`, "error");
        throw e;
      }
    },
    [backend, toast],
  );

  const update = useCallback(
    async <K extends TableName>(table: K, id: Id, patch: Patch<K>) => {
      const before = (dbRef.current[table] as Tables[K][]).find((r) => r.id === id);
      if (!before) return;
      replaceRow(table, { ...before, ...patch });
      try {
        const saved = await backend.update(table, id, patch);
        replaceRow(table, saved);
      } catch (e) {
        replaceRow(table, before);
        toast(`Speichern fehlgeschlagen: ${(e as Error).message}`, "error");
        throw e;
      }
    },
    [backend, toast],
  );

  const restore = useCallback((table: TableName, id: Id) => update(table, id, { deleted_at: null } as never), [update]);

  const trash = useCallback(
    async (table: TableName, id: Id, label: string) => {
      await update(table, id, { deleted_at: new Date().toISOString() } as never);
      toast(`„${label}“ in den Papierkorb verschoben`, "info", () => void restore(table, id));
    },
    [update, toast, restore],
  );

  const purge = useCallback(
    async (table: TableName, id: Id) => {
      try {
        await backend.remove(table, id);
        setDb((d) => ({ ...d, [table]: (d[table] as { id: Id }[]).filter((r) => r.id !== id) }));
      } catch (e) {
        toast(`Löschen fehlgeschlagen: ${(e as Error).message}`, "error");
      }
    },
    [backend, toast],
  );

  const reload = useCallback(async () => {
    setDb(await backend.loadAll());
  }, [backend]);

  const value = useMemo<StoreValue>(
    () => ({ db, allDb, backend, project, projects, setProject, insert, update, trash, restore, purge, toast, toasts, dismissToast, reload }),
    [db, allDb, backend, project, projects, setProject, insert, update, trash, restore, purge, toast, toasts, dismissToast, reload],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("StoreProvider fehlt");
  return v;
}

/** Bequeme, gefilterte Sichten (aktuelles Projekt, ohne Papierkorb), sortiert. */
export function useLookups() {
  const { db, allDb } = useStore();
  return useMemo(() => {
    const alive = <T extends { deleted_at: string | null }>(l: T[]) => l.filter((r) => r.deleted_at === null);
    const companies = alive(db.companies).sort((a, b) => a.sort - b.sort);
    const topics = alive(db.topics).sort((a, b) => a.sort - b.sort);
    const people = alive(db.people).sort((a, b) => a.name.localeCompare(b.name, "de"));
    const categories = alive(db.link_categories).sort((a, b) => a.sort - b.sort);
    // Nachschlagen über alle Projekte (z. B. „Heute – Alle Projekte“)
    const byId = <T extends { id: Id }>(l: T[]) => new Map(l.map((r) => [r.id, r]));
    return {
      companies,
      topics,
      people,
      categories,
      companyById: byId(allDb.companies),
      topicById: byId(allDb.topics),
      personById: byId(allDb.people),
      categoryById: byId(allDb.link_categories),
      noteById: byId(allDb.notes),
      linkById: byId(allDb.links),
      projectById: byId(allDb.projects),
    };
  }, [db, allDb]);
}
