-- Resource & Scheduling Foundation V1
-- Source of truth: docs/FINAL_ARCHITECTURE_SOURCE_OF_TRUTH.md
--
-- Scope:
-- - Contractor/team resource records
-- - Runtime schedule assignments
-- - Conflict tracking for scheduling command center

do $$
begin
  create type resource_assignment_status as enum ('PLANNED', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type resource_conflict_status as enum ('NONE', 'CAPACITY_CONFLICT', 'TIME_CONFLICT', 'SKILL_MISMATCH', 'TERRITORY_MISMATCH');
exception
  when duplicate_object then null;
end $$;

create table if not exists resource_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_role user_role not null default 'contractor',
  territory text,
  daily_capacity integer not null default 1,
  skills jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists resource_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  project_stage_id uuid not null references project_stages(id) on delete cascade,
  resource_team_id uuid references resource_teams(id) on delete set null,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz,
  status resource_assignment_status not null default 'PLANNED',
  conflict_status resource_conflict_status not null default 'NONE',
  conflict_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_stage_id)
);

create index if not exists resource_teams_active_role_idx
  on resource_teams(is_active, owner_role);

create index if not exists resource_assignments_team_time_idx
  on resource_assignments(resource_team_id, scheduled_start, scheduled_end)
  where status in ('PLANNED', 'CONFIRMED', 'CHECKED_IN');

create index if not exists resource_assignments_project_stage_idx
  on resource_assignments(project_id, project_stage_id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array['resource_teams', 'resource_assignments']
  loop
    execute format('drop trigger if exists set_%I_updated_at on %I', table_name, table_name);
    execute format('create trigger set_%I_updated_at before update on %I for each row execute function set_updated_at()', table_name, table_name);
  end loop;
end $$;
