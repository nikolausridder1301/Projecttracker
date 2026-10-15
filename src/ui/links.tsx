import { Link2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useLookups, useStore } from "../data/store";
import type { Id, Link } from "../data/types";
import { CompanyBadge } from "./common";

type Target = { taskId?: Id; noteId?: Id };

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function LinkRow({ link, actions }: { link: Link; actions?: React.ReactNode }) {
  const { categoryById, topicById } = useLookups();
  return (
    <div className="link-row">
      <Link2 size={18} className="row-icon" aria-hidden />
      <div className="link-main">
        <a href={link.url} target="_blank" rel="noopener noreferrer" className="link-title">
          {link.title}
        </a>
        <span className="task-meta">
          <CompanyBadge id={link.company_id} />
          {link.category_id && <span className="badge">{categoryById.get(link.category_id)?.name}</span>}
          {link.topic_id && <span className="muted">{topicById.get(link.topic_id)?.name}</span>}
          <span className="muted small">{hostOf(link.url)}</span>
        </span>
        {link.description && <span className="muted small">{link.description}</span>}
      </div>
      {actions}
    </div>
  );
}

/** Angehängte Links einer Aufgabe oder Notiz, inkl. "vorhandenen Link anhängen". */
export function AttachedLinks({ target }: { target: Target }) {
  const { db, insert, purge } = useStore();
  const { linkById } = useLookups();
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");

  const attached = db.attachments.filter(
    (a) =>
      a.deleted_at === null &&
      ((target.taskId && a.task_id === target.taskId) || (target.noteId && a.note_id === target.noteId)),
  );
  const attachedLinkIds = new Set(attached.map((a) => a.link_id));

  const candidates = useMemo(() => {
    const n = q.toLowerCase();
    return db.links
      .filter((l) => l.deleted_at === null && !attachedLinkIds.has(l.id))
      .filter((l) => !n || l.title.toLowerCase().includes(n) || l.url.toLowerCase().includes(n))
      .slice(0, 8);
  }, [db.links, q, attachedLinkIds]);

  const attach = (linkId: Id) =>
    void insert("attachments", [{ link_id: linkId, task_id: target.taskId ?? null, note_id: target.noteId ?? null }]).catch(
      () => {},
    );

  return (
    <div>
      {attached.map((a) => {
        const l = linkById.get(a.link_id);
        if (!l || l.deleted_at) return null;
        return (
          <LinkRow
            key={a.id}
            link={l}
            actions={
              <button className="icon-btn hover-only" title="Anhang lösen (Link bleibt in der Sammlung)" onClick={() => void purge("attachments", a.id)}>
                <X size={14} />
              </button>
            }
          />
        );
      })}
      {picking ? (
        <div className="picker">
          <input autoFocus placeholder="Vorhandenen Link suchen…" value={q} onChange={(e) => setQ(e.target.value)} />
          {candidates.map((l) => (
            <button key={l.id} className="picker-item" onClick={() => attach(l.id)}>
              {l.title} <span className="muted small">{hostOf(l.url)}</span>
            </button>
          ))}
          {candidates.length === 0 && <div className="muted small">Keine passenden Links.</div>}
          <button className="btn ghost small" onClick={() => setPicking(false)}>
            Fertig
          </button>
        </div>
      ) : (
        <button className="link-btn muted" onClick={() => setPicking(true)}>
          + Vorhandenen Link anhängen
        </button>
      )}
    </div>
  );
}
