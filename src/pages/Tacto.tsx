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
import { type Id, type VendorCategory, type VendorItem } from "../data/types";
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
  newVendorItem,
  showTicket,
  statusDef,
  statusPatch,
} from "../logic/vendor";
import { AutoText, ChipSelect, CompaniesChip, CompanyFilter, Empty, ImportantChip, PeopleChip, usePersisted } from "../ui/common";
import { useVendor } from "../ui/vendor";

export const CATEGORY_ICON: Record<VendorCategory, LucideIcon> = {
  feature: Lightbulb,
  question: HelpCircle,
  bug: Bug,
  best_practice: ThumbsUp,
  claim: ShieldAlert,
};

interface Filter {
  category: VendorCategory;
  showDone: boolean;
  /** leer = alle Firmen */
  companies: Id[];
}

export function TactoPage() {
  const vendor = useVendor();
  if (!vendor) {
    return (
      <div className="page">
        <div className="page-head">
          <h1>Anbieter</h1>
        </div>
        <Empty>Dieses Projekt hat keinen Anbieter-Bereich. Einschalten kannst du ihn in den Projekteinstellungen.</Empty>
      </div>
    );
  }
  return <VendorPage vendorName={vendor.name} />;
}

function VendorPage({ vendorName }: { vendorName: string }) {
  const { db, insert, toast } = useStore();
  const { companies, people } = useLookups();
  const [f, setF] = usePersisted<Filter>("tacto", { category: "feature", showDone: false, companies: [] });
  const companyFilter = Array.isArray(f.companies) ? f.companies : [];
  const set = (p: Partial<Filter>) => setF({ ...f, ...p });
  const [params, setParams] = useSearchParams();
  const openId = params.get("id");
  const openItem = (id: Id | null) => setParams(id ? { id } : {}, { replace: true });
  const [newTitle, setNewTitle] = useState("");
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

  const cat = categoryDef(f.category);
  const hasStatus = cat.statuses.length > 0;
  const inCategory = useMemo(
    () => alive.filter((i) => i.category === f.category && (companyFilter.length === 0 || companyFilter.some((c) => affectsCompany(i, c)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [alive, f.category, companyFilter.join()],
  );
  const doneCount = hasStatus ? inCategory.filter((i) => !isOpenItem(i)).length : 0;
  const items = useMemo(
    () =>
      inCategory
        .filter((i) => !hasStatus || f.showDone || isOpenItem(i))
        .sort((a, b) => {
          // offene vor erledigten, dann hohe Priorität, dann älteste zuerst
          if (isOpenItem(a) !== isOpenItem(b)) return isOpenItem(a) ? -1 : 1;
          if (a.priority !== b.priority) return a.priority === "high" ? -1 : b.priority === "high" ? 1 : 0;
          return (a.reported_at ?? a.created_at) < (b.reported_at ?? b.created_at) ? -1 : 1;
        }),
    [inCategory, hasStatus, f.showDone],
  );

  // Erfassen wie in der Schnellerfassung: Titel tippen, Enter – kein Platzhalter-Eintrag
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    await insert("vendor_items", [newVendorItem(f.category, title, companyFilter)]);
    setNewTitle("");
  };

  const copyJourFixe = async () => {
    const text = jourFixeText(alive, companies, people, today, vendorName);
    try {
      await navigator.clipboard.writeText(text);
      toast("Offene Punkte für den Jour fixe kopiert");
    } catch {
      toast("Kopieren nicht möglich – Browser hat den Zugriff verweigert", "error");
    }
  };

  const Icon = CATEGORY_ICON[f.category];
  const selected = alive.find((i) => i.id === openId);

  return (
    <div className="page">
      <div className="page-head">
        <h1>{vendorName}</h1>
        <span className="spacer" />
        <button className="btn" onClick={() => void copyJourFixe()} title="Alle offenen Punkte als Text für den Jour fixe kopieren">
          <ClipboardCopy size={16} /> <span className="btn-label">Für Jour fixe kopieren</span>
        </button>
      </div>

      <div className="filters">
        <div className="seg-group">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              className={`seg${f.category === c.value ? " active" : ""}`}
              onClick={() => set({ category: c.value })}
              title={c.plural}
            >
              {c.short}
              {(counts.get(c.value) ?? 0) > 0 && <span className="seg-count">{counts.get(c.value)}</span>}
            </button>
          ))}
        </div>
        <CompanyFilter value={companyFilter} onChange={(v) => set({ companies: v })} />
      </div>

      <div className="card list-card">
        <form className="capture-row" onSubmit={(e) => void create(e).catch(() => {})}>
          <Plus size={18} className="row-icon" />
          <input
            className="plain-input"
            placeholder={cat.placeholder}
            aria-label={cat.placeholder}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
        </form>
        {items.map((i) => {
          const sd = statusDef(i);
          return (
            <button key={i.id} className={`vendor-row${!hasStatus || isOpenItem(i) ? "" : " is-done"}`} onClick={() => openItem(i.id)}>
              <Icon size={18} className="row-icon" />
              <span className="note-main">
                <span className="task-title">
                  {i.priority === "high" && isOpenItem(i) && <Flag size={14} className="tone-red" aria-label="Wichtig" />}
                  {i.title}
                </span>
                <span className="task-sub">
                  <span>{companiesLabel(i.company_ids, companies)}</span>
                  {i.ticket && <span>Ticket {i.ticket}</span>}
                </span>
              </span>
              {sd && <span className={`status-pill${sd.tone ? ` tone-${sd.tone}` : ""}`}>{sd.label}</span>}
              {hasStatus && <span className="age">{ageLabel(i, today, vendorName)}</span>}
            </button>
          );
        })}
        {items.length === 0 && (
          <div className="empty-inline list-empty">{hasStatus ? `Keine offenen ${cat.plural}.` : `Noch keine ${cat.plural}.`}</div>
        )}
      </div>
      {doneCount > 0 && (
        <button className="link-btn" onClick={() => set({ showDone: !f.showDone })}>
          {f.showDone ? "Erledigte ausblenden" : `${doneCount} erledigte anzeigen`}
        </button>
      )}

      {selected && <VendorPanel key={selected.id} item={selected} vendorName={vendorName} onClose={() => openItem(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function VendorPanel({ item, vendorName, onClose }: { item: VendorItem; vendorName: string; onClose: () => void }) {
  const { update, insert, trash, toast } = useStore();
  const { companies } = useLookups();
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body);
  const [answer, setAnswer] = useState(item.answer);
  const [promised, setPromised] = useState(item.promised);
  const [actual, setActual] = useState(item.actual);
  const [ticket, setTicket] = useState(item.ticket);
  const [evidence, setEvidence] = useState(item.evidence_url);
  const [more, setMore] = useState(false);
  const today = todayIso();
  const def = categoryDef(item.category);
  const sd = statusDef(item);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = (patch: Parameters<typeof update<"vendor_items">>[2]) => void update("vendor_items", item.id, patch).catch(() => {});
  const blurText = (key: "body" | "promised" | "actual" | "ticket", v: string) => v !== item[key] && save({ [key]: v });

  // Ansprechpartner: Kontakte des Anbieters zuerst
  const tacto = companies.find((c) => c.name === vendorName) ?? companies.find((c) => c.is_external);

  // Selten gebrauchte Eigenschaften nur zeigen, wenn gesetzt oder über „Mehr…“
  const showContact = more || item.contact_person_ids.length > 0;

  const toBestPractice = async () => {
    await insert("vendor_items", [
      {
        ...newVendorItem("best_practice", item.title, item.company_ids),
        body: answer || item.answer,
        topic_id: item.topic_id,
        contact_person_ids: item.contact_person_ids,
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
            <CompaniesChip
              title="Betroffene Firmen"
              allLabel="Alle Firmen"
              only={(c) => !c.is_external}
              value={item.company_ids}
              onChange={(ids) => save({ company_ids: ids })}
            />
            <ImportantChip value={item.priority === "high"} onChange={(v) => save({ priority: v ? "high" : "medium" })} />
            {showContact && (
              <PeopleChip
                title="Ansprechpartner"
                emptyLabel="Ansprechpartner"
                icon={<User size={14} />}
                value={item.contact_person_ids}
                onChange={(ids) => save({ contact_person_ids: ids })}
                sortFirst={(p) => p.company_id === tacto?.id}
              />
            )}
            {more && (
              <ChipSelect
                title="Kategorie"
                value={item.category}
                options={CATEGORIES.map((c) => ({ value: c.value, label: `Kategorie: ${c.label}` }))}
                onChange={(v) => {
                  const c = v as VendorCategory;
                  save({ category: c, status: initialStatus(c), status_changed_at: new Date().toISOString() });
                }}
              />
            )}
            {!more && (
              <button type="button" className="chip chip-empty" onClick={() => setMore(true)} title="Ansprechpartner, Kategorie">
                <span className="chip-text">Mehr…</span>
              </button>
            )}
          </div>

          {showTicket(item) && (
            <input
              className="plain-input"
              placeholder={`Ticket-Nr. oder Link bei ${vendorName}…`}
              aria-label={`Ticket bei ${vendorName}`}
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
                placeholder={`Antwort von ${vendorName}…`}
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
                  <AutoText
                    value={promised}
                    onChange={setPromised}
                    onBlur={() => blurText("promised", promised)}
                    minRows={2}
                    placeholder={`Was ${vendorName} zugesagt hat…`}
                  />
                </div>
                <div className="field-block">
                  <span>Tatsächlich</span>
                  <AutoText
                    value={actual}
                    onChange={setActual}
                    onBlur={() => blurText("actual", actual)}
                    minRows={2}
                    placeholder="Wie es wirklich funktioniert…"
                  />
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
            {item.reported_at && ` · an ${vendorName} gemeldet ${formatDate(item.reported_at)}`}
          </p>
        </div>
      </aside>
    </>
  );
}
