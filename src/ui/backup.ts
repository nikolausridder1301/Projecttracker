import { useStore } from "../data/store";
import { daysBetween, formatDateTime, todayIso } from "../logic/dates";

// JSON-Backup (SPEC 6.11): Download aller Tabellen inkl. Papierkorb.
// Erinnerung nur als dezenter Punkt am Export-Icon, wenn das letzte
// Backup älter als 14 Tage ist.

export function useBackup() {
  const { db, allDb, update, insert, toast } = useStore();
  const lastExport = db.app_meta[0]?.last_export_at ?? null;
  const due = !lastExport || daysBetween(lastExport.slice(0, 10), todayIso()) > 14;
  const label = lastExport ? `Backup exportieren (letztes: ${formatDateTime(lastExport)})` : "Backup exportieren (noch keins)";

  const run = async () => {
    // Gesamtbestand aller Projekte, nicht nur das aktuelle
    const data = { exported_at: new Date().toISOString(), version: 2, tables: allDb };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `projecttracker-backup-${todayIso()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    const now = new Date().toISOString();
    const meta = db.app_meta[0];
    if (meta) await update("app_meta", meta.id, { last_export_at: now }).catch(() => {});
    else await insert("app_meta", [{ last_export_at: now }]).catch(() => {});
    toast("Backup heruntergeladen – am besten ins OneDrive legen");
  };

  return { lastExport, due, label, run };
}
