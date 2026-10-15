import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import allmineral from "../assets/logos/allmineral.png";
import fest from "../assets/logos/fest.jpg";
import hazemag from "../assets/logos/hazemag.jpg";
import maximatorHydrogen from "../assets/logos/maximator-hydrogen.jpg";
import maximator from "../assets/logos/maximator.png";
import perforator from "../assets/logos/perforator.png";
import sk from "../assets/logos/sk.jpg";
import tacto from "../assets/logos/tacto.png";
import { useLookups } from "../data/store";
import { STATUS_LABEL, TRAFFIC_LABEL, type Company, type Id, type TaskStatus, type TrafficLight } from "../data/types";

export const LOGOS: Record<string, string> = {
  sk,
  hazemag,
  allmineral,
  maximator,
  "maximator-hydrogen": maximatorHydrogen,
  fest,
  perforator,
  tacto,
};
export const SK_LOGO = sk;

export function CompanyLogo({ company, size = 28 }: { company: Company; size?: number }) {
  const src = company.logo_key ? LOGOS[company.logo_key] : undefined;
  if (src) return <img className="logo" src={src} alt={company.name} width={size} height={size} />;
  return (
    <span className="logo logo-fallback" style={{ width: size, height: size, background: company.color }}>
      {company.short.slice(0, 3)}
    </span>
  );
}

export function CompanyBadge({ id }: { id: Id | null }) {
  const { companyById } = useLookups();
  const c = id ? companyById.get(id) : undefined;
  if (!c) return null;
  return (
    <span className="badge company-badge" style={{ borderColor: c.color, color: c.color }} title={c.name}>
      {c.short}
    </span>
  );
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <span className={`badge status-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function TrafficDot({ light, title }: { light: TrafficLight; title?: string }) {
  return <span className={`dot dot-${light}`} title={title ?? TRAFFIC_LABEL[light]} />;
}

/** Initialen-Kreis für Personen (statt ausgeschriebenem Namen in Listen). */
export function Avatar({ name, title }: { name: string; title?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span className="avatar" title={title ?? name}>
      {initials}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Chips: kompakte Eigenschaften statt beschrifteter Formularfelder.
// Ein unsichtbares natives <select> liegt über dem Chip – Klick öffnet die
// normale Auswahlliste, die Breite des Chips bleibt dabei stabil.
// ---------------------------------------------------------------------------

export interface ChipOption {
  value: string;
  label: string;
}

/**
 * Chip mit eigener Auswahlliste (statt Browser-Menü): passt zum Design,
 * per Tastatur bedienbar (Pfeile, Enter, Esc), ab 9 Einträgen mit Suche.
 * Die Liste wird an <body> gehängt, damit sie in Panels nicht abgeschnitten wird.
 */
export function ChipSelect({
  icon,
  value,
  options,
  onChange,
  placeholder,
  title,
  tone,
}: {
  icon?: ReactNode;
  value: string;
  options: ChipOption[];
  onChange: (v: string) => void;
  /** Text, wenn nichts gewählt ist (Chip wird dann blass angezeigt). */
  placeholder?: string;
  title: string;
  tone?: string;
}) {
  const current = options.find((o) => o.value === value);
  const empty = !current || (placeholder !== undefined && value === "");
  return (
    <Dropdown value={value} options={options} onChange={onChange} title={title}>
      {(props) => (
        <button type="button" {...props} className={`chip${empty ? " chip-empty" : ""}${tone ? ` tone-${tone}` : ""}`} title={title}>
          {icon}
          <span className="chip-text">{empty ? placeholder : current!.label}</span>
          <ChevronDown size={14} className="chip-caret" aria-hidden />
        </button>
      )}
    </Dropdown>
  );
}

const norm = (t: string) => t.toLocaleLowerCase("de").normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

type TriggerProps = {
  ref: React.RefObject<HTMLButtonElement>;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  "aria-haspopup": "listbox";
  "aria-expanded": boolean;
  "aria-label": string;
};

/** Auswahlliste im App-Design; der Auslöser wird per Render-Funktion gestaltet. */
export function Dropdown({
  value,
  options,
  onChange,
  title,
  children,
}: {
  value: string;
  options: ChipOption[];
  onChange: (v: string) => void;
  title: string;
  children: (trigger: TriggerProps) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number; maxHeight: number; above: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchable = options.length > 8;
  const filtered = q ? options.filter((o) => norm(o.label).includes(norm(q))) : options;

  const close = (refocus = true) => {
    setOpen(false);
    setQ("");
    if (refocus) btnRef.current?.focus();
  };

  const openMenu = () => {
    const r = btnRef.current!.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const placeAbove = below < 220 && above > below;
    setPos({
      top: placeAbove ? r.top - 4 : r.bottom + 4,
      left: Math.min(r.left, window.innerWidth - 240),
      minWidth: Math.max(r.width, 180),
      maxHeight: Math.min(320, placeAbove ? above : below),
      above: placeAbove,
    });
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  // Schließen bei Klick daneben, Scrollen außerhalb der Liste oder Größenänderung
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) close(false);
    };
    const onScroll = (e: Event) => {
      if (!menuRef.current?.contains(e.target as Node)) close(false);
    };
    const onResize = () => close(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    (searchable ? searchRef.current : menuRef.current)?.focus();
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Aktiven Eintrag sichtbar halten
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const choose = (v: string) => {
    if (v !== value) onChange(v);
    close();
  };

  const onMenuKey = (e: React.KeyboardEvent) => {
    // Nicht an Panel/Seite weiterreichen (z. B. Esc schließt sonst das Panel)
    e.stopPropagation();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[active]) choose(filtered[active].value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      close(false);
    }
  };

  const trigger: TriggerProps = {
    ref: btnRef,
    onClick: () => (open ? close() : openMenu()),
    onKeyDown: (e) => {
      if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        openMenu();
      }
    },
    "aria-haspopup": "listbox",
    "aria-expanded": open,
    "aria-label": title,
  };

  return (
    <>
      {children(trigger)}
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            className={`dropdown-menu${pos.above ? " above" : ""}`}
            style={{ top: pos.top, left: pos.left, minWidth: pos.minWidth, maxHeight: pos.maxHeight }}
            role="listbox"
            aria-label={title}
            tabIndex={-1}
            onKeyDown={onMenuKey}
          >
            {searchable && (
              <input
                ref={searchRef}
                className="dropdown-search"
                placeholder="Suchen…"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
              />
            )}
            <div className="dropdown-items">
              {filtered.map((o, i) => (
                <div
                  key={o.value}
                  data-index={i}
                  role="option"
                  aria-selected={o.value === value}
                  className={`dropdown-item${i === active ? " active" : ""}${o.value === value ? " selected" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o.value)}
                >
                  <span className="grow">{o.label}</span>
                  {o.value === value && <Check size={15} aria-hidden />}
                </div>
              ))}
              {filtered.length === 0 && <div className="dropdown-empty">Keine Treffer</div>}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export function ChipDate({
  icon,
  value,
  onChange,
  placeholder,
  title,
  format,
  tone,
}: {
  icon?: ReactNode;
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder: string;
  title: string;
  format: (v: string) => string;
  tone?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <span className={`chip${value ? "" : " chip-empty"}${tone ? ` tone-${tone}` : ""}`} title={title}>
      <button
        type="button"
        className="chip-hit"
        onClick={() => {
          try {
            ref.current?.showPicker();
          } catch {
            ref.current?.focus();
          }
        }}
      >
        {icon}
        <span className="chip-text">{value ? format(value) : placeholder}</span>
      </button>
      {value && (
        <button type="button" className="chip-clear" onClick={() => onChange(null)} aria-label={`${title} entfernen`}>
          ×
        </button>
      )}
      <input
        ref={ref}
        type="date"
        tabIndex={-1}
        aria-label={title}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      />
    </span>
  );
}

/** Mehrfachauswahl als Chip mit kleinem Aufklapp-Menü (z. B. betroffene Firmen). */
export function ChipMulti({
  icon,
  label,
  empty,
  title,
  options,
  selected,
  onChange,
  allLabel,
}: {
  icon?: ReactNode;
  label: string;
  empty?: boolean;
  title: string;
  options: ChipOption[];
  selected: string[];
  onChange: (v: string[]) => void;
  /** Text für „nichts gewählt“ (z. B. „Alle Firmen“) */
  allLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <span className="popover-anchor" ref={ref}>
      <button type="button" className={`chip${empty ? " chip-empty" : ""}`} title={title} onClick={() => setOpen(!open)} aria-expanded={open}>
        {icon}
        <span className="chip-text">{label}</span>
      </button>
      {open && (
        <div className="popover popover-list">
          {allLabel && (
            <label className="inline">
              <input type="checkbox" className="check" checked={selected.length === 0} onChange={() => onChange([])} /> {allLabel}
            </label>
          )}
          {options.map((o) => (
            <label key={o.value} className="inline">
              <input type="checkbox" className="check" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} /> {o.label}
            </label>
          ))}
        </div>
      )}
    </span>
  );
}

/** Aufklappbarer Bereich – standardmäßig zu, Inhalt nur bei Bedarf. */
export function Disclosure({
  title,
  meta,
  defaultOpen = false,
  action,
  children,
}: {
  title: string;
  meta?: ReactNode;
  defaultOpen?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // Bekommt der Bereich erstmals Inhalt (z. B. neue Aufgabe aus dem Protokoll), klappt er auf
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);
  return (
    <section className={`disclosure${open ? " open" : ""}`}>
      <div className="disclosure-head">
        <button type="button" className="disclosure-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          <ChevronRight size={16} className="chev" />
          <span>{title}</span>
          {meta !== undefined && <span className="muted">{meta}</span>}
        </button>
        {open && action}
      </div>
      {open && <div className="disclosure-body">{children}</div>}
    </section>
  );
}

/** Mehrzeiliges Textfeld, das mit dem Inhalt wächst (kein Bearbeiten/Vorschau-Wechsel). */
export function AutoText({
  value,
  onChange,
  onBlur,
  placeholder,
  minRows = 2,
  textRef,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  minRows?: number;
  textRef?: React.RefObject<HTMLTextAreaElement>;
  autoFocus?: boolean;
}) {
  const own = useRef<HTMLTextAreaElement>(null);
  const ref = textRef ?? own;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value, ref]);
  return (
    <textarea
      ref={ref}
      className="autotext"
      rows={minRows}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      autoFocus={autoFocus}
    />
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

// ---------------------------------------------------------------------------
// Auswahlfelder
// ---------------------------------------------------------------------------

export function CompanySelect({
  value,
  onChange,
  allowAll,
  className,
}: {
  value: Id | "";
  onChange: (v: Id) => void;
  allowAll?: string;
  className?: string;
}) {
  const { companies } = useLookups();
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      {allowAll !== undefined && <option value="">{allowAll}</option>}
      {companies.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

export function useDraft(key: string, initial = "", override?: string): [string, (v: string) => void, () => void] {
  const storageKey = `projecttracker-draft:${key}`;
  const [value, setValue] = useState<string>(() => {
    if (override) return override;
    try {
      return localStorage.getItem(storageKey) ?? initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      if (value && value !== initial) localStorage.setItem(storageKey, value);
      else localStorage.removeItem(storageKey);
    } catch {
      /* ignorieren */
    }
  }, [storageKey, value, initial]);
  const clear = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignorieren */
    }
    setValue(initial);
  };
  return [value, setValue, clear];
}

/** Ansichts-Einstellungen (Filter) pro Ansicht merken. */
export function usePersisted<T>(key: string, initial: T): [T, (v: T) => void] {
  const storageKey = `projecttracker-view:${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? { ...initial, ...JSON.parse(raw) } : initial;
    } catch {
      return initial;
    }
  });
  const set = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(storageKey, JSON.stringify(v));
    } catch {
      /* ignorieren */
    }
  };
  return [value, set];
}
