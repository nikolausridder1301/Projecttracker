import { describe, expect, it } from "vitest";
import { demoSeed } from "../data/seed";
import type { MilestoneStatus, Task, VendorItem } from "../data/types";
import { addWorkdays, endOfWeek, formatDate, relativeLabel } from "./dates";
import { copyProjectMasterData, suggestShort } from "./projects";
import { moveItem, orderNav } from "./nav";
import { agendaText, buildBriefing, sectionTitles } from "./briefing";
import { isOverdue, progress, suggestTraffic } from "./milestones";
import { search } from "./search";
import { sinceLabel, validateTrafficChange } from "./traffic";
import { affectsCompany, ageLabel, isOpenItem, jourFixeText, newVendorItem, showTicket, statusPatch } from "./vendor";
import { localDate } from "./dates";
import { listIndent, listNewline, parseBlocks, parseInline } from "./markdown";
import {
  compareTasks,
  checklistProgress,
  personRefs,
  personsOf,
  effectiveDue,
  taskCounts,
  isValidUrl,
  splitDone,
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
  company_ids: ["c1"],
  topic_id: null,
  assignee_person_ids: [],
  status: "open",
  blocked_reason: "",
  priority: "medium",
  due_date: null,
  follow_up_date: null,
  done_at: null,
  checklist: [],
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
    T({ title: "delegiert heute", assignee_person_ids: ["p1"], follow_up_date: today, due_date: today }),
    T({ title: "delegiert später", assignee_person_ids: ["p1"], follow_up_date: "2026-10-20" }),
    T({ title: "delegiert überfällig", assignee_person_ids: ["p1"], due_date: "2026-10-01" }),
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
    contact_person_ids: [],
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
    expect(text).toContain("- Schnittstelle (Angefragt · Alle Firmen · Wichtig");
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

describe("Nächste Schritte", () => {
  const today = "2026-10-15";
  it("fälliger Schritt bringt die Aufgabe auf Heute", () => {
    const v = todayView(
      [
        T({ title: "Schritt überfällig", checklist: [{ text: "s", done: false, due: "2026-10-12" }] }),
        T({ title: "Schritt erledigt", checklist: [{ text: "s", done: true, due: "2026-10-12" }] }),
        T({ title: "Frist später, Schritt heute", due_date: "2026-11-01", checklist: [{ text: "s", done: false, due: today }] }),
      ],
      today,
    );
    expect(v.overdue.map((t) => t.title)).toEqual(["Schritt überfällig"]);
    expect(v.today.map((t) => t.title)).toEqual(["Frist später, Schritt heute"]);
    expect(effectiveDue(T({ due_date: null, checklist: [] }))).toBeNull();
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
      T({ title: "Anna offen", company_ids: [haz.id], assignee_person_ids: [anna.id] }),
      T({ title: "Anna blockiert", company_ids: [haz.id], assignee_person_ids: [anna.id], status: "blocked", blocked_reason: "x" }),
      T({ title: "Meins HAZ", company_ids: [haz.id] }),
      T({ title: "Max bei HAZ", company_ids: [haz.id], assignee_person_ids: [max.id] }),
      T({ title: "Meins FEST", company_ids: [fest.id] }),
      T({ title: "Anna und Max", company_ids: [fest.id], assignee_person_ids: [max.id, anna.id] }),
      T({ title: "Schritt für Anna", company_ids: [fest.id], checklist: [{ text: "Termin klären", done: false, person_id: anna.id }] }),
      T({ title: "Erledigt neu", company_ids: [haz.id], status: "done", done_at: "2026-10-14T10:00:00Z" }),
      T({ title: "Erledigt alt", company_ids: [haz.id], status: "done", done_at: "2026-09-01T10:00:00Z" }),
    ];
    return { db, haz, anna };
  };

  it("Person: delegiert an sie, meine + weitere Punkte ihrer Firma", () => {
    const { db, anna } = setup();
    const b = buildBriefing(db, { kind: "person", id: anna.id }, today);
    expect(b.company?.short).toBe("HAZ");
    expect(b.delegatedToPerson.map((t) => t.title)).toEqual(["Anna blockiert", "Anna offen", "Anna und Max", "Schritt für Anna"]);
    expect(b.myTasks.map((t) => t.title)).toEqual(["Meins HAZ"]);
    expect(b.otherTasks.map((t) => t.title)).toEqual(["Max bei HAZ"]);
  });
  it("Firma: erledigte Aufgaben, neueste zuerst", () => {
    const { db, haz } = setup();
    const b = buildBriefing(db, { kind: "company", id: haz.id }, today);
    expect(b.doneTasks.map((t) => t.title)).toEqual(["Erledigt neu", "Erledigt alt"]);
  });
  it("Person: Erledigte nur ihre eigenen, Kontakte nur bei Firmen", () => {
    const { db, anna, haz } = setup();
    expect(buildBriefing(db, { kind: "person", id: anna.id }, today).doneTasks).toEqual([]);
    expect(buildBriefing(db, { kind: "company", id: haz.id }, today).contacts.map((p) => p.name)).toEqual(["Anna Beispiel"]);
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
    expect(text).toContain("## Offen bei Anna\n- [ ] Anna blockiert (blockiert: x)");
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

describe("Überarbeitung: Fälligkeit, Personen, Anbieter-Punkte", () => {
  const today = "2026-10-15";
  it("Sortierung nutzt den nächsten Termin (auch aus Schritten)", () => {
    const a = T({ title: "a", due_date: "2026-10-30" });
    const b = T({ title: "b", checklist: [{ text: "s", done: false, due: "2026-10-12" }] });
    const c = T({ title: "c" });
    expect([a, c, b].sort(compareTasks).map((t) => t.title)).toEqual(["b", "a", "c"]);
  });
  it("personsOf: Verantwortliche und offene Schritte, ohne Doppelte, ohne erledigte Schritte", () => {
    const t = T({
      assignee_person_ids: ["p1"],
      checklist: [
        { text: "x", done: false, person_ids: ["p2", "p1"] },
        { text: "y", done: true, person_ids: ["p3"] },
        { text: "z", done: false, person_id: "p4" },
      ],
    });
    expect(personsOf(t).sort()).toEqual(["p1", "p2", "p4"]);
  });
  it("personRefs: offen nur bei offenen Aufgaben, „irgendwo“ auch Protokolle und Anbieter-Punkte", () => {
    const db = {
      tasks: [T({ status: "done", assignee_person_ids: ["p1"] }), T({ checklist: [{ text: "s", done: false, person_ids: ["p2"] }] })],
      notes: [{ participant_ids: ["p3"], deleted_at: null }],
      vendor_items: [{ contact_person_ids: ["p4"] }],
    };
    expect(personRefs(db, "p1")).toEqual({ open: 0, any: true });
    expect(personRefs(db, "p2")).toEqual({ open: 1, any: true });
    expect(personRefs(db, "p3").any).toBe(true);
    expect(personRefs(db, "p4").any).toBe(true);
    expect(personRefs(db, "p5")).toEqual({ open: 0, any: false });
  });
  it("localDate: UTC-Zeitstempel → lokaler Kalendertag, reine Daten bleiben", () => {
    expect(localDate("2026-10-15")).toBe("2026-10-15");
    const d = new Date(2026, 9, 16, 0, 30); // 16.10. 00:30 Ortszeit
    expect(localDate(d.toISOString())).toBe("2026-10-16");
  });
  it("Briefing: Anbieter-Punkte je nach Person/Firma, heutiges Protokoll, gleiche Überschriften", () => {
    const db = demoSeed();
    const haz = db.companies.find((c) => c.short === "HAZ")!;
    const tac = db.companies.find((c) => c.is_external)!;
    const anna = db.people.find((p) => p.name === "Anna Beispiel")!; // HAZ
    const V = (o: Partial<VendorItem>): VendorItem => ({ ...newVendorItem("feature", "x", []), id: crypto.randomUUID(), created_at: "", updated_at: "", deleted_at: null, project_id: db.projects[0].id, ...o }) as VendorItem;
    db.vendor_items = [
      V({ title: "Alle Firmen" }),
      V({ title: "Nur HAZ", company_ids: [haz.id] }),
      V({ title: "Anna Ansprechpartnerin", contact_person_ids: [anna.id] }),
    ];
    const pA = buildBriefing(db, { kind: "person", id: anna.id }, today);
    expect(pA.vendorItems.map((v) => v.title).sort()).toEqual(["Anna Ansprechpartnerin", "Nur HAZ"]);
    expect(buildBriefing(db, { kind: "company", id: haz.id }, today).vendorItems.map((v) => v.title).sort()).toEqual(["Alle Firmen", "Anna Ansprechpartnerin", "Nur HAZ"]);
    expect(buildBriefing(db, { kind: "company", id: tac.id }, today).vendorItems).toHaveLength(3);
    db.notes = [
      { id: "n1", created_at: "", updated_at: "", deleted_at: null, project_id: db.projects[0].id, title: "Meeting Anna", body: "", kind: "meeting", company_ids: [haz.id], topic_id: null, meeting_date: today, participant_ids: [anna.id], participants_text: "" },
    ];
    expect(buildBriefing(db, { kind: "person", id: anna.id }, today).todayMeeting?.id).toBe("n1");
    expect(buildBriefing(db, { kind: "person", id: anna.id }, "2026-10-16").todayMeeting).toBeUndefined();
    expect(sectionTitles({ person: anna }).delegated).toBe("Offen bei Anna");
    expect(sectionTitles({}).other).toBe("Delegiert");
  });
});

describe("Schritte & Meilensteine", () => {
  const M = (text: string, done = false) => ({ text, done, milestone: true });
  const S = (text: string, done = false, due: string | null = null) => ({ text, done, due });
  it("Hinweis für Listen: Meilensteine und offene Schritte; Fortschritt zählt nur Schritte", () => {
    const t = T({ checklist: [M("M1", true), S("x", true), M("M2"), S("y"), S("z")] });
    expect(taskCounts(t)).toBe("2 Meilensteine · 2 offene Schritte");
    expect(taskCounts(T({ checklist: [M("M"), S("a")] }))).toBe("1 Meilenstein · 1 offener Schritt");
    expect(taskCounts(T({ checklist: [S("a", true)] }))).toBe("");
    expect(checklistProgress(t)).toEqual({ done: 1, total: 3 });
  });
  it("nächster Termin: Aufgabe und offene Schritte; Meilensteine haben kein Datum", () => {
    const t = T({ due_date: "2026-11-01", checklist: [{ ...M("M"), due: "2026-10-01" }, S("a", true, "2026-10-02"), S("b", false, "2026-10-20")] });
    expect(effectiveDue(t)).toBe("2026-10-20");
  });
});

describe("Markdown", () => {
  it("Absätze und Aufzählungen", () => {
    expect(parseBlocks("Zeile 1\nZeile 2\n\n- a\n- b\n  - c\n1. x\n2. y")).toEqual([
      { kind: "para", lines: ["Zeile 1", "Zeile 2"] },
      { kind: "list", ordered: false, items: [{ text: "a", level: 0 }, { text: "b", level: 0 }, { text: "c", level: 1 }] },
      { kind: "list", ordered: true, items: [{ text: "x", level: 0 }, { text: "y", level: 0 }] },
    ]);
  });
  it("fett, kursiv, Code, Links", () => {
    expect(parseInline("**FEE** prüft *bald* `Export` https://x.de/a.")).toEqual([
      { kind: "bold", text: "FEE" },
      { kind: "text", text: " prüft " },
      { kind: "italic", text: "bald" },
      { kind: "text", text: " " },
      { kind: "code", text: "Export" },
      { kind: "text", text: " " },
      { kind: "link", text: "x.de/a", href: "https://x.de/a" },
      { kind: "text", text: "." },
    ]);
  });
  it("Enter in Aufzählung setzt nächsten Punkt, leerer Punkt beendet; Tab rückt ein", () => {
    expect(listNewline("- a", 3)).toEqual({ value: "- a\n- ", caret: 6 });
    expect(listNewline("  * a", 5)).toEqual({ value: "  * a\n  * ", caret: 10 });
    expect(listNewline("1. a", 4)).toEqual({ value: "1. a\n2. ", caret: 8 });
    expect(listNewline("- a\n- ", 6)).toEqual({ value: "- a\n", caret: 4 });
    expect(listNewline("Text", 4)).toBeNull();
    expect(listIndent("- a", 3, false)).toEqual({ value: "  - a", caret: 5 });
    expect(listIndent("  - a", 5, true)).toEqual({ value: "- a", caret: 3 });
    expect(listIndent("Text", 2, false)).toBeNull();
  });
});
