-- Solar Project Tracking System
-- Foundation Schema V1
-- Source of truth: docs/FINAL_ARCHITECTURE_SOURCE_OF_TRUTH.md
--
-- Scope:
-- - Definition layer: workflow templates, versions, stages, transitions, checklists, required documents
-- - Runtime layer: projects, project stages, project checklists, project documents
-- - Governance: exceptions, approvals, activity logs
--
-- This migration is intentionally additive. It does not drop legacy tables such as
-- workflow_definitions or project_milestones while the app migrates to runtime workflow architecture.

create extension if not exists pgcrypto;

do $$
begin
  create type user_role as enum ('admin', 'exec', 'sales', 'ops', 'engineer', 'qa', 'contractor', 'finance');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type workflow_version_status as enum ('DRAFT', 'PUBLISHED', 'ARCHIVED');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type runtime_stage_status as enum ('PENDING', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'COMPLETED', 'SKIPPED', 'CANCELLED');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type transition_type as enum ('FORWARD', 'BACKWARD', 'REWORK', 'HOLD', 'CANCEL', 'OVERRIDE');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type sla_status as enum ('ON_TRACK', 'NEAR_SLA', 'OVER_SLA', 'SLA_PAUSED');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type gate_severity as enum ('HARD', 'SOFT', 'OVERRIDEABLE', 'INFO');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type document_status as enum ('REQUIRED', 'UPLOADED', 'PENDING_VERIFY', 'VERIFIED', 'REJECTED', 'SUPERSEDED');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type checklist_status as enum ('PENDING', 'PASSED', 'FAILED', 'WAIVED');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type exception_category as enum ('SLA', 'QA', 'BILLING', 'DOCUMENT', 'WORKFLOW', 'RESOURCE', 'SYSTEM');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type exception_severity as enum ('INFO', 'WARNING', 'HIGH', 'CRITICAL');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type exception_status as enum ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'WAIVED', 'CLOSED');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type approval_status as enum ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
exception
  when duplicate_object then null;
end $$;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role user_role not null default 'ops',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workflow_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  project_type text not null default 'RES-S',
  payment_type text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_templates_payment_type_check check (payment_type in ('CASH', 'LOAN'))
);

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workflow_templates' and column_name = 'code'
  ) then
    alter table workflow_templates add column code text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workflow_templates' and column_name = 'name'
  ) then
    alter table workflow_templates add column name text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workflow_templates' and column_name = 'project_type'
  ) then
    alter table workflow_templates add column project_type text not null default 'RES-S';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workflow_templates' and column_name = 'payment_type'
  ) then
    alter table workflow_templates add column payment_type text not null default 'CASH';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workflow_templates' and column_name = 'description'
  ) then
    alter table workflow_templates add column description text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workflow_templates' and column_name = 'is_active'
  ) then
    alter table workflow_templates add column is_active boolean not null default true;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workflow_templates' and column_name = 'created_at'
  ) then
    alter table workflow_templates add column created_at timestamptz not null default now();
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workflow_templates' and column_name = 'updated_at'
  ) then
    alter table workflow_templates add column updated_at timestamptz not null default now();
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workflow_templates' and column_name = 'template_name'
  ) then
    execute 'update workflow_templates set name = template_name where name is null and template_name is not null';
    execute 'update workflow_templates set template_name = name where template_name is null and name is not null';
    execute 'alter table workflow_templates alter column template_name drop not null';
  end if;

  update workflow_templates
  set
    name = coalesce(name, code, 'Workflow Template ' || left(id::text, 8)),
    project_type = coalesce(project_type, 'RES-S'),
    payment_type = coalesce(payment_type, 'CASH'),
    is_active = coalesce(is_active, true),
    created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, now())
  where name is null
    or project_type is null
    or payment_type is null
    or is_active is null
    or created_at is null
    or updated_at is null;

  update workflow_templates
  set code = upper(regexp_replace(coalesce(name, 'TEMPLATE-' || left(id::text, 8)), '[^A-Za-z0-9]+', '-', 'g'))
  where code is null;

  with ranked_templates as (
    select
      ctid,
      row_number() over (partition by code order by created_at, id) as duplicate_index
    from workflow_templates
  )
  update workflow_templates template
  set code = template.code || '-' || ranked_templates.duplicate_index::text
  from ranked_templates
  where template.ctid = ranked_templates.ctid
    and ranked_templates.duplicate_index > 1;

  alter table workflow_templates alter column code set not null;
  alter table workflow_templates alter column name set not null;
  alter table workflow_templates alter column project_type set not null;
  alter table workflow_templates alter column payment_type set not null;
  alter table workflow_templates alter column is_active set default true;
  alter table workflow_templates alter column created_at set default now();
  alter table workflow_templates alter column updated_at set default now();

  alter table workflow_templates
    drop constraint if exists workflow_templates_payment_type_check;

  alter table workflow_templates
    add constraint workflow_templates_payment_type_check
    check (payment_type in ('CASH', 'LOAN'));
end $$;

create unique index if not exists workflow_templates_code_key
  on workflow_templates (code);

create table if not exists workflow_versions (
  id uuid primary key default gen_random_uuid(),
  workflow_template_id uuid not null references workflow_templates(id) on delete restrict,
  version_number integer not null,
  name text not null,
  status workflow_version_status not null default 'DRAFT',
  is_active boolean not null default false,
  published_at timestamptz,
  published_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workflow_template_id, version_number)
);

create unique index if not exists workflow_versions_one_active_published_idx
  on workflow_versions (workflow_template_id)
  where status = 'PUBLISHED' and is_active = true;

create table if not exists workflow_stages (
  id uuid primary key default gen_random_uuid(),
  workflow_version_id uuid not null references workflow_versions(id) on delete cascade,
  code text not null,
  name text not null,
  order_index integer not null,
  owner_role user_role,
  sla_hours integer not null default 0,
  is_start boolean not null default false,
  is_terminal boolean not null default false,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workflow_version_id, code),
  unique (workflow_version_id, order_index)
);

create unique index if not exists workflow_stages_one_start_idx
  on workflow_stages (workflow_version_id)
  where is_start = true;

create table if not exists workflow_transitions (
  id uuid primary key default gen_random_uuid(),
  workflow_version_id uuid not null references workflow_versions(id) on delete cascade,
  from_stage_id uuid references workflow_stages(id) on delete cascade,
  to_stage_id uuid references workflow_stages(id) on delete cascade,
  type transition_type not null default 'FORWARD',
  name text,
  requires_approval boolean not null default false,
  gate_severity gate_severity not null default 'HARD',
  rule_config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_transitions_distinct_stage_check check (from_stage_id is null or to_stage_id is null or from_stage_id <> to_stage_id)
);

create table if not exists workflow_checklists (
  id uuid primary key default gen_random_uuid(),
  workflow_stage_id uuid not null references workflow_stages(id) on delete cascade,
  code text not null,
  label text not null,
  description text,
  is_required boolean not null default true,
  gate_severity gate_severity not null default 'HARD',
  order_index integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workflow_stage_id, code)
);

create table if not exists workflow_required_documents (
  id uuid primary key default gen_random_uuid(),
  workflow_stage_id uuid not null references workflow_stages(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  drive_folder_key text,
  is_required boolean not null default true,
  requires_verification boolean not null default true,
  gate_severity gate_severity not null default 'HARD',
  order_index integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workflow_stage_id, code)
);

create table if not exists installation_standards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  version text not null,
  status workflow_version_status not null default 'DRAFT',
  is_active boolean not null default false,
  effective_from date,
  published_at timestamptz,
  rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists installation_standards_one_active_idx
  on installation_standards (code)
  where status = 'PUBLISHED' and is_active = true;

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  customer_code text not null unique,
  customer_name text not null,
  customer_phone text,
  project_type text not null default 'RES-S',
  payment_type text not null default 'CASH',
  workflow_version_id uuid references workflow_versions(id) on delete restrict,
  applied_standard_id uuid references installation_standards(id) on delete restrict,
  current_stage_id uuid,
  status runtime_stage_status not null default 'PENDING',
  sla_status sla_status not null default 'ON_TRACK',
  google_drive_folder_id text,
  drive_metadata jsonb not null default '{}'::jsonb,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_payment_type_check check (payment_type in ('CASH', 'LOAN'))
);

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'customer_phone'
  ) then
    alter table projects add column customer_phone text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'project_type'
  ) then
    alter table projects add column project_type text not null default 'RES-S';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'payment_type'
  ) then
    alter table projects add column payment_type text not null default 'CASH';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'workflow_version_id'
  ) then
    alter table projects add column workflow_version_id uuid references workflow_versions(id) on delete restrict;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'applied_standard_id'
  ) then
    alter table projects add column applied_standard_id uuid references installation_standards(id) on delete restrict;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'current_stage_id'
  ) then
    alter table projects add column current_stage_id uuid;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'sla_status'
  ) then
    alter table projects add column sla_status sla_status not null default 'ON_TRACK';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'drive_metadata'
  ) then
    alter table projects add column drive_metadata jsonb not null default '{}'::jsonb;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'created_by'
  ) then
    alter table projects add column created_by uuid references profiles(id);
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'created_at'
  ) then
    alter table projects add column created_at timestamptz not null default now();
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'updated_at'
  ) then
    alter table projects add column updated_at timestamptz not null default now();
  end if;
end $$;

create table if not exists project_stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  workflow_stage_id uuid not null references workflow_stages(id) on delete restrict,
  order_index integer not null,
  code text not null,
  name text not null,
  owner_role user_role,
  assigned_to uuid references profiles(id),
  status runtime_stage_status not null default 'PENDING',
  sla_status sla_status not null default 'ON_TRACK',
  started_at timestamptz,
  due_at timestamptz,
  completed_at timestamptz,
  blocked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, order_index),
  unique (project_id, workflow_stage_id)
);

alter table projects
  drop constraint if exists projects_current_stage_id_fkey;

alter table projects
  add constraint projects_current_stage_id_fkey
  foreign key (current_stage_id) references project_stages(id) on delete set null;

create table if not exists project_checklists (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  project_stage_id uuid not null references project_stages(id) on delete cascade,
  workflow_checklist_id uuid not null references workflow_checklists(id) on delete restrict,
  code text not null,
  label text not null,
  is_required boolean not null default true,
  gate_severity gate_severity not null default 'HARD',
  status checklist_status not null default 'PENDING',
  completed_by uuid references profiles(id),
  completed_at timestamptz,
  waiver_approval_id uuid,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_stage_id, workflow_checklist_id)
);

create table if not exists project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  project_stage_id uuid references project_stages(id) on delete cascade,
  workflow_required_document_id uuid references workflow_required_documents(id) on delete restrict,
  code text not null,
  name text not null,
  is_required boolean not null default true,
  requires_verification boolean not null default true,
  gate_severity gate_severity not null default 'HARD',
  status document_status not null default 'REQUIRED',
  version_number integer not null default 1,
  supersedes_document_id uuid references project_documents(id),
  google_drive_file_id text,
  google_drive_folder_id text,
  web_view_link text,
  mime_type text,
  file_name text,
  uploaded_by uuid references profiles(id),
  uploaded_at timestamptz,
  verified_by uuid references profiles(id),
  verified_at timestamptz,
  rejection_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists project_exceptions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  project_stage_id uuid references project_stages(id) on delete set null,
  category exception_category not null,
  severity exception_severity not null default 'WARNING',
  status exception_status not null default 'OPEN',
  title text not null,
  description text,
  owner_role user_role,
  assigned_to uuid references profiles(id),
  detected_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  waived_at timestamptz,
  closed_at timestamptz,
  resolution_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists approval_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  project_stage_id uuid references project_stages(id) on delete set null,
  exception_id uuid references project_exceptions(id) on delete set null,
  requested_by uuid references profiles(id),
  approver_id uuid references profiles(id),
  type text not null,
  status approval_status not null default 'PENDING',
  reason text not null,
  evidence jsonb not null default '[]'::jsonb,
  scope jsonb not null default '{}'::jsonb,
  decision_reason text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table project_checklists
  drop constraint if exists project_checklists_waiver_approval_id_fkey;

alter table project_checklists
  add constraint project_checklists_waiver_approval_id_fkey
  foreign key (waiver_approval_id) references approval_requests(id) on delete set null;

create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  project_stage_id uuid references project_stages(id) on delete set null,
  actor_id uuid references profiles(id),
  action text not null,
  reason text,
  evidence jsonb not null default '[]'::jsonb,
  before_state jsonb,
  after_state jsonb,
  related_entity_type text,
  related_entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists workflow_versions_template_idx on workflow_versions(workflow_template_id);
create index if not exists workflow_stages_version_order_idx on workflow_stages(workflow_version_id, order_index);
create index if not exists workflow_transitions_version_from_idx on workflow_transitions(workflow_version_id, from_stage_id);
create index if not exists workflow_checklists_stage_idx on workflow_checklists(workflow_stage_id);
create index if not exists workflow_required_documents_stage_idx on workflow_required_documents(workflow_stage_id);
create index if not exists projects_customer_code_idx on projects(customer_code);
create index if not exists projects_runtime_status_idx on projects(status, sla_status);
create index if not exists project_stages_project_order_idx on project_stages(project_id, order_index);
create index if not exists project_stages_status_due_idx on project_stages(status, due_at);
create index if not exists project_checklists_stage_status_idx on project_checklists(project_stage_id, status);
create index if not exists project_documents_project_status_idx on project_documents(project_id, status);
create index if not exists project_documents_stage_status_idx on project_documents(project_stage_id, status);
create index if not exists project_exceptions_project_status_idx on project_exceptions(project_id, status, severity);
create index if not exists approval_requests_project_status_idx on approval_requests(project_id, status);
create index if not exists activity_logs_project_created_idx on activity_logs(project_id, created_at desc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'workflow_templates',
    'workflow_versions',
    'workflow_stages',
    'workflow_transitions',
    'workflow_checklists',
    'workflow_required_documents',
    'installation_standards',
    'projects',
    'project_stages',
    'project_checklists',
    'project_documents',
    'project_exceptions',
    'approval_requests'
  ]
  loop
    execute format('drop trigger if exists set_%I_updated_at on %I', table_name, table_name);
    execute format('create trigger set_%I_updated_at before update on %I for each row execute function set_updated_at()', table_name, table_name);
  end loop;
end $$;

-- RLS is intentionally not enabled in this foundation migration.
-- Auth and role-based policies should be introduced in the authentication/security phase
-- so the current MVP does not lose access before Supabase Auth is wired into the app.
