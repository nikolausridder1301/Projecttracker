-- „Ich“ kann zusammen mit anderen Personen verantwortlich sein.
-- Leer (keine Person) bedeutet weiterhin „ich“; assignee_me gilt nur zusätzlich zu Personen.
alter table public.tasks add column assignee_me boolean not null default false;
