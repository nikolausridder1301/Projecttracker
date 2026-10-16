-- Die eigene Person („Ich“ als echter Kontakt): Nikolaus Ridder bei der Holding, je Projekt.
alter table public.people add column is_me boolean not null default false;

insert into public.people (project_id, name, company_id, role, email, phone, active, is_me)
select
  p.id,
  'Nikolaus Ridder',
  (select c.id from public.companies c
    where c.project_id = p.id and c.is_overarching and c.deleted_at is null
    order by c.sort limit 1),
  '', '', '', true, true
from public.projects p
where not exists (select 1 from public.people x where x.project_id = p.id and x.is_me);
