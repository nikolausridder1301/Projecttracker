import { ChevronRight } from "lucide-react";
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
    <label className={`chip${empty ? " chip-empty" : ""}${tone ? ` tone-${tone}` : ""}`} title={title}>
      {icon}
      <span className="chip-text">{empty ? placeholder : current!.label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={title}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
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
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  minRows?: number;
  textRef?: React.RefObject<HTMLTextAreaElement>;
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

export function TopicSelect({
  value,
  onChange,
  emptyLabel = "– kein Thema –",
  className,
}: {
  value: Id | "";
  onChange: (v: Id | "") => void;
  emptyLabel?: string;
  className?: string;
}) {
  const { topics } = useLookups();
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {topics
        .filter((t) => !t.archived || t.id === value)
        .map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Entwürfe (SPEC 7.4): Eingaben überleben Neuladen / Verbindungsabbruch
// ---------------------------------------------------------------------------

/** `override`: vorgegebener Wert (z. B. aus „Aufgabe daraus“) hat Vorrang vor einem alten Entwurf. */
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
