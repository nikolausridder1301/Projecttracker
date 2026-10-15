-- Projecttracker – Datenbankschema (SPEC.md Abschnitt 5)
-- Im Supabase-Dashboard unter "SQL Editor" einmal komplett ausführen.

-- ---------------------------------------------------------------------------
-- Hilfsfunktion: updated_at automatisch pflegen
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short text not null,
  color text not null default '#5a6577',
  logo_key text,
  is_overarching boolean not null default false,
  traffic_light text not null default 'green' check (traffic_light in ('green', 'yellow', 'red')),
  traffic_comment text not null default '',
  traffic_changed_at timestamptz,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table topics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table link_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_id uuid references companies (id),
  role text not null default '',
  email text not null default '',
  phone text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  kind text not null default 'note' check (kind in ('note', 'meeting', 'decision')),
  company_id uuid not null references companies (id),
  topic_id uuid references topics (id),
  meeting_date date,
  participant_ids uuid[] not null default '{}',
  participants_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  company_id uuid not null references companies (id),
  topic_id uuid references topics (id),
  assignee_person_id uuid references people (id),
  status text not null default 'open' check (status in ('open', 'in_progress', 'blocked', 'done')),
  blocked_reason text not null default '',
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  due_date date,
  follow_up_date date,
  done_at timestamptz,
  checklist jsonb not null default '[]',
  group_id uuid,
  source_note_id uuid references notes (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint blocked_needs_reason check (status <> 'blocked' or length(trim(blocked_reason)) > 0)
);

create table task_followups (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks (id) on delete cascade,
  date date not null default current_date,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table links (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null check (url ~* '^https?://'),
  company_id uuid not null references companies (id),
  topic_id uuid references topics (id),
  category_id uuid references link_categories (id),
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table attachments (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references links (id) on delete cascade,
  task_id uuid references tasks (id) on delete cascade,
  note_id uuid references notes (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint exactly_one_target check ((task_id is null) <> (note_id is null))
);

create table app_meta (
  id uuid primary key default gen_random_uuid(),
  last_export_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index on tasks (company_id);
create index on tasks (assignee_person_id);
create index on tasks (group_id);
create index on notes (company_id);
create index on links (company_id);
create index on task_followups (task_id);

-- ---------------------------------------------------------------------------
-- updated_at-Trigger und Row Level Security für alle Tabellen
-- Nur eingeloggte Nutzer (es gibt genau einen) dürfen lesen und schreiben.
-- Der anon key allein sieht nichts.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'companies', 'topics', 'link_categories', 'people', 'notes', 'tasks',
    'task_followups', 'links', 'attachments', 'app_meta'
  ] loop
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()', t || '_updated_at', t);
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for all to authenticated using (true) with check (true)', t || '_owner', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Keep-alive (SPEC.md 7.3): liest keine Daten, nur für den Ping-Workflow.
-- ---------------------------------------------------------------------------
create or replace function ping() returns integer
language sql stable as $$ select 1 $$;

grant execute on function ping() to anon;
