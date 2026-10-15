import type { Db, Id } from "../data/types";
import { isActive } from "./tasks";

export type HitType = "task" | "note" | "link" | "person";

export interface Hit {
  type: HitType;
  id: Id;
  title: string;
  sub: string;
  score: number;
}

const norm = (s: string) =>
  s.toLocaleLowerCase("de").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss");

/**
 * Globale Suche (SPEC 6.9): alle Suchwörter müssen vorkommen, Treffer im
 * Titel zählen mehr als im Inhalt. Erledigte Aufgaben werden mitgesucht.
 */
export function search(db: Db, query: string, limitPerType = 8): Hit[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const score = (title: string, body: string): number => {
    const t = norm(title);
    const b = norm(body);
    let s = 0;
    for (const w of words) {
      if (t.includes(w)) s += t.startsWith(w) ? 3 : 2;
      else if (b.includes(w)) s += 1;
      else return 0;
    }
    return s;
  };

  const company = (id: Id | null) => db.companies.find((c) => c.id === id)?.short ?? "";
  const hits: Hit[] = [];
  const push = (list: Hit[]) =>
    hits.push(...list.filter((h) => h.score > 0).sort((a, b) => b.score - a.score).slice(0, limitPerType));

  push(
    db.tasks.filter(isActive).map((t) => ({
      type: "task",
      id: t.id,
      title: t.title,
      sub: `${company(t.company_id)}${t.status === "done" ? " · erledigt" : ""}`,
      score: score(t.title, `${t.description} ${t.checklist.map((c) => c.text).join(" ")} ${t.blocked_reason}`),
    })),
  );
  push(
    db.notes.filter(isActive).map((n) => ({
      type: "note",
      id: n.id,
      title: n.title,
      sub: company(n.company_id),
      score: score(n.title, `${n.body} ${n.participants_text}`),
    })),
  );
  push(
    db.links.filter(isActive).map((l) => ({
      type: "link",
      id: l.id,
      title: l.title,
      sub: company(l.company_id),
      score: score(l.title, `${l.url} ${l.description}`),
    })),
  );
  push(
    db.people.filter(isActive).map((p) => ({
      type: "person",
      id: p.id,
      title: p.name,
      sub: `${company(p.company_id)} ${p.role}`.trim(),
      score: score(p.name, `${p.role} ${p.email}`),
    })),
  );
  return hits;
}
