-- Fortschritt je Meilenstein (Thema) und Firma.
create table milestone_status (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id),
  topic_id uuid not null references topics (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  status text not null default 'not_started'
    check (status in ('not_started', 'on_track', 'at_risk', 'delayed', 'done', 'n_a')),
  target_date date,
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (topic_id, company_id)
);
create index on milestone_status (project_id);
create index on milestone_status (company_id);

create trigger milestone_status_updated_at before update on milestone_status for each row execute function set_updated_at();
alter table milestone_status enable row level security;
create policy milestone_status_owner on milestone_status for all to authenticated
  using ((select private.is_allowed())) with check ((select private.is_allowed()));
revoke all on milestone_status from anon;
grant select, insert, update, delete on milestone_status to authenticated;
