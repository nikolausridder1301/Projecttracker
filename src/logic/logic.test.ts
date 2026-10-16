import { describe, expect, it } from "vitest";
import { demoSeed } from "../data/seed";
import type { MilestoneStatus, Task, VendorItem } from "../data/types";
import { addWorkdays, endOfWeek, formatDate, relativeLabel } from "./dates";
import { copyProjectMasterData, suggestShort } from "./projects";
import { moveItem, orderNav } from "./nav";
import { agendaText, buildBriefing } from "./briefing";
import { isOverdue, progress, suggestTraffic } from "./milestones";
import { search } from "./search";
import { sinceLabel, validateTrafficChange } from "./traffic";
import { affectsCompany, ageLabel, isOpenItem, jourFixeText, newVendorItem, showTicket, statusPatch } from "./vendor";
import {
  compareTasks,
  daysSinceUpdate,
  groupProgress,
  isValidUrl,
  latestUpdates,
  splitDone,
  staleLabel,
  standText,
  todayCount,
  todayView,
  validateTask,
} from "./tasks";

const T = (o: Partial<Task>): Task => ({
  id: crypto.randomUUID(),
  created_at: "",
  updated_at: "",
  deleted_at: null,
  project_id: "p1",
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

  it("trennt Fälligkeiten", () => {
    expect(titles(v.overdue)).toEqual(["delegiert überfällig", "überfällig"]);
    expect(titles(v.today)).toEqual(["delegiert heute", "heute"]);
    expect(titles(v.week)).toEqual(["woche"]);
  });
  it("delegierte Fälligkeiten erscheinen mit", () => {
    expect(titles(v.overdue)).toContain("überfällig");
    expect(titles(v.overdue)).toContain("delegiert überfällig");
    expect(titles(v.today)).toContain("delegiert heute");
  });
  it("blockierte gesondert", () => {
    expect(titles(v.blocked)).toEqual(["blockiert"]);
  });
  it("Zähler für den Tab-Titel", () => {
    expect(todayCount(v)).toBe(4);
    expect(v).not.toHaveProperty("followUp");
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
    const l = [T({ title: "c" }), T({ title: "b", due_date: "2026-01-02", priority: "medium" }), T({ title: "a", due_date: "2026-01-02", priority: "high" })];
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
    project_id: "p1",
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
    expect(ageLabel(V({ status: "reported", reported_at: "2026-09-22" }), "2026-10-15", "Tacto")).toBe("seit 23 T. bei Tacto");
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
      "Tacto",
    );
    expect(text).toContain("Feature Requests (1)");
    expect(text).toContain("Offene Punkte Tacto – Stand 15.10.2026");
    expect(text).toContain("- Schnittstelle (Angefragt · Alle Firmen · Prio hoch");
    expect(text).toContain("- Export bricht ab (Gemeldet · FEST · seit 5 T. bei Tacto)");
    expect(text).not.toContain("Alt");
  });
});

describe("projects", () => {
  it("kopiert Stammdaten mit neuen IDs und hängt Firmenbezüge um", () => {
    const db = demoSeed();
    const src = db.projects[0].id;
    let n = 0;
    const copy = copyProjectMasterData(db, src, "neu", () => `id${++n}`);
    expect(copy.companies).toHaveLength(db.companies.length);
    expect(copy.companies.every((c) => c.project_id === "neu" && c.traffic_light === "green")).toBe(true);
    const newCompanyIds = new Set(copy.companies.map((c) => c.id));
    expect(copy.people.every((p) => p.company_id === null || newCompanyIds.has(p.company_id))).toBe(true);
    expect(copy.topics).toHaveLength(db.topics.length);
    expect(copy.link_categories).toHaveLength(db.link_categories.length);
    // Anbieter (Tacto) zeigt auf die kopierte Firma
    const vendor = copy.companies.find((c) => c.id === copy.vendorCompanyId);
    expect(vendor?.name).toBe("Tacto");
  });
  it("Kürzel-Vorschlag", () => {
    expect(suggestShort("ERP-Einführung")).toBe("EE");
    expect(suggestShort("Tacto")).toBe("TAC");
    expect(suggestShort("Neue Einkaufs Plattform")).toBe("NEP");
  });
});

describe("nav", () => {
  const items = ["today", "tasks", "waiting", "notes", "vendor", "links", "people", "companies"].map((key) => ({ key }));
  const keys = (l: { key: string }[]) => l.map((i) => i.key).join(",");
  it("ohne gespeicherte Reihenfolge: Standard", () => {
    expect(keys(orderNav(items, []))).toBe("today,tasks,waiting,notes,vendor,links,people,companies");
  });
  it("gespeicherte Reihenfolge gilt", () => {
    expect(keys(orderNav(items, ["companies", "today", "tasks", "waiting", "notes", "vendor", "links", "people"]))).toBe(
      "companies,today,tasks,waiting,notes,vendor,links,people",
    );
  });
  it("Anbieter fehlt in diesem Projekt: wird übersprungen", () => {
    const noVendor = items.filter((i) => i.key !== "vendor");
    expect(keys(orderNav(noVendor, ["companies", "vendor", "today", "tasks", "waiting", "notes", "links", "people"]))).toBe(
      "companies,today,tasks,waiting,notes,links,people",
    );
  });
  it("neuer, nicht gespeicherter Punkt landet hinter seinem Vorgänger", () => {
    expect(keys(orderNav(items, ["companies", "today", "tasks", "waiting", "notes", "links", "people"]))).toBe(
      "companies,today,tasks,waiting,notes,vendor,links,people",
    );
  });
  it("verschieben", () => {
    expect(moveItem(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
  });
});

describe("Verlauf", () => {
  const today = "2026-10-15";
  const U = (task_id: string, date: string, note: string, created_at = `${date}T10:00:00Z`, deleted_at: string | null = null) => ({
    id: crypto.randomUUID(),
    created_at,
    updated_at: created_at,
    deleted_at,
    task_id,
    date,
    note,
  });
  it("jüngstes Update je Aufgabe, Gelöschte zählen nicht", () => {
    const m = latestUpdates([
      U("a", "2026-10-01", "alt"),
      U("a", "2026-10-12", "neu"),
      U("a", "2026-10-12", "neuer", "2026-10-12T15:00:00Z"),
      U("a", "2026-10-14", "gelöscht", "2026-10-14T10:00:00Z", "x"),
      U("b", "2026-09-30", "b"),
    ]);
    expect(m.get("a")?.note).toBe("neuer");
    expect(m.get("b")?.note).toBe("b");
  });
  it("Tage ohne Update, sonst seit Anlage", () => {
    expect(daysSinceUpdate({ created_at: "2026-09-01T08:00:00Z" }, { date: "2026-10-12" }, today)).toBe(3);
    expect(daysSinceUpdate({ created_at: "2026-10-05T08:00:00Z" }, undefined, today)).toBe(10);
  });
  it("Beschriftungen", () => {
    expect(staleLabel(0, true)).toBe("Update heute");
    expect(staleLabel(1, true)).toBe("Update gestern");
    expect(staleLabel(23, true)).toBe("seit 23 T. kein Update");
    expect(staleLabel(0, false)).toBe("noch kein Update");
    expect(standText({ date: "2026-10-12", note: "Oliver klärt" })).toBe("Stand 12.10.: Oliver klärt");
  });
});

describe("traffic", () => {
  it("Gelb/Rot nur mit Begründung", () => {
    expect(validateTrafficChange({ light: "green", comment: "" }, { light: "red", comment: " " })).toMatch(/begründen/);
    expect(validateTrafficChange({ light: "green", comment: "" }, { light: "red", comment: "Export hängt" })).toBeNull();
    expect(validateTrafficChange({ light: "red", comment: "x" }, { light: "green", comment: "" })).toBeNull();
  });
  it("ohne Änderung nichts speichern, Kommentar allein reicht", () => {
    expect(validateTrafficChange({ light: "yellow", comment: "a" }, { light: "yellow", comment: "a " })).toBe("Keine Änderung.");
    expect(validateTrafficChange({ light: "yellow", comment: "a" }, { light: "yellow", comment: "b" })).toBeNull();
  });
  it("seit-Angabe", () => {
    expect(sinceLabel("2026-10-15T08:00:00Z", "2026-10-15")).toBe("seit heute");
    expect(sinceLabel("2026-10-14T08:00:00Z", "2026-10-15")).toBe("seit gestern");
    expect(sinceLabel("2026-10-12T08:00:00Z", "2026-10-15")).toBe("seit 3 T.");
    expect(sinceLabel(null, "2026-10-15")).toBe("");
  });
});

describe("splitDone", () => {
  it("offene zuerst, Erledigte nach Datum absteigend", () => {
    const r = splitDone([
      T({ title: "a", status: "done", done_at: "2026-10-10T10:00:00Z" }),
      T({ title: "b" }),
      T({ title: "c", status: "done", done_at: "2026-10-14T10:00:00Z" }),
    ]);
    expect(r.open.map((t) => t.title)).toEqual(["b"]);
    expect(r.done.map((t) => t.title)).toEqual(["c", "a"]);
  });
});

describe("briefing", () => {
  const today = "2026-10-15";
  const setup = () => {
    const db = demoSeed();
    const haz = db.companies.find((c) => c.short === "HAZ")!;
    const fest = db.companies.find((c) => c.short === "FEST")!;
    const anna = db.people.find((p) => p.name === "Anna Beispiel")!; // HAZ
    const max = db.people.find((p) => p.name === "Max Muster")!; // FEST
    db.tasks = [
      T({ title: "Anna offen", company_id: haz.id, assignee_person_id: anna.id }),
      T({ title: "Anna blockiert", company_id: haz.id, assignee_person_id: anna.id, status: "blocked", blocked_reason: "x" }),
      T({ title: "Meins HAZ", company_id: haz.id }),
      T({ title: "Max bei HAZ", company_id: haz.id, assignee_person_id: max.id }),
      T({ title: "Meins FEST", company_id: fest.id }),
      T({ title: "Erledigt neu", company_id: haz.id, status: "done", done_at: "2026-10-14T10:00:00Z" }),
      T({ title: "Erledigt alt", company_id: haz.id, status: "done", done_at: "2026-09-01T10:00:00Z" }),
    ];
    return { db, haz, anna };
  };

  it("Person: delegiert an sie, meine + weitere Punkte ihrer Firma", () => {
    const { db, anna } = setup();
    const b = buildBriefing(db, { kind: "person", id: anna.id }, today);
    expect(b.company?.short).toBe("HAZ");
    expect(b.delegatedToPerson.map((t) => t.title)).toEqual(["Anna blockiert", "Anna offen"]);
    expect(b.myTasks.map((t) => t.title)).toEqual(["Meins HAZ"]);
    expect(b.otherTasks.map((t) => t.title)).toEqual(["Max bei HAZ"]);
  });
  it("ohne früheres Treffen: erledigt der letzten 14 Tage", () => {
    const { db, anna } = setup();
    const b = buildBriefing(db, { kind: "person", id: anna.id }, today);
    expect(b.doneSinceDate).toBe("2026-10-01");
    expect(b.doneSince.map((t) => t.title)).toEqual(["Erledigt neu"]);
  });
  it("Firma: alle Delegierten unter „weitere“", () => {
    const { db, haz } = setup();
    const b = buildBriefing(db, { kind: "company", id: haz.id }, today);
    expect(b.delegatedToPerson).toEqual([]);
    expect(b.otherTasks.map((t) => t.title).sort()).toEqual(["Anna blockiert", "Anna offen", "Max bei HAZ"]);
  });
  it("Agenda als Checkliste", () => {
    const { db, anna } = setup();
    const text = agendaText(buildBriefing(db, { kind: "person", id: anna.id }, today), () => "Max Muster");
    expect(text).toContain("## Offen bei Anna Beispiel\n- [ ] Anna blockiert (blockiert: x)");
    expect(text).toContain("- [ ] Max bei HAZ (Max Muster)");
    expect(text).not.toContain("erledigt");
  });
});

describe("milestones", () => {
  const today = "2026-10-15";
  const C = (status: MilestoneStatus["status"], target_date: string | null = null) => ({ status, target_date });
  it("Ampel-Vorschlag: verzögert/überfällig → Rot, kritisch → Gelb, sonst Grün", () => {
    expect(suggestTraffic([C("on_track"), C("delayed"), C("at_risk")], today)).toEqual({ light: "red", reason: "1 verzögert, 1 kritisch" });
    expect(suggestTraffic([C("on_track", "2026-10-01")], today)?.light).toBe("red");
    expect(suggestTraffic([C("at_risk"), C("done")], today)).toEqual({ light: "yellow", reason: "1 kritisch" });
    expect(suggestTraffic([C("done"), C("on_track")], today)?.light).toBe("green");
    expect(suggestTraffic([C("n_a")], today)).toBeNull();
  });
  it("Fortschritt ohne „nicht relevant“", () => {
    expect(progress([C("done"), C("n_a"), C("on_track")], 13)).toEqual({ done: 1, total: 12 });
  });
  it("überfällig nur, wenn nicht abgeschlossen", () => {
    expect(isOverdue(C("on_track", "2026-10-01"), today)).toBe(true);
    expect(isOverdue(C("done", "2026-10-01"), today)).toBe(false);
  });
});
