import { describe, expect, it } from "vitest";
import { vttToText } from "./extract";
import { sanitizeProposal, type AnalyzeContext } from "./proposal";

const ctx: AnalyzeContext = {
  me: { id: "me", name: "Nikolaus Ridder" },
  companies: [{ id: "c1", name: "FEST", short: "FEST" }],
  people: [
    { id: "p1", name: "Arman Gall", company: "FEST", role: "" },
    { id: "me", name: "Nikolaus Ridder", company: "SK", role: "" },
  ],
  open_tasks: [{ id: "t1", title: "Schnittstelle", companies: ["FEST"] }],
  focus: { person_id: null, company_id: "c1" },
};

describe("Teams-Transkript", () => {
  it("entfernt Zeitstempel und fasst Sprecher zusammen", () => {
    const vtt = "WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000\n<v Arman Gall>Ich kläre den Export.</v>\n\n2\n00:00:03.000 --> 00:00:05.000\n<v Arman Gall>Bis Freitag.</v>\n\n3\n00:00:05.000 --> 00:00:07.000\n<v Nikolaus Ridder>Danke.</v>";
    expect(vttToText(vtt)).toBe("Arman Gall: Ich kläre den Export. Bis Freitag.\nNikolaus Ridder: Danke.");
  });
});

describe("KI-Vorschläge absichern", () => {
  it("nur bekannte IDs, gültige Daten, ich nicht als andere Person, Schritte nur zu offenen Aufgaben", () => {
    const p = sanitizeProposal(
      {
        note: { title: "Jour fixe", kind: "meeting", summary: "- A", meeting_date: "2026-10-26", company_ids: ["c1", "x"], participant_ids: ["p1", "zz"] },
        decisions: [{ title: "Export per API", body: "", company_ids: [], quote: "q" }, { title: "" }],
        tasks: [{ title: "Freigabe einholen", company_ids: ["c1"], assignee_person_ids: ["p1", "me", "x"], due_date: "Freitag", steps: ["a", ""], quote: "" }],
        steps: [
          { task_id: "t1", text: "Termin klären", person_ids: ["p1"], due: "2026-10-30", quote: "" },
          { task_id: "unbekannt", text: "x", person_ids: [], due: null, quote: "" },
        ],
      },
      ctx,
    );
    expect(p.note?.company_ids).toEqual(["c1"]);
    expect(p.note?.participant_ids).toEqual(["p1"]);
    expect(p.decisions).toHaveLength(1);
    expect(p.decisions[0].company_ids).toEqual(["c1"]); // Vorauswahl der Meeting-Seite
    expect(p.tasks[0].assignee_person_ids).toEqual(["p1"]);
    expect(p.tasks[0].due_date).toBeNull();
    expect(p.tasks[0].steps).toEqual(["a"]);
    expect(p.steps.map((s) => s.task_id)).toEqual(["t1"]);
  });
  it("leere oder kaputte Antwort ergibt keine Vorschläge", () => {
    expect(sanitizeProposal(null, ctx)).toEqual({ note: null, decisions: [], tasks: [], steps: [] });
  });
});
