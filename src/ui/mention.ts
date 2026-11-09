import Mention from "@tiptap/extension-mention";
import { mergeAttributes } from "@tiptap/react";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";

// @-Erwähnung von Kontakten im Notiztext.
// Gespeichert als Markdown-Link „[@Name](#/personen/<id>)“ – beim Laden wird daraus wieder eine Erwähnung.

export interface MentionPerson {
  id: string;
  name: string;
  company: string;
}

export const personHref = (id: string) => `#/personen/${id}`;
const PERSON_LINK = /^#\/personen\/([\w-]+)$/;

const norm = (t: string) => t.toLocaleLowerCase("de").normalize("NFKD").replace(/[̀-ͯ]/g, "");

/** Kleines Auswahlmenü unter dem Cursor – ohne zusätzliche Bibliothek. */
function suggestionMenu() {
  let el: HTMLDivElement | null = null;
  let items: MentionPerson[] = [];
  let index = 0;
  let command: ((p: { id: string; label: string }) => void) | null = null;

  const pick = (p: MentionPerson | undefined) => p && command?.({ id: p.id, label: p.name });
  const draw = () => {
    if (!el) return;
    el.replaceChildren();
    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "mention-empty";
      empty.textContent = "Kein Kontakt gefunden";
      el.appendChild(empty);
      return;
    }
    items.forEach((p, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `mention-item${i === index ? " active" : ""}`;
      b.textContent = p.company ? `${p.name} · ${p.company}` : p.name;
      b.onmousedown = (e) => {
        e.preventDefault();
        pick(p);
      };
      el!.appendChild(b);
    });
  };
  const place = (rect: SuggestionProps["clientRect"]) => {
    const r = rect?.();
    if (!el || !r) return;
    el.style.left = `${Math.min(r.left, window.innerWidth - 280)}px`;
    el.style.top = `${r.bottom + 4}px`;
  };
  const sync = (props: SuggestionProps<MentionPerson>) => {
    items = props.items;
    command = props.command as typeof command;
    index = 0;
    draw();
    place(props.clientRect);
  };

  return {
    onStart: (props: SuggestionProps<MentionPerson>) => {
      el = document.createElement("div");
      el.className = "mention-menu";
      document.body.appendChild(el);
      sync(props);
    },
    onUpdate: sync,
    onKeyDown: ({ event }: SuggestionKeyDownProps) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (items.length) index = (index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
        draw();
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        if (!items.length) return false;
        pick(items[index]);
        return true;
      }
      if (event.key === "Escape") {
        // nur das Menü schließen, nicht das ganze Panel
        event.stopPropagation();
        el?.remove();
        el = null;
        return true;
      }
      return false;
    },
    onExit: () => {
      el?.remove();
      el = null;
    },
  };
}

/** Erwähnungs-Erweiterung; `people()` liefert die aktuelle Kontaktliste. */
export function personMention(people: () => MentionPerson[]) {
  return Mention.extend({
    // Speichern als Markdown-Link, Laden: Link zur Person → Erwähnung
    addStorage() {
      return {
        markdown: {
          serialize(state: { write: (s: string) => void }, node: { attrs: { id: string; label: string } }) {
            state.write(`[@${node.attrs.label.replace(/[[\]]/g, "")}](${personHref(node.attrs.id)})`);
          },
          parse: {
            updateDOM(element: HTMLElement) {
              element.querySelectorAll("a[href]").forEach((a) => {
                const m = PERSON_LINK.exec(a.getAttribute("href") ?? "");
                if (!m) return;
                const span = document.createElement("span");
                span.setAttribute("data-type", "mention");
                span.setAttribute("data-id", m[1]);
                span.setAttribute("data-label", (a.textContent ?? "").replace(/^@/, ""));
                a.replaceWith(span);
              });
            },
          },
        },
      };
    },
  }).configure({
    HTMLAttributes: { class: "mention" },
    renderHTML: ({ options, node }) => [
      "a",
      mergeAttributes({ href: personHref(node.attrs.id), title: "Zum Kontakt" }, options.HTMLAttributes),
      `@${node.attrs.label}`,
    ],
    suggestion: {
      char: "@",
      items: ({ query }) => {
        const q = norm(query);
        return people()
          .filter((p) => norm(p.name).includes(q))
          .slice(0, 8);
      },
      render: suggestionMenu,
    },
  });
}
