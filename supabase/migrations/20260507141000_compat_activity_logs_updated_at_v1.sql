-- Solar Project Tracking System
-- Compatibility patch for legacy timestamp triggers
-- Source of truth: docs/FINAL_ARCHITECTURE_SOURCE_OF_TRUTH.md
--
-- Some early databases have set_updated_at triggers attached before timestamp
-- compatibility migrations were applied. Adding updated_at keeps those triggers
-- from breaking project metadata updates and audit inserts.

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'projects'
      and column_name = 'updated_at'
  ) then
    alter table projects
      add column updated_at timestamptz not null default now();
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'activity_logs'
      and column_name = 'updated_at'
  ) then
    alter table activity_logs
      add column updated_at timestamptz not null default now();
  end if;
end $$;
