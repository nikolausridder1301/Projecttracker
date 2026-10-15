import { useStore } from "../data/store";
import type { Company } from "../data/types";

/** Anbieter-Firma des aktuellen Projekts (z. B. Tacto) – oder undefined, wenn der Bereich aus ist. */
export function useVendor(): Company | undefined {
  const { project, allDb } = useStore();
  if (!project?.vendor_company_id) return undefined;
  const c = allDb.companies.find((x) => x.id === project.vendor_company_id);
  return c && c.deleted_at === null ? c : undefined;
}
