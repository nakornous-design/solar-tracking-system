-- Solar Project Tracking System
-- Compatibility patch for legacy runtime table timestamps
-- Source of truth: docs/FINAL_ARCHITECTURE_SOURCE_OF_TRUTH.md
--
-- Early local databases may have existing runtime tables before the foundation
-- migration. The foundation trigger set_updated_at requires updated_at to exist.

do $$
begin
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

drop trigger if exists set_projects_updated_at on projects;
create trigger set_projects_updated_at
before update on projects
for each row execute function set_updated_at();
