-- Schritt 2 (nach dem Deploy): Änderungen aus dem Übergang nachziehen, alte Spalte entfernen.

update public.tasks
set assignee_person_ids = array[assignee_person_id]
where assignee_person_id is not null and cardinality(assignee_person_ids) = 0 and updated_at > now() - interval '1 day';

alter table public.tasks drop column assignee_person_id;
