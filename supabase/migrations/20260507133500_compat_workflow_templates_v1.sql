-- Solar Project Tracking System
-- Compatibility patch for legacy workflow_templates
-- Source of truth: docs/FINAL_ARCHITECTURE_SOURCE_OF_TRUTH.md
--
-- Some early local databases already had workflow_templates before the runtime
-- architecture migration. create table if not exists does not add new columns,
-- so this patch upgrades the legacy table before seed data runs.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workflow_templates' and column_name = 'id'
  ) then
    alter table workflow_templates add column id uuid default gen_random_uuid();
    update workflow_templates set id = gen_random_uuid() where id is null;
    alter table workflow_templates alter column id set not null;
  end if;

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
