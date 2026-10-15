-- Verlauf der Firmen-Ampel: jede Änderung mit Begründung.
create table traffic_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id),
  company_id uuid not null references companies (id) on delete cascade,
  from_light text check (from_light in ('green', 'yellow', 'red')),
  to_light text not null check (to_light in ('green', 'yellow', 'red')),
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on traffic_history (company_id);
create index on traffic_history (project_id);

create trigger traffic_history_updated_at before update on traffic_history for each row execute function set_updated_at();
alter table traffic_history enable row level security;
create policy traffic_history_owner on traffic_history for all to authenticated
  using ((select private.is_allowed())) with check ((select private.is_allowed()));
revoke all on traffic_history from anon;
grant select, insert, update, delete on traffic_history to authenticated;
