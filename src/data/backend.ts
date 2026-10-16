import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { demoSeed } from "./seed";
import { TABLE_NAMES, type Db, type Id, type NewRow, type Patch, type TableName, type Tables } from "./types";

export interface Backend {
  /** "supabase" im Betrieb, "demo" nur lokal ohne .env (Daten im localStorage). */
  kind: "supabase" | "demo";
  getUserEmail(): Promise<string | null>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  onAuthChange(cb: (email: string | null) => void): () => void;
  loadAll(): Promise<Db>;
  insert<K extends TableName>(table: K, rows: NewRow<K>[]): Promise<Tables[K][]>;
  update<K extends TableName>(table: K, id: Id, patch: Patch<K>): Promise<Tables[K]>;
  /** Endgültig löschen (nur aus dem Papierkorb). */
  remove(table: TableName, id: Id): Promise<void>;
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

function supabaseBackend(client: SupabaseClient): Backend {
  const fail = (error: { message: string } | null) => {
    if (error) throw new Error(error.message);
  };
  return {
    kind: "supabase",
    async getUserEmail() {
      const { data } = await client.auth.getSession();
      return data.session?.user.email ?? null;
    },
    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw new Error("Anmeldung fehlgeschlagen. Bitte E-Mail und Passwort prüfen.");
    },
    async signOut() {
      await client.auth.signOut();
    },
    onAuthChange(cb) {
      const { data } = client.auth.onAuthStateChange((_event, session) => cb(session?.user.email ?? null));
      return () => data.subscription.unsubscribe();
    },
    async loadAll() {
      const results = await Promise.all(
        TABLE_NAMES.map(async (t) => {
          // Supabase liefert max. 1000 Zeilen je Abfrage → seitenweise laden.
          const rows: unknown[] = [];
          for (let from = 0; ; from += 1000) {
            const { data, error } = await client.from(t).select("*").range(from, from + 999);
            fail(error);
            rows.push(...(data ?? []));
            if (!data || data.length < 1000) break;
          }
          return [t, rows] as const;
        }),
      );
      return Object.fromEntries(results) as unknown as Db;
    },
    async insert(table, rows) {
      const { data, error } = await client.from(table).insert(rows).select();
      fail(error);
      return data as never;
    },
    async update(table, id, patch) {
      const { data, error } = await client.from(table).update(patch as never).eq("id", id).select().single();
      fail(error);
      return data as never;
    },
    async remove(table, id) {
      const { error } = await client.from(table).delete().eq("id", id);
      fail(error);
    },
  };
}

// ---------------------------------------------------------------------------
// Demo (nur lokale Entwicklung ohne Supabase-Zugang)
// ---------------------------------------------------------------------------

const DEMO_KEY = "projecttracker-demo-db";

function demoBackend(): Backend {
  let db: Db;
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    db = raw ? (JSON.parse(raw) as Db) : demoSeed();
  } catch {
    db = demoSeed();
  }
  // Ältere Demo-Stände um neu hinzugekommene Tabellen ergänzen
  for (const t of TABLE_NAMES) (db as Record<string, unknown[]>)[t] ??= [];
  // Früher eine Person je Aufgabe, jetzt mehrere
  for (const t of db.tasks as (Db["tasks"][number] & { assignee_person_id?: string | null })[]) {
    t.assignee_person_ids ??= t.assignee_person_id ? [t.assignee_person_id] : [];
    delete t.assignee_person_id;
  }
  const save = () => {
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify(db));
    } catch {
      /* Demo: Speichern optional */
    }
  };
  let email: string | null = "demo@lokal";
  const listeners = new Set<(e: string | null) => void>();
  const delay = () => new Promise((r) => setTimeout(r, 80));

  return {
    kind: "demo",
    async getUserEmail() {
      return email;
    },
    async signIn(e) {
      email = e || "demo@lokal";
      listeners.forEach((l) => l(email));
    },
    async signOut() {
      email = null;
      listeners.forEach((l) => l(email));
    },
    onAuthChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async loadAll() {
      await delay();
      return structuredClone(db);
    },
    async insert(table, rows) {
      await delay();
      const now = new Date().toISOString();
      const created = rows.map((r) => ({
        ...r,
        id: r.id ?? crypto.randomUUID(),
        created_at: now,
        updated_at: now,
        deleted_at: null,
      })) as never[];
      (db[table] as unknown[]).push(...created);
      save();
      return structuredClone(created);
    },
    async update(table, id, patch) {
      await delay();
      const rows = db[table] as unknown as { id: Id }[];
      const i = rows.findIndex((r) => r.id === id);
      if (i < 0) throw new Error("Eintrag nicht gefunden");
      rows[i] = { ...rows[i], ...patch, updated_at: new Date().toISOString() };
      save();
      return structuredClone(rows[i]) as never;
    },
    async remove(table, id) {
      await delay();
      (db as Record<string, { id: Id }[]>)[table] = (db[table] as unknown as { id: Id }[]).filter((r) => r.id !== id);
      save();
    },
  };
}

// ---------------------------------------------------------------------------

export type BackendResult = { backend: Backend } | { error: string };

export function createBackend(): BackendResult {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && key) {
    return { backend: supabaseBackend(createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })) };
  }
  if (import.meta.env.DEV) return { backend: demoBackend() };
  return { error: "Supabase ist nicht konfiguriert (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY fehlen im Build)." };
}

export function resetDemoData() {
  try {
    localStorage.removeItem(DEMO_KEY);
  } catch {
    /* ignorieren */
  }
}
