// Schlankes Markdown für Schritte, Meilensteine und Notizen: Aufzählungen
// („- “, „* “, „1. “), Absätze/Zeilenumbrüche, **fett**, *kursiv*, `Code`, Links.
// Bewusst klein gehalten – kein HTML, nichts wird ungeprüft ausgegeben.

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string };

export type Block =
  | { kind: "para"; lines: string[] }
  | { kind: "list"; ordered: boolean; items: { text: string; level: number }[] };

const BULLET = /^(\s*)([-*•])\s+(.*)$/;
const NUMBER = /^(\s*)(\d+)[.)]\s+(.*)$/;

/** Text in Absätze und Listen gliedern. */
export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const b = BULLET.exec(raw);
    const n = b ? null : NUMBER.exec(raw);
    const m = b ?? n;
    if (m) {
      const ordered = !!n;
      const level = Math.min(3, Math.floor(m[1].replace(/\t/g, "  ").length / 2));
      const last = blocks[blocks.length - 1];
      if (last?.kind === "list" && last.ordered === ordered) last.items.push({ text: m[3], level });
      else blocks.push({ kind: "list", ordered, items: [{ text: m[3], level }] });
    } else if (raw.trim() === "") {
      blocks.push({ kind: "para", lines: [] });
    } else {
      const last = blocks[blocks.length - 1];
      if (last?.kind === "para" && last.lines.length > 0) last.lines.push(raw);
      else blocks.push({ kind: "para", lines: [raw] });
    }
  }
  return blocks.filter((b) => b.kind === "list" || b.lines.length > 0);
}

/** **fett**, *kursiv* bzw. _kursiv_, `Code` und http(s)-Links erkennen. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_|https?:\/\/[^\s<>()"']+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ kind: "text", text: text.slice(last, m.index) });
    if (m[2] !== undefined) out.push({ kind: "bold", text: m[2] });
    else if (m[3] !== undefined) out.push({ kind: "code", text: m[3] });
    else if (m[4] !== undefined) out.push({ kind: "italic", text: m[4] });
    else if (m[5] !== undefined) out.push({ kind: "italic", text: m[5] });
    else {
      const href = m[0].replace(/[.,;:!?]+$/, "");
      out.push({ kind: "link", text: href.replace(/^https?:\/\//, ""), href });
      if (href.length < m[0].length) out.push({ kind: "text", text: m[0].slice(href.length) });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

/** Erste Zeile ohne Markdown-Zeichen – für einzeilige Anzeigen in Listen. */
export function firstLine(text: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const line = (lines[0] ?? "").replace(BULLET, "$3").replace(NUMBER, "$3");
  const plain = parseInline(line)
    .map((t) => t.text)
    .join("");
  return lines.length > 1 ? `${plain} …` : plain;
}

export interface Edit {
  value: string;
  caret: number;
}

const lineAt = (value: string, caret: number) => {
  const start = value.lastIndexOf("\n", caret - 1) + 1;
  const endIdx = value.indexOf("\n", caret);
  const end = endIdx === -1 ? value.length : endIdx;
  return { start, end, line: value.slice(start, end) };
};

/**
 * Neue Zeile in einer Aufzählung: nächsten Punkt mit gleichem Einzug beginnen;
 * ein leerer Punkt beendet die Aufzählung. `null` = keine Aufzählung (normale neue Zeile).
 */
export function listNewline(value: string, caret: number): Edit | null {
  const { start, end, line } = lineAt(value, caret);
  const b = BULLET.exec(line);
  const n = b ? null : NUMBER.exec(line);
  const m = b ?? n;
  if (!m) return null;
  if (m[3].trim() === "") {
    // leerer Punkt → Marker entfernen, Aufzählung endet
    const next = value.slice(0, start) + value.slice(end);
    return { value: next, caret: start };
  }
  const marker = b ? `${m[2]} ` : `${Number(m[2]) + 1}. `;
  const insert = `\n${m[1]}${marker}`;
  return { value: value.slice(0, caret) + insert + value.slice(caret), caret: caret + insert.length };
}

/** Tab in einer Aufzählung: Punkt ein- bzw. (mit Umschalt) ausrücken. `null` = keine Aufzählung. */
export function listIndent(value: string, caret: number, outdent: boolean): Edit | null {
  const { start, line } = lineAt(value, caret);
  if (!BULLET.test(line) && !NUMBER.test(line)) return null;
  if (outdent) {
    const remove = line.startsWith("  ") ? 2 : line.startsWith(" ") ? 1 : 0;
    if (!remove) return { value, caret };
    return { value: value.slice(0, start) + value.slice(start + remove), caret: Math.max(start, caret - remove) };
  }
  return { value: value.slice(0, start) + "  " + value.slice(start), caret: caret + 2 };
}
