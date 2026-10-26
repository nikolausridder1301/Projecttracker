// KI-Auswertung von Protokollen, Transkripten und E-Mails über Langdock (EU, Anthropic-kompatibel).
// Liefert nur VORSCHLÄGE – angelegt wird erst, wenn Nikolaus sie in der App bestätigt.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   LANGDOCK_API_KEY  – API-Schlüssel aus Langdock (Completion-API)
//   LANGDOCK_MODEL    – optional, Standard „claude-sonnet-4-6-default“
//   LANGDOCK_REGION   – optional, Standard „eu“
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

  const key = Deno.env.get("LANGDOCK_API_KEY");
  if (!key) return json({ error: "KI ist noch nicht eingerichtet (LANGDOCK_API_KEY fehlt in Supabase)." }, 503);
  const model = Deno.env.get("LANGDOCK_MODEL") ?? "claude-sonnet-4-6-default";
  const region = Deno.env.get("LANGDOCK_REGION") ?? "eu";

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

  const res = await fetch(`https://api.langdock.com/anthropic/${region}/v1/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system,
      tools: [{ name: "vorschlaege", description: "Vorschläge für den Projekttracker", input_schema: SCHEMA }],
      tool_choice: { type: "tool", name: "vorschlaege" },
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    return json({ error: `KI-Dienst antwortet mit ${res.status}`, detail }, 502);
  }
  const data = await res.json();
  const block = (data.content ?? []).find((c: { type: string }) => c.type === "tool_use");
  if (!block) return json({ error: "Keine Vorschläge erhalten" }, 502);
  return json({ proposal: block.input });
});
