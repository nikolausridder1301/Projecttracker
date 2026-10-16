-- Mehrere Firmen je Aufgabe, Notiz und Link; mehrere Ansprechpartner je Anbieter-Punkt.
-- Schritt 1 (vor dem Deploy): neue Spalten anlegen und befüllen. Die alten bleiben
-- vorerst, werden aber optional, damit die neue App ohne sie speichern kann.

alter table public.tasks add column company_ids uuid[] not null default '{}';
alter table public.notes add column company_ids uuid[] not null default '{}';
alter table public.links add column company_ids uuid[] not null default '{}';
alter table public.vendor_items add column contact_person_ids uuid[] not null default '{}';

update public.tasks set company_ids = array[company_id] where company_id is not null;
update public.notes set company_ids = array[company_id] where company_id is not null;
update public.links set company_ids = array[company_id] where company_id is not null;
update public.vendor_items set contact_person_ids = array[contact_person_id] where contact_person_id is not null;

alter table public.tasks alter column company_id drop not null;
alter table public.notes alter column company_id drop not null;
alter table public.links alter column company_id drop not null;

create index on public.tasks using gin (company_ids);
create index on public.notes using gin (company_ids);
create index on public.links using gin (company_ids);
