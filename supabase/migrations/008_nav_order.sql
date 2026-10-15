-- Reihenfolge der Menüpunkte (per Drag-and-Drop), gilt für alle Projekte und Geräte.
alter table app_meta add column nav_order text[] not null default '{}';
