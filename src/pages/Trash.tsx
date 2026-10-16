import { useStore } from "../data/store";
import type { Id, TableName } from "../data/types";
import { formatDateTime } from "../logic/dates";
import { CompanyBadge, Empty } from "../ui/common";

// Papierkorb (SPEC 6.10): wiederherstellen oder endgültig löschen.

const KINDS: { table: TableName; label: string }[] = [
  { table: "tasks", label: "Aufgabe" },
  { table: "notes", label: "Notiz" },
  { table: "links", label: "Link" },
  { table: "vendor_items", label: "Anbieter-Punkt" },
  { table: "people", label: "Person" },
];

interface Item {
  table: TableName;
  label: string;
  id: Id;
  title: string;
  companyId: Id | null;
  deletedAt: string;
}

export function TrashPage() {
  const { db, restore, purge, toast } = useStore();

  const items: Item[] = KINDS.flatMap(({ table, label }) =>
    (db[table] as unknown as { id: Id; deleted_at: string | null; title?: string; name?: string; company_id?: Id | null }[])
      .filter((r) => r.deleted_at !== null)
      .map((r) => ({
        table,
        label,
        id: r.id,
        title: r.title ?? r.name ?? "",
        companyId: r.company_id ?? null,
        deletedAt: r.deleted_at!,
      })),
  ).sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1));

  const purgeItem = async (it: Item) => {
    if (!window.confirm(`„${it.title}“ endgültig löschen? Das kann nicht rückgängig gemacht werden.`)) return;
    if (it.table === "people" && db.tasks.some((t) => t.assignee_person_ids.includes(it.id))) {
      toast("Diese Person ist noch Aufgaben zugeordnet und kann nicht endgültig gelöscht werden.", "error");
      return;
    }
    await purge(it.table, it.id);
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Papierkorb</h1>
        <span className="muted">{items.length} Einträge</span>
      </div>
      {items.length === 0 ? (
        <Empty>Der Papierkorb ist leer.</Empty>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Art</th>
                <th>Titel</th>
                <th>Firma</th>
                <th>Gelöscht</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={`${it.table}-${it.id}`}>
                  <td className="muted">{it.label}</td>
                  <td>{it.title}</td>
                  <td>
                    <CompanyBadge id={it.companyId} />
                  </td>
                  <td className="muted small">{formatDateTime(it.deletedAt)}</td>
                  <td className="row tight">
                    <button className="btn small" onClick={() => void restore(it.table, it.id)}>
                      Wiederherstellen
                    </button>
                    <button className="btn ghost small danger" onClick={() => void purgeItem(it)}>
                      Endgültig löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
