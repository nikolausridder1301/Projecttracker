-- Vereinfachung: Priorität nur noch „Wichtig“ (high) oder normal (medium),
-- Status ohne „In Arbeit“. Bestehende Werte werden übernommen.

update public.tasks set priority = 'medium' where priority = 'low';
update public.vendor_items set priority = 'medium' where priority = 'low';
update public.tasks set status = 'open' where status = 'in_progress';

alter table public.tasks drop constraint tasks_priority_check;
alter table public.tasks add constraint tasks_priority_check check (priority in ('high', 'medium'));
alter table public.tasks drop constraint tasks_status_check;
alter table public.tasks add constraint tasks_status_check check (status in ('open', 'blocked', 'done'));
alter table public.vendor_items drop constraint vendor_items_priority_check;
alter table public.vendor_items add constraint vendor_items_priority_check check (priority in ('high', 'medium'));
