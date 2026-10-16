import { ChevronDown } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useLookups } from "../data/store";
import type { MeetingTarget } from "../logic/briefing";
import { Avatar, CompanyLogo, Dropdown, Empty, usePersisted } from "../ui/common";
import { ContactView } from "./Contact";

// Meeting: schnell Person oder Firma wählen – darunter dieselbe Ansicht wie
// unter „Kontakte“ (offene Punkte mit „Schritt notieren…“, Protokoll starten).

const parseTarget = (v: string): MeetingTarget | null =>
  v.startsWith("p:") ? { kind: "person", id: v.slice(2) } : v.startsWith("c:") ? { kind: "company", id: v.slice(2) } : null;

export function MeetingPage() {
  const { people, companies, companyById, personById } = useLookups();
  const [params, setParams] = useSearchParams();
  const [saved, setSaved] = usePersisted<{ target: string }>("meeting", { target: "" });

  // Aufruf mit ?p=… / ?c=… übernimmt die Auswahl
  useEffect(() => {
    const p = params.get("p");
    const c = params.get("c");
    if (p || c) {
      setSaved({ target: p ? `p:${p}` : `c:${c}` });
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // Nur gültige Auswahl im aktuellen Projekt
  const target = useMemo(() => {
    const t = parseTarget(saved.target);
    if (!t) return null;
    const exists = t.kind === "person" ? people.some((p) => p.id === t.id) : companies.some((c) => c.id === t.id);
    return exists ? t : null;
  }, [saved.target, people, companies]);

  const options = [
    ...people
      .filter((p) => p.active)
      .map((p) => ({ value: `p:${p.id}`, label: `${p.name}${p.company_id ? ` · ${companyById.get(p.company_id)?.short ?? ""}` : ""}` })),
    ...companies.map((c) => ({ value: `c:${c.id}`, label: `${c.name} (ganze Firma)` })),
  ];
  const person = target?.kind === "person" ? personById.get(target.id) : undefined;
  const company = target?.kind === "company" ? companyById.get(target.id) : person?.company_id ? companyById.get(person.company_id) : undefined;
  const currentLabel = person
    ? `${person.name}${company ? ` · ${company.name}` : ""}`
    : company
      ? `${company.name} (ganze Firma)`
      : "Mit wem triffst du dich?";

  return (
    <div className="page">
      <div className="page-head">
        <h1>Meeting</h1>
      </div>

      <Dropdown value={saved.target} options={options} onChange={(v) => setSaved({ target: v })} title="Mit wem triffst du dich?">
        {(props) => (
          <button type="button" {...props} className={`meeting-picker${target ? "" : " empty"}`}>
            {person ? <Avatar name={person.name} /> : company ? <CompanyLogo company={company} size={24} /> : null}
            <span className="grow">{currentLabel}</span>
            <ChevronDown size={18} className="chip-caret" />
          </button>
        )}
      </Dropdown>

      {target ? (
        <ContactView key={saved.target} target={target} />
      ) : (
        <Empty>Wähle eine Person oder Firma – dann siehst du alle offenen Punkte und Notizen für das Gespräch.</Empty>
      )}
    </div>
  );
}
