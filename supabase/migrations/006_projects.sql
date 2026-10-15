-- Mehrere Projekte: neue Tabelle projects, alle Datentabellen bekommen project_id.
-- Bestehende Daten wandern ins Projekt „Tacto“.
-- Für bestehende Installationen (für Neuinstallationen ist 001/002 bereits angepasst).

create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short text not null,
  color text not null default '#2563c9',
  vendor_company_id uuid,
  sort integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger projects_updated_at before update on projects for each row execute function set_updated_at();
alter table projects enable row level security;
create policy projects_owner on projects for all to authenticated
  using ((select private.is_allowed())) with check ((select private.is_allowed()));
revoke all on projects from anon;
grant select, insert, update, delete on projects to authenticated;

do $$
declare
  pid uuid;
  t text;
begin
  insert into projects (name, short, color, vendor_company_id, sort)
  values ('Tacto', 'TAC', '#ea7a0c', (select id from companies where name = 'Tacto' and deleted_at is null limit 1), 0)
  returning id into pid;

  foreach t in array array[
    'companies', 'topics', 'link_categories', 'people', 'notes', 'tasks', 'links', 'vendor_items'
  ] loop
    execute format('alter table %I add column project_id uuid references projects (id)', t);
    execute format('update %I set project_id = %L', t, pid);
    execute format('alter table %I alter column project_id set not null', t);
    -- Übergangsweise Standardwert, damit die bisherige App-Version bis zum
    -- Deploy weiter speichern kann; wird mit 007 wieder entfernt.
    execute format('alter table %I alter column project_id set default %L', t, pid);
    execute format('create index on %I (project_id)', t);
  end loop;
end;
$$;

alter table projects add constraint projects_vendor_company_fk foreign key (vendor_company_id) references companies (id) on delete set null;
