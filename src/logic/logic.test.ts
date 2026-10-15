import { describe, expect, it } from "vitest";
import { demoSeed } from "../data/seed";
import type { Task, VendorItem } from "../data/types";
import { addWorkdays, endOfWeek, formatDate, relativeLabel } from "./dates";
import { search } from "./search";
import { affectsCompany, ageLabel, isOpenItem, jourFixeText, newVendorItem, showTicket, statusPatch } from "./vendor";
import { compareTasks, groupProgress, isValidUrl, todayCount, todayView, validateTask } from "./tasks";

const T = (o: Partial<Task>): Task => ({
  id: crypto.randomUUID(),
  created_at: "",
  updated_at: "",
  deleted_at: null,
  title: "x",
  description: "",
  company_id: "c1",
  topic_id: null,
  assignee_person_id: null,
  status: "open",
  blocked_reason: "",
  priority: "medium",
  due_date: null,
  follow_up_date: null,
  done_at: null,
  checklist: [],
  group_id: null,
  source_note_id: null,
  ...o,
});

describe("dates", () => {
  it("Donnerstag + 3 Werktage = Dienstag", () => {
    expect(addWorkdays("2026-10-15", 3)).toBe("2026-10-20");
  });
  it("Freitag + 1 Werktag = Montag", () => {
    expect(addWorkdays("2026-10-16", 1)).toBe("2026-10-19");
  });
  it("Wochenende endet sonntags", () => {
    expect(endOfWeek("2026-10-15")).toBe("2026-10-18");
    expect(endOfWeek("2026-10-18")).toBe("2026-10-18");
    expect(endOfWeek("2026-10-19")).toBe("2026-10-25");
  });
  it("formatiert deutsch", () => {
    expect(formatDate("2026-01-05")).toBe("05.01.2026");
    expect(relativeLabel("2026-10-14", "2026-10-15")).toBe("Gestern");
  });
});

describe("todayView", () => {
  const today = "2026-10-15";
  const tasks = [
    T({ title: "überfällig", due_date: "2026-10-10" }),
    T({ title: "heute", due_date: today }),
    T({ title: "woche", due_date: "2026-10-18" }),
    T({ title: "nächste woche", due_date: "2026-10-19" }),
    T({ title: "erledigt", due_date: today, status: "done" }),
    T({ title: "gelöscht", due_date: today, deleted_at: "x" }),
    T({ title: "delegiert heute", assignee_person_id: "p1", follow_up_date: today, due_date: today }),
    T({ title: "delegiert später", assignee_person_id: "p1", follow_up_date: "2026-10-20" }),
    T({ title: "delegiert überfällig", assignee_person_id: "p1", due_date: "2026-10-01" }),
    T({ title: "blockiert", status: "blocked", blocked_reason: "x", due_date: today }),
  ];
  const v = todayView(tasks, today);
  const titles = (l: Task[]) => l.map((t) => t.title);

  it("trennt eigene Fälligkeiten", () => {
    expect(titles(v.overdue)).toEqual(["überfällig"]);
    expect(titles(v.today)).toEqual(["heute"]);
    expect(titles(v.week)).toEqual(["woche"]);
  });
  it("delegierte erscheinen unter Nachhaken, nicht unter Meine", () => {
    expect(titles(v.followUp)).toEqual(["delegiert überfällig", "delegiert heute"]);
  });
  it("blockierte gesondert", () => {
    expect(titles(v.blocked)).toEqual(["blockiert"]);
  });
  it("Zähler für den Tab-Titel", () => {
    expect(todayCount(v)).toBe(4);
  });
});

describe("tasks", () => {
  it("Gruppenfortschritt nennt offene Firmen", () => {
    const g = "g1";
    const tasks = [
      T({ group_id: g, company_id: "a", status: "done" }),
      T({ group_id: g, company_id: "b", status: "done" }),
      T({ group_id: g, company_id: "c" }),
      T({ group_id: g, company_id: "d", deleted_at: "x" }),
    ];
    expect(groupProgress(tasks, g)).toEqual({ done: 2, total: 3, openCompanyIds: ["c"] });
  });
  it("Blockiert ohne Grund ist ungültig", () => {
    expect(validateTask({ title: "a", status: "blocked", blocked_reason: " " })).toMatch(/Grund/);
    expect(validateTask({ title: "a", status: "blocked", blocked_reason: "ERP" })).toBeNull();
    expect(validateTask({ title: " ", status: "open", blocked_reason: "" })).toMatch(/Titel/);
  });
  it("sortiert nach Fälligkeit, dann Priorität", () => {
    const l = [T({ title: "c" }), T({ title: "b", due_date: "2026-01-02", priority: "low" }), T({ title: "a", due_date: "2026-01-02", priority: "high" })];
    expect(l.sort(compareTasks).map((t) => t.title)).toEqual(["a", "b", "c"]);
  });
  it("URL-Prüfung", () => {
    expect(isValidUrl("https://firma.sharepoint.com/x")).toBe(true);
    expect(isValidUrl("firma.sharepoint.com")).toBe(false);
    expect(isValidUrl("javascript:alert(1)")).toBe(false);
  });
});

describe("search", () => {
  it("findet Aufgaben per Titelteil, auch Umlaute-unabhängig", () => {
    const db = demoSeed();
    expect(search(db, "schulung abschliessen")[0]?.title).toBe("Academy-Schulung abschließen");
    expect(search(db, "academy")[0]?.title).toBe("Academy-Schulung abschließen");
    expect(search(db, "academy gibtsnicht")).toEqual([]);
  });
  it("ist schnell genug bei 2.000 Einträgen", () => {
    const db = demoSeed();
    for (let i = 0; i < 2000; i++) db.tasks.push(T({ title: `Aufgabe ${i} Lieferant`, description: "lorem ipsum ".repeat(20) }));
    const start = performance.now();
    search(db, "lieferant 1999");
    expect(performance.now() - start).toBeLessThan(200);
  });
});

describe("vendor", () => {
  const V = (o: Partial<VendorItem>): VendorItem => ({
    id: crypto.randomUUID(),
    created_at: "2026-10-01T08:00:00Z",
    updated_at: "",
    deleted_at: null,
    title: "x",
    body: "",
    category: "bug",
    status: "open",
    company_ids: [],
    topic_id: null,
    priority: "medium",
    contact_person_id: null,
    ticket: "",
    answer: "",
    promised: "",
    actual: "",
    evidence_url: "",
    reported_at: null,
    status_changed_at: null,
    ...o,
  });

  it("offen/erledigt je Kategorie", () => {
    expect(isOpenItem(V({ category: "bug", status: "reported" }))).toBe(true);
    expect(isOpenItem(V({ category: "bug", status: "fixed" }))).toBe(false);
    expect(isOpenItem(V({ category: "feature", status: "rejected" }))).toBe(false);
    expect(isOpenItem(V({ category: "best_practice", status: "" }))).toBe(false);
  });
  it("Meldedatum wird beim ersten Weg zu Tacto gesetzt und bleibt", () => {
    expect(statusPatch(V({}), "reported", "2026-10-15").reported_at).toBe("2026-10-15");
    expect(statusPatch(V({ reported_at: "2026-10-02" }), "in_progress", "2026-10-15").reported_at).toBe("2026-10-02");
    expect(statusPatch(V({}), "open", "2026-10-15").reported_at).toBeNull();
  });
  it("Alter bei Tacto", () => {
    expect(ageLabel(V({ status: "reported", reported_at: "2026-09-22" }), "2026-10-15")).toBe("seit 23 T. bei Tacto");
    expect(ageLabel(V({ status: "open" }), "2026-10-06")).toBe("seit 5 T. offen");
    expect(ageLabel(V({ status: "fixed" }), "2026-10-15")).toBe("");
  });
  it("Ticketfeld erst ab Meldung bei Tacto", () => {
    expect(showTicket(V({ status: "open" }))).toBe(false);
    expect(showTicket(V({ status: "reported" }))).toBe(true);
    expect(showTicket(V({ status: "open", ticket: "T-1" }))).toBe(true);
    expect(showTicket(V({ category: "best_practice", status: "" }))).toBe(false);
  });
  it("neuer Punkt startet im ersten Status der Kategorie", () => {
    expect(newVendorItem("feature", "A", []).status).toBe("idea");
    expect(newVendorItem("best_practice", "B", []).status).toBe("");
    expect(newVendorItem("claim", "C", ["x"]).company_ids).toEqual(["x"]);
  });
  it("Firmenbezug: leer = alle", () => {
    expect(affectsCompany(V({ company_ids: [] }), "a")).toBe(true);
    expect(affectsCompany(V({ company_ids: ["b"] }), "a")).toBe(false);
  });
  it("Jour-fixe-Text listet nur offene Punkte nach Kategorie", () => {
    const text = jourFixeText(
      [
        V({ title: "Export bricht ab", status: "reported", reported_at: "2026-10-10", company_ids: ["c1"] }),
        V({ title: "Alt", status: "fixed" }),
        V({ title: "Schnittstelle", category: "feature", status: "requested", priority: "high" }),
      ],
      [{ id: "c1", short: "FEST" }],
      [],
      "2026-10-15",
    );
    expect(text).toContain("Feature Requests (1)");
    expect(text).toContain("- Schnittstelle (Bei Tacto angefragt · Alle Firmen · Prio hoch");
    expect(text).toContain("- Export bricht ab (Gemeldet · FEST · seit 5 T. bei Tacto)");
    expect(text).not.toContain("Alt");
  });
});
