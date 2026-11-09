import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading2, Italic, List, ListOrdered, Strikethrough } from "lucide-react";
import { useEffect, type MutableRefObject, type ReactNode } from "react";
import { Markdown } from "tiptap-markdown";

// Formatierbarer Text für Notizen: Fett, Kursiv, Aufzählungen usw. – sichtbar formatiert,
// gespeichert wird weiterhin Markdown (so bleiben bestehende Notizen und die KI-Zusammenfassungen gültig).

export interface RichTextHandle {
  focus: () => void;
}

const markdownOf = (editor: Editor): string => (editor.storage as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown();

export function RichText({
  value,
  onChange,
  onBlur,
  placeholder,
  handleRef,
}: {
  value: string;
  onChange: (markdown: string) => void;
  onBlur?: (markdown: string) => void;
  placeholder?: string;
  handleRef?: MutableRefObject<RichTextHandle | null>;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, codeBlock: false }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      Markdown.configure({ html: false, tightLists: true, bulletListMarker: "-", breaks: true, transformPastedText: true }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(markdownOf(editor)),
    onBlur: ({ editor }) => onBlur?.(markdownOf(editor)),
  });

  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = { focus: () => editor?.commands.focus("end") };
    return () => {
      handleRef.current = null;
    };
  }, [editor, handleRef]);

  if (!editor) return null;
  const tool = (label: string, icon: ReactNode, active: boolean, run: () => void) => (
    <button
      type="button"
      className={`rich-tool${active ? " active" : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      // Fokus im Text behalten
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      {icon}
    </button>
  );
  const chain = () => editor.chain().focus();

  return (
    <div className="rich">
      <div className="rich-toolbar">
        {tool("Fett (Strg+B)", <Bold size={15} />, editor.isActive("bold"), () => chain().toggleBold().run())}
        {tool("Kursiv (Strg+I)", <Italic size={15} />, editor.isActive("italic"), () => chain().toggleItalic().run())}
        {tool("Durchgestrichen", <Strikethrough size={15} />, editor.isActive("strike"), () => chain().toggleStrike().run())}
        <span className="rich-sep" />
        {tool("Überschrift", <Heading2 size={15} />, editor.isActive("heading", { level: 2 }), () => chain().toggleHeading({ level: 2 }).run())}
        {tool("Aufzählung", <List size={15} />, editor.isActive("bulletList"), () => chain().toggleBulletList().run())}
        {tool("Nummerierte Liste", <ListOrdered size={15} />, editor.isActive("orderedList"), () => chain().toggleOrderedList().run())}
      </div>
      <EditorContent editor={editor} className="rich-body" />
    </div>
  );
}
