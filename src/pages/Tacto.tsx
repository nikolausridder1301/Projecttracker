import {
  Bug,
  ClipboardCopy,
  Flag,
  HelpCircle,
  Lightbulb,
  Plus,
  ShieldAlert,
  Sparkles,
  ThumbsUp,
  Trash2,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLookups, useStore } from "../data/store";
import { PRIORITY_LABEL, type Id, type Priority, type VendorCategory, type VendorItem } from "../data/types";
import { formatDate, todayIso } from "../logic/dates";
import { isActive, isValidUrl } from "../logic/tasks";
import {
  CATEGORIES,
  ageLabel,
  affectsCompany,
  categoryDef,
  companiesLabel,
  initialStatus,
  isOpenItem,
  jourFixeText,
  statusDef,
  statusPatch,
} from "../logic/vendor";
import { AutoText, ChipMulti, ChipSelect, CompanySelect, Empty, usePersisted } from "../ui/common";

export const CATEGORY_ICON: Record<VendorCategory, LucideIcon> = {
  feature: Lightbulb,
  question: HelpCircle,
  bug: Bug,
  best_practice: ThumbsUp,
  claim: ShieldAlert,
};

interface Filter {
  category: VendorCategory;
  scope: "open" | "closed" | "all";
  company: Id | "";
  q: string;
}

export function TactoPage() {
  const { db, insert, toast } = useStore();
  const { companies, people } = useLookups();
  const [f, setF] = usePersisted<Filter>("tacto", { category: "feature", scope: "open", company: "", q: "" });
  const set = (p: Partial<Filter>) => setF({ ...f, ...p });
  const [params, setParams] = useSearchParams();
  const openId = params.get("id");
  const openItem = (id: Id | null) => setParams(id ? { id } : {}, { replace: true });
  const today = todayIso();

  const alive = useMemo(() => db.vendor_items.filter(isActive), [db.vendor_items]);
  const counts = useMemo(() => {
    const m = new Map<VendorCategory, number>();
    for (const c of CATEGORIES) {
      const list = alive.filter((i) => i.category === c.value);
      // Best Practices haben keinen Status – dort zählt die Gesamtzahl
      m.set(c.value, c.statuses.length === 0 ? list.length : list.filter(isOpenItem).length);
    }
    return m;
  }, [alive]);

  const hasStatus = categoryDef(f.category).statuses.length > 0;
  const items = useMemo(() => {
    const q = f.q.toLowerCase();
    return alive
      .filter((i) => i.category === f.category)
      .filter((i) => !hasStatus || f.scope === "all" || (f.scope === "open" ? isOpenItem(i) : !isOpenItem(i)))
      .filter((i) => !f.company || affectsCompany(i, f.company))
      .filter((i) => !q || `${i.title} ${i.body} ${i.answer} ${i.ticket}`.toLowerCase().includes(q))
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority === "high" ? -1 : b.priority === "high" ? 1 : 0;
        return (a.reported_at ?? a.created_at) < (b.reported_at ?? b.created_at) ? -1 : 1;
      });
  }, [alive, f, hasStatus]);

  const create = async () => {
    const [n] = await insert("vendor_items", [
      {
        title: "Neuer Punkt",
        body: "",
        category: f.category,
        status: initialStatus(f.category),
        company_ids: f.company ? [f.company] : [],
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
      },
    ]);
    openItem(n.id);
  };

  const copyJourFixe = async () => {
    const text = jourFixeText(alive, companies, people, today);
    try {
      await navigator.clipboard.writeText(text);
      toast("Offene Punkte für den Jour fixe kopiert");
    } catch {
      toast("Kopieren nicht möglich – Browser hat den Zugriff verweigert", "error");
    }
  };

  const cat = categoryDef(f.category);
  const Icon = CATEGORY_ICON[f.category];
  const selected = alive.find((i) => i.id === openId);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Tacto</h1>
        <span className="spacer" />
        <button className="btn" onClick={() => void copyJourFixe()} title="Alle offenen Punkte als Text für den Jour fixe kopieren">
          <ClipboardCopy size={16} /> <span className="btn-label">Für Jour fixe kopieren</span>
        </button>
        <button className="btn primary" onClick={() => void create().catch(() => {})}>
          <Plus size={16} /> {cat.label}
        </button>
      </div>

      <div className="filters">
        <div className="seg-group">
          {CATEGORIES.map((c) => (
            <button key={c.value} className={`seg${f.category === c.value ? " active" : ""}`} onClick={() => set({ category: c.value })}>
              {c.plural}
              {(counts.get(c.value) ?? 0) > 0 && <span className="seg-count">{counts.get(c.value)}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="filters">
        {hasStatus && (
          <div className="seg-group">
            {(
              [
                ["open", "Offen"],
                ["closed", "Erledigt"],
                ["all", "Alle"],
              ] as const
            ).map(([v, label]) => (
              <button key={v} className={`seg${f.scope === v ? " active" : ""}`} onClick={() => set({ scope: v })}>
                {label}
              </button>
            ))}
          </div>
        )}
        <CompanySelect className="compact" value={f.company} onChange={(v) => set({ company: v })} allowAll="Alle Firmen" />
        <input className="compact" placeholder="Filtern…" value={f.q} onChange={(e) => set({ q: e.target.value })} />
      </div>

      {items.length === 0 ? (
        <Empty>
          {hasStatus && f.scope === "open" ? `Keine offenen ${cat.plural}.` : `Keine ${cat.plural}.`}
        </Empty>
      ) : (
        <div className="card list-card">
          {items.map((i) => {
            const sd = statusDef(i);
            return (
              <button key={i.id} className="vendor-row" onClick={() => openItem(i.id)}>
                <Icon size={18} className="row-icon" />
                <span className="note-main">
                  <span className="task-title">
                    {i.priority === "high" && isOpenItem(i) && <Flag size={14} className="tone-red" aria-label="Hohe Priorität" />}
                    {i.title}
                  </span>
                  <span className="task-sub">
                    <span>{companiesLabel(i.company_ids, companies)}</span>
                    {i.ticket && <span>Ticket {i.ticket}</span>}
                  </span>
                </span>
                {sd && <span className={`status-pill${sd.tone ? ` tone-${sd.tone}` : ""}`}>{sd.label}</span>}
                <span className="age">{ageLabel(i, today)}</span>
              </button>
            );
          })}
        </div>
      )}

      {selected && <VendorPanel key={selected.id} item={selected} onClose={() => openItem(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function VendorPanel({ item, onClose }: { item: VendorItem; onClose: () => void }) {
  const { update, insert, trash, toast } = useStore();
  const { companies, topics, people, companyById } = useLookups();
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body);
  const [answer, setAnswer] = useState(item.answer);
  const [promised, setPromised] = useState(item.promised);
  const [actual, setActual] = useState(item.actual);
  const [ticket, setTicket] = useState(item.ticket);
  const [evidence, setEvidence] = useState(item.evidence_url);
  const today = todayIso();
  const def = categoryDef(item.category);
  const sd = statusDef(item);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = (patch: Parameters<typeof update<"vendor_items">>[2]) => void update("vendor_items", item.id, patch).catch(() => {});
  const blurText = (key: "body" | "answer" | "promised" | "actual" | "ticket", v: string) => v !== item[key] && save({ [key]: v });

  // Ansprechpartner: Tacto-Kontakte zuerst
  const tacto = companies.find((c) => c.is_external);
  const contactOptions = [
    { value: "", label: "Kein Ansprechpartner" },
    ...people
      .filter((p) => p.active || p.id === item.contact_person_id)
      .sort((a, b) => Number(b.company_id === tacto?.id) - Number(a.company_id === tacto?.id))
      .map((p) => ({ value: p.id, label: `${p.name}${p.company_id ? ` (${companyById.get(p.company_id)?.short ?? ""})` : ""}` })),
  ];
  const groupCompanies = companies.filter((c) => !c.is_external);

  const toBestPractice = async () => {
    await insert("vendor_items", [
      {
        title: item.title,
        body: answer || item.answer,
        category: "best_practice",
        status: "",
        company_ids: item.company_ids,
        topic_id: item.topic_id,
        priority: "medium",
        contact_person_id: item.contact_person_id,
        ticket: "",
        answer: "",
        promised: "",
        actual: "",
        evidence_url: "",
        reported_at: null,
        status_changed_at: null,
      },
    ]);
    toast("Als Best Practice übernommen");
  };

  return (
    <>
      <div className="panel-backdrop" onClick={onClose} />
      <aside className="panel" aria-label={def.label}>
        <div className="editor">
          <div className="panel-head">
            <span className="muted small">{def.label}</span>
            <span className="spacer" />
            <button className="icon-btn" title="In den Papierkorb" onClick={() => void trash("vendor_items", item.id, item.title).then(onClose)}>
              <Trash2 size={16} />
            </button>
            <button className="icon-btn" onClick={onClose} aria-label="Schließen" title="Schließen (Esc)">
              <X size={18} />
            </button>
          </div>

          <div className="title-field">
            <AutoText
              value={title}
              onChange={(v) => setTitle(v.replace(/\n/g, " "))}
              onBlur={() => (title.trim() ? title !== item.title && save({ title: title.trim() }) : setTitle(item.title))}
              minRows={1}
              placeholder="Titel"
            />
          </div>

          <div className="chips">
            {def.statuses.length > 0 && (
              <ChipSelect
                title="Status"
                tone={sd?.tone}
                value={item.status}
                options={def.statuses.map((s) => ({ value: s.value, label: s.label }))}
                onChange={(v) => save(statusPatch(item, v, today))}
              />
            )}
            <ChipSelect
              title="Kategorie"
              value={item.category}
              options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
              onChange={(v) => {
                const c = v as VendorCategory;
                save({ category: c, status: initialStatus(c), status_changed_at: new Date().toISOString() });
              }}
            />
            <ChipMulti
              title="Betroffene Firmen"
              label={companiesLabel(item.company_ids, companies)}
              allLabel="Alle Firmen"
              options={groupCompanies.map((c) => ({ value: c.id, label: c.name }))}
              selected={item.company_ids}
              onChange={(ids) => save({ company_ids: ids })}
            />
            <ChipSelect
              title="Thema"
              value={item.topic_id ?? ""}
              placeholder="Thema"
              options={[
                { value: "", label: "Kein Thema" },
                ...topics.filter((t) => !t.archived || t.id === item.topic_id).map((t) => ({ value: t.id, label: t.name })),
              ]}
              onChange={(v) => save({ topic_id: v || null })}
            />
            <ChipSelect
              title="Ansprechpartner"
              icon={<User size={14} />}
              value={item.contact_person_id ?? ""}
              placeholder="Ansprechpartner"
              options={contactOptions}
              onChange={(v) => save({ contact_person_id: v || null })}
            />
            <ChipSelect
              title="Priorität"
              icon={<Flag size={14} />}
              tone={item.priority === "high" ? "red" : undefined}
              value={item.priority === "medium" ? "" : item.priority}
              placeholder="Priorität"
              options={[
                { value: "", label: "Mittel" },
                { value: "high", label: PRIORITY_LABEL.high },
                { value: "low", label: PRIORITY_LABEL.low },
              ]}
              onChange={(v) => save({ priority: (v || "medium") as Priority })}
            />
          </div>

          {def.statuses.length > 0 && (
            <input
              className="plain-input ticket-input"
              placeholder="Ticket-Nr. oder Link bei Tacto…"
              value={ticket}
              onChange={(e) => setTicket(e.target.value)}
              onBlur={() => blurText("ticket", ticket.trim())}
            />
          )}

          <AutoText
            value={body}
            onChange={setBody}
            onBlur={() => blurText("body", body)}
            minRows={3}
            placeholder={
              item.category === "question"
                ? "Frage im Detail…"
                : item.category === "bug"
                  ? "Was passiert, wo, wie nachstellbar…"
                  : item.category === "best_practice"
                    ? "So machen wir es am besten…"
                    : "Beschreibung…"
            }
          />

          {item.category === "question" && (
            <div className="field-block">
              <span>Antwort</span>
              <AutoText
                value={answer}
                onChange={setAnswer}
                onBlur={() => {
                  if (answer === item.answer) return;
                  // Mit Antwort gilt die Frage als beantwortet
                  save(answer.trim() && item.status !== "answered" ? { answer, ...statusPatch(item, "answered", today) } : { answer });
                }}
                minRows={2}
                placeholder="Antwort von Tacto…"
              />
              {(answer || item.answer).trim() && (
                <div>
                  <button className="btn ghost" onClick={() => void toBestPractice().catch(() => {})}>
                    <Sparkles size={15} /> Als Best Practice übernehmen
                  </button>
                </div>
              )}
            </div>
          )}

          {item.category === "claim" && (
            <>
              <div className="claim-grid">
                <div className="field-block">
                  <span>Versprochen</span>
                  <AutoText value={promised} onChange={setPromised} onBlur={() => blurText("promised", promised)} minRows={2} placeholder="Was Tacto zugesagt hat…" />
                </div>
                <div className="field-block">
                  <span>Tatsächlich</span>
                  <AutoText value={actual} onChange={setActual} onBlur={() => blurText("actual", actual)} minRows={2} placeholder="Wie es wirklich funktioniert…" />
                </div>
              </div>
              <div className="field-block">
                <span>Beleg</span>
                <div className="row">
                  <input
                    className="grow"
                    placeholder="Link zu Angebot, Vertrag oder Protokoll…"
                    value={evidence}
                    onChange={(e) => setEvidence(e.target.value)}
                    onBlur={() => {
                      const v = evidence.trim();
                      if (v && !isValidUrl(v)) return toast("Bitte eine Adresse mit http:// oder https:// eingeben.", "error");
                      if (v !== item.evidence_url) save({ evidence_url: v });
                    }}
                  />
                  {item.evidence_url && (
                    <a className="btn ghost" href={item.evidence_url} target="_blank" rel="noopener noreferrer">
                      Öffnen
                    </a>
                  )}
                </div>
              </div>
            </>
          )}

          <p className="meta-line">
            Angelegt {formatDate(item.created_at.slice(0, 10))}
            {item.reported_at && ` · an Tacto ${formatDate(item.reported_at)}`}
            {item.status_changed_at && ` · Status geändert ${formatDate(item.status_changed_at.slice(0, 10))}`}
            {ageLabel(item, today) && ` · ${ageLabel(item, today)}`}
          </p>
        </div>
      </aside>
    </>
  );
}
