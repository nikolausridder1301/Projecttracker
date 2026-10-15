import DOMPurify from "dompurify";
import { marked } from "marked";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import allmineral from "../assets/logos/allmineral.png";
import fest from "../assets/logos/fest.jpg";
import hazemag from "../assets/logos/hazemag.jpg";
import maximatorHydrogen from "../assets/logos/maximator-hydrogen.jpg";
import maximator from "../assets/logos/maximator.png";
import perforator from "../assets/logos/perforator.png";
import sk from "../assets/logos/sk.jpg";
import { useLookups } from "../data/store";
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  TRAFFIC_LABEL,
  type Company,
  type Id,
  type Priority,
  type TaskStatus,
  type TrafficLight,
} from "../data/types";

export const LOGOS: Record<string, string> = {
  sk,
  hazemag,
  allmineral,
  maximator,
  "maximator-hydrogen": maximatorHydrogen,
  fest,
  perforator,
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

export function PrioBadge({ priority }: { priority: Priority }) {
  if (priority === "medium") return null;
  return <span className={`badge prio-${priority}`}>{PRIORITY_LABEL[priority]}</span>;
}

export function TrafficDot({ light, title }: { light: TrafficLight; title?: string }) {
  return <span className={`dot dot-${light}`} title={title ?? TRAFFIC_LABEL[light]} />;
}

export function Markdown({ text }: { text: string }) {
  const html = useMemo(() => {
    const raw = marked.parse(text || "", { async: false, breaks: true, gfm: true }) as string;
    const clean = DOMPurify.sanitize(raw);
    // Links immer in neuem Tab öffnen
    return clean.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ');
  }, [text]);
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
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

/** Verantwortlich: "" = Ich, sonst Person. Inaktive Personen nur, wenn bereits gewählt. */
export function AssigneeSelect({
  value,
  onChange,
  className,
}: {
  value: Id | "";
  onChange: (v: Id | "") => void;
  className?: string;
}) {
  const { people, companyById } = useLookups();
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Ich</option>
      {people
        .filter((p) => p.active || p.id === value)
        .map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.company_id ? ` (${companyById.get(p.company_id)?.short ?? ""})` : ""}
            {p.active ? "" : " – inaktiv"}
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
