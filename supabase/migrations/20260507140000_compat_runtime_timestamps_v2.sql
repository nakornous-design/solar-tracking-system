-- Solar Project Tracking System
-- Compatibility patch V2 for legacy runtime table timestamps
-- Source of truth: docs/FINAL_ARCHITECTURE_SOURCE_OF_TRUTH.md

do $$
declare
  t text;
begin
  foreach t in array array[
    'project_stages',
    'project_checklists',
    'project_documents',
    'project_exceptions',
    'approval_requests'
  ]
  loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'created_at'
    ) then
      execute format('alter table %I add column created_at timestamptz not null default now();', t);
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'updated_at'
    ) then
      execute format('alter table %I add column updated_at timestamptz not null default now();', t);
    end if;
  end loop;
end $$;
