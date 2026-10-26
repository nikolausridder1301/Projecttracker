// Text aus hochgeladenen Dateien lesen – alles im Browser, nichts wird gespeichert.
// Word (.docx), PDF, Teams-Transkript (.vtt), Text/Markdown, E-Mail (.eml, Outlook .msg).
// Die Bibliotheken werden erst bei Bedarf geladen, damit die App schlank bleibt.

export const ACCEPTED_FILES = ".docx,.pdf,.vtt,.txt,.md,.eml,.msg";

export interface Extracted {
  name: string;
  text: string;
}

/** Teams-Transkript: Zeitstempel und Kopfzeilen weg, „<v Name>Text“ → „Name: Text“. */
export function vttToText(vtt: string): string {
  const out: string[] = [];
  for (const raw of vtt.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line || line === "WEBVTT" || /^\d+$/.test(line) || line.includes("-->") || /^NOTE\b/.test(line)) continue;
    const m = /^<v\s+([^>]+)>(.*?)(<\/v>)?$/.exec(line);
    const text = (m ? `${m[1].trim()}: ${m[2]}` : line).replace(/<[^>]+>/g, "").trim();
    // Teams wiederholt Sprecher oft – aufeinanderfolgende Zeilen derselben Person zusammenfassen
    const prev = out[out.length - 1];
    const who = text.split(":")[0];
    if (m && prev?.startsWith(`${who}:`)) out[out.length - 1] = `${prev} ${text.slice(who.length + 1).trim()}`;
    else out.push(text);
  }
  return out.join("\n");
}

const header = (from: string, to: string, date: string, subject: string) =>
  [`Von: ${from}`, `An: ${to}`, date && `Datum: ${date}`, `Betreff: ${subject}`].filter(Boolean).join("\n");

export async function extractText(file: File): Promise<Extracted> {
  const name = file.name;
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "vtt") return { name, text: vttToText(await file.text()) };
  if (ext === "txt" || ext === "md") return { name, text: await file.text() };

  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return { name, text: value };
  }

  if (ext === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      pages.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
    }
    return { name, text: pages.join("\n\n") };
  }

  if (ext === "eml") {
    const { default: PostalMime } = await import("postal-mime");
    const mail = await PostalMime.parse(await file.arrayBuffer());
    const addr = (a?: { name?: string; address?: string }) => (a ? `${a.name ?? ""} <${a.address ?? ""}>`.trim() : "");
    const body = mail.text || (mail.html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    return { name, text: `${header(addr(mail.from), (mail.to ?? []).map(addr).join(", "), mail.date ?? "", mail.subject ?? "")}\n\n${body}` };
  }

  if (ext === "msg") {
    const { default: MsgReader } = await import("@kenjiuno/msgreader");
    const info = new MsgReader(await file.arrayBuffer()).getFileData();
    const to = (info.recipients ?? []).map((r) => `${r.name ?? ""} <${r.smtpAddress ?? r.email ?? ""}>`).join(", ");
    return {
      name,
      text: `${header(`${info.senderName ?? ""} <${info.senderSmtpAddress ?? info.senderEmail ?? ""}>`, to, info.messageDeliveryTime ?? "", info.subject ?? "")}\n\n${info.body ?? ""}`,
    };
  }

  throw new Error(`„${name}“: Dateityp wird nicht unterstützt (erlaubt: ${ACCEPTED_FILES}).`);
}
