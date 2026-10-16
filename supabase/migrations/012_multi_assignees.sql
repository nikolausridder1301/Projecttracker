-- Mehrere Verantwortliche je Aufgabe (leer = ich selbst).
-- Schritt 1 (vor dem Deploy): neue Spalte anlegen und befüllen; die alte bleibt
-- noch, damit die laufende App bis zum Deploy weiter speichern kann.

alter table public.tasks add column assignee_person_ids uuid[] not null default '{}';
update public.tasks set assignee_person_ids = array[assignee_person_id] where assignee_person_id is not null;
create index on public.tasks using gin (assignee_person_ids);
