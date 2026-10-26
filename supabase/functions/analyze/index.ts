// KI-Auswertung von Protokollen, Transkripten und E-Mails – über Langdock (EU), sonst Gemini oder Claude.
// Liefert nur VORSCHLÄGE – angelegt wird erst, wenn Nikolaus sie in der App bestätigt.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   LANGDOCK_API_KEY  – Schlüssel aus Langdock (nur „Completion API“) – hat Vorrang, EU-Hosting
//   LANGDOCK_MODEL    – optional, sonst das erste Claude-Sonnet-Modell aus Langdocks Modellliste
//   GEMINI_API_KEY    – Ersatz: Schlüssel aus aistudio.google.com
//   GEMINI_MODEL      – optional, Standard „gemini-3.5-flash-lite“ (schnell)
//   ANTHROPIC_API_KEY – alternativ: Schlüssel aus console.anthropic.com
//   ANTHROPIC_MODEL   – optional, Standard „claude-sonnet-5-5“
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const MAX_TEXT = 80_000;

const SCHEMA = {
  type: "object",
  properties: {
    note: {
      type: ["object", "null"],
      description: "Das Meeting bzw. die E-Mail als Notiz. null, wenn das Dokument nichts Protokollwürdiges enthält.",
      properties: {
        title: { type: "string", description: "Kurzer Titel, z. B. „Jour fixe FEST – Schnittstelle“" },
        kind: { type: "string", enum: ["meeting", "note"], description: "meeting = Besprechung/Transkript, note = E-Mail/sonstiges" },
        summary: { type: "string", description: "Sachliche Zusammenfassung auf Deutsch, Aufzählung mit „- “" },
        meeting_date: { type: ["string", "null"], description: "Datum JJJJ-MM-TT, falls erkennbar" },
        company_ids: { type: "array", items: { type: "string" } },
        participant_ids: { type: "array", items: { type: "string" } },
      },
      required: ["title", "kind", "summary", "meeting_date", "company_ids", "participant_ids"],
    },
    decisions: {
      type: "array",
      description: "Ausdrücklich getroffene Entscheidungen",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string", description: "Begründung/Kontext in 1–3 Sätzen" },
          company_ids: { type: "array", items: { type: "string" } },
          quote: { type: "string", description: "Kurze Stelle aus dem Dokument als Beleg" },
        },
        required: ["title", "body", "company_ids", "quote"],
      },
    },
    tasks: {
      type: "array",
      description: "Neue Aufgaben, die vereinbart wurden und noch nicht als offene Aufgabe existieren",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          company_ids: { type: "array", items: { type: "string" } },
          assignee_person_ids: { type: "array", items: { type: "string" }, description: "Leer = ich (Nikolaus)" },
          due_date: { type: ["string", "null"] },
          steps: { type: "array", items: { type: "string" }, description: "Optionale erste Schritte" },
          quote: { type: "string" },
        },
        required: ["title", "company_ids", "assignee_person_ids", "due_date", "steps", "quote"],
      },
    },
    steps: {
      type: "array",
      description: "Neue Schritte zu BESTEHENDEN offenen Aufgaben (task_id aus dem Kontext)",
      items: {
        type: "object",
        properties: {
          task_id: { type: "string" },
          text: { type: "string" },
          person_ids: { type: "array", items: { type: "string" } },
          due: { type: ["string", "null"] },
          quote: { type: "string" },
        },
        required: ["task_id", "text", "person_ids", "due", "quote"],
      },
    },
  },
  required: ["note", "decisions", "tasks", "steps"],
};

/** JSON-Schema → Gemini-Schema: „type: [x, null]“ wird zu „type: X, nullable: true“. */
// deno-lint-ignore no-explicit-any
function toGemini(schema: any): any {
  if (Array.isArray(schema)) return schema.map(toGemini);
  if (!schema || typeof schema !== "object") return schema;
  // deno-lint-ignore no-explicit-any
  const out: any = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === "type") {
      const types = (Array.isArray(v) ? v : [v]) as string[];
      out.type = (types.find((t) => t !== "null") ?? "string").toUpperCase();
      if (types.includes("null")) out.nullable = true;
    } else if (k === "enum" || k === "required") {
      out[k] = v;
    } else {
      out[k] = typeof v === "object" ? toGemini(v) : v;
    }
  }
  return out;
}

/**
 * Gemini-Modelle der Reihe nach. Jeder Versuch hat ein eigenes Zeitlimit, damit die Funktion
 * nicht an Supabases Grenze (150 s) scheitert: hängt ein Modell oder ist es überlastet, kommt das nächste.
 */
async function askGemini(key: string, system: string, user: string): Promise<unknown> {
  // Gemini 2.5 ist für neue Nutzer abgeschaltet – aktuelle Gratis-Modelle, das schnellste zuerst
  const models = [Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3.8-flash"];
  const busy = (status: number) => status === 503 || status === 429 || status === 500;
  const deadline = Date.now() + 135_000;
  let last = "";
  for (const model of [...new Set(models)]) {
    const left = deadline - Date.now();
    if (left < 10_000) break;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.min(60_000, left));
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
            responseSchema: toGemini(SCHEMA),
            // Wenig „Nachdenken“ – sonst dauert die Antwort zu lange; für Auszüge reicht das
            thinkingConfig: { thinkingLevel: "low" },
          },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = (data.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
        if (!text) throw new Error("Keine Vorschläge erhalten");
        return JSON.parse(text);
      }
      last = `${model} antwortet mit ${res.status}: ${(await res.text()).slice(0, 200)}`;
      console.error(last);
      // Überlastet, unbekanntes Modell oder Einstellung nicht unterstützt (400): nächstes Modell; sonst abbrechen
      if (!busy(res.status) && res.status !== 404 && res.status !== 400) throw new Error(last);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        last = `${model} hat nicht rechtzeitig geantwortet`;
        console.error(last);
        continue;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Gemini ist gerade überlastet oder zu langsam – bitte in ein paar Minuten erneut versuchen. (${last})`);
}

/** Langdock (EU, Anthropic-kompatibel). Modell aus LANGDOCK_MODEL, sonst aus der Modellliste des Workspace. */
async function askLangdock(key: string, system: string, user: string): Promise<unknown> {
  const base = "https://api.langdock.com/anthropic/eu/v1";
  const auth = { Authorization: `Bearer ${key}` };
  let model = Deno.env.get("LANGDOCK_MODEL");
  if (!model) {
    const res = await fetch(`${base}/models`, { headers: auth });
    if (!res.ok) throw new Error(`Langdock-Modellliste antwortet mit ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const ids: string[] = ((await res.json()).data ?? []).map((m: { id: string }) => m.id);
    model = ids.find((id) => /sonnet/i.test(id)) ?? ids.find((id) => /claude/i.test(id)) ?? ids[0];
    if (!model) throw new Error("Langdock bietet kein passendes Modell an");
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const res = await fetch(`${base}/messages`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system,
        tools: [{ name: "vorschlaege", description: "Vorschläge für den Projekttracker", input_schema: SCHEMA }],
        tool_choice: { type: "tool", name: "vorschlaege" },
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Langdock (${model}) antwortet mit ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const block = (data.content ?? []).find((c: { type: string }) => c.type === "tool_use");
    if (!block) throw new Error("Keine Vorschläge erhalten");
    return block.input;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw new Error(`Langdock (${model}) hat nicht rechtzeitig geantwortet`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function askClaude(key: string, system: string, user: string): Promise<unknown> {
  const model = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system,
      tools: [{ name: "vorschlaege", description: "Vorschläge für den Projekttracker", input_schema: SCHEMA }],
      tool_choice: { type: "tool", name: "vorschlaege" },
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Claude antwortet mit ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const block = (data.content ?? []).find((c: { type: string }) => c.type === "tool_use");
  if (!block) throw new Error("Keine Vorschläge erhalten");
  return block.input;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Nur POST" }, 405);

  // Nur freigeschaltete Nutzer: Abfrage mit dem Token des Aufrufers, RLS entscheidet
  const auth = req.headers.get("Authorization") ?? "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: allowed, error: authError } = await supabase.from("projects").select("id").limit(1);
  if (authError || !allowed || allowed.length === 0) return json({ error: "Kein Zugriff" }, 403);

  const langdockKey = Deno.env.get("LANGDOCK_API_KEY");
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const claudeKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!langdockKey && !geminiKey && !claudeKey) return json({ error: "KI ist noch nicht eingerichtet (LANGDOCK_API_KEY fehlt in Supabase)." }, 503);

  let payload: { text?: string; context?: unknown; today?: string; files?: string[] };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Ungültige Anfrage" }, 400);
  }
  const text = (payload.text ?? "").slice(0, MAX_TEXT);
  if (!text.trim()) return json({ error: "Kein Text gefunden" }, 400);

  const system = [
    "Du unterstützt Nikolaus Ridder, Projektleiter für den Tacto-Rollout in der SK Group.",
    "Du liest Meeting-Protokolle, Teams-Transkripte und E-Mails und schlägst vor, was im Projekttracker festgehalten werden soll.",
    "Regeln:",
    "- Nur Vorschläge, die im Dokument wirklich stehen. Nichts erfinden, nichts verallgemeinern.",
    "- Aufgaben nur, wenn jemand etwas zu tun hat (vereinbart, zugesagt, gebeten). Keine Aufgaben aus bloßen Diskussionen.",
    "- Gehört etwas zu einer BESTEHENDEN offenen Aufgabe aus dem Kontext, schlage einen Schritt dazu vor statt einer neuen Aufgabe.",
    "- Entscheidungen nur, wenn sie ausdrücklich getroffen wurden.",
    "- Verwende ausschließlich IDs aus dem Kontext (Firmen, Personen, Aufgaben). Ist eine Person nicht im Kontext, lass die ID weg und nenne den Namen im Text.",
    "- Ist Nikolaus selbst verantwortlich, lass assignee_person_ids leer.",
    "- Daten als JJJJ-MM-TT; relative Angaben („bis Freitag“) vom heutigen Datum aus umrechnen.",
    "- Alles auf Deutsch, knapp und sachlich. Titel als Tätigkeit formulieren („Export-Freigabe bei FEE einholen“).",
    "- quote: eine kurze, wörtliche Stelle als Beleg (max. 200 Zeichen).",
  ].join("\n");

  const user = [
    `Heute ist ${payload.today ?? new Date().toISOString().slice(0, 10)}.`,
    `Dateien: ${(payload.files ?? []).join(", ") || "–"}`,
    "",
    "KONTEXT (JSON):",
    JSON.stringify(payload.context ?? {}),
    "",
    "DOKUMENT:",
    text,
  ].join("\n");

  try {
    // Bewusst kein Ausweichen von Langdock auf andere Dienste: die Daten sollen in der EU bleiben
    const proposal = langdockKey
      ? await askLangdock(langdockKey, system, user)
      : geminiKey
        ? await askGemini(geminiKey, system, user)
        : await askClaude(claudeKey!, system, user);
    return json({ proposal });
  } catch (e) {
    return json({ error: "KI-Auswertung fehlgeschlagen", detail: e instanceof Error ? e.message : String(e) }, 502);
  }
});
