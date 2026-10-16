-- Projecttracker – Datenbankschema (SPEC.md Abschnitt 5)
-- Im Supabase-Dashboard unter "SQL Editor" einmal komplett ausführen
-- (oder per Supabase-Connector als Migration einspielen).

-- ---------------------------------------------------------------------------
-- Hilfsfunktion: updated_at automatisch pflegen
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------
-- Projekte: alle Datentabellen hängen über project_id an genau einem Projekt
create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short text not null,
  color text not null default '#2563c9',
  -- Firma (externer Partner), deren Anbieter-Bereich im Menü erscheint; null = aus
  vendor_company_id uuid,
  sort integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table companies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id),
  name text not null,
  short text not null,
  color text not null default '#5a6577',
  logo_key text,
  is_overarching boolean not null default false,
  -- Externer Partner (z. B. Software-Anbieter): nicht in "Alle Gesellschaften"
  is_external boolean not null default false,
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
  project_id uuid not null references projects (id),
  name text not null,
  sort integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table link_categories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id),
  name text not null,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table people (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id),
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
  project_id uuid not null references projects (id),
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
  project_id uuid not null references projects (id),
  title text not null,
  description text not null default '',
  company_id uuid not null references companies (id),
  topic_id uuid references topics (id),
  assignee_person_ids uuid[] not null default '{}', -- leer = ich selbst
  status text not null default 'open' check (status in ('open', 'blocked', 'done')),
  blocked_reason text not null default '',
  priority text not null default 'medium' check (priority in ('high', 'medium')),
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
  project_id uuid not null references projects (id),
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

-- Tacto-Punkte: Feature Requests, Fragen, Bugs, Best Practices, Fails & Claims
create table vendor_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id),
  title text not null,
  body text not null default '',
  category text not null check (category in ('feature', 'question', 'bug', 'best_practice', 'claim')),
  status text not null default '',
  -- leer = betrifft alle Gesellschaften
  company_ids uuid[] not null default '{}',
  topic_id uuid references topics (id),
  priority text not null default 'medium' check (priority in ('high', 'medium')),
  contact_person_id uuid references people (id),
  ticket text not null default '',
  answer text not null default '',
  promised text not null default '',
  actual text not null default '',
  evidence_url text not null default '',
  reported_at date,
  status_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Verlauf der Firmen-Ampel: jede Änderung mit Begründung
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

-- Fortschritt je Meilenstein (Thema) und Firma
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

create table app_meta (
  id uuid primary key default gen_random_uuid(),
  last_export_at timestamptz,
  -- Reihenfolge der Menüpunkte (Drag-and-Drop)
  nav_order text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table projects add constraint projects_vendor_company_fk
  foreign key (vendor_company_id) references companies (id) on delete set null;

create index on companies (project_id);
create index on topics (project_id);
create index on link_categories (project_id);
create index on people (project_id);
create index on notes (project_id);
create index on tasks (project_id);
create index on links (project_id);
create index on vendor_items (project_id);
create index on tasks (company_id);
create index on tasks using gin (assignee_person_ids);
create index on tasks (group_id);
create index on notes (company_id);
create index on links (company_id);
create index on task_followups (task_id);
create index on vendor_items (category);
create index on traffic_history (company_id);
create index on traffic_history (project_id);
create index on milestone_status (project_id);
create index on milestone_status (company_id);

-- ---------------------------------------------------------------------------
-- Zugriff: nur freigeschaltete Nutzer (Einzelnutzer-Betrieb, SPEC.md 3).
-- Ein Login allein reicht nicht – die User-ID muss in allowed_users stehen.
-- So bleiben die Daten geschützt, selbst wenn die Registrierung
-- versehentlich eingeschaltet wäre. Eintrag siehe ANLEITUNG.md.
-- ---------------------------------------------------------------------------
create table allowed_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table allowed_users enable row level security;
revoke all on allowed_users from anon, authenticated;

-- Prüffunktion liegt im nicht per API erreichbaren Schema "private".
-- allowed_users hat bewusst keine Policy: über die API weder les- noch schreibbar.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.allowed_users where user_id = auth.uid())
$$;
revoke all on function private.is_allowed() from public, anon;
grant execute on function private.is_allowed() to authenticated;

-- updated_at-Trigger und Row Level Security für alle Datentabellen.
-- Der anon key allein sieht nichts.
do $$
declare
  t text;
begin
  foreach t in array array[
    'projects', 'companies', 'topics', 'link_categories', 'people', 'notes', 'tasks',
    'task_followups', 'links', 'attachments', 'app_meta', 'vendor_items', 'traffic_history', 'milestone_status'
  ] loop
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()', t || '_updated_at', t);
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for all to authenticated using ((select private.is_allowed())) with check ((select private.is_allowed()))', t || '_owner', t);
    execute format('revoke all on %I from anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Keep-alive (SPEC.md 7.3): liest keine Daten, nur für den Ping-Workflow.
-- ---------------------------------------------------------------------------
create or replace function ping() returns integer
language sql stable set search_path = '' as $$ select 1 $$;

grant execute on function ping() to anon;
