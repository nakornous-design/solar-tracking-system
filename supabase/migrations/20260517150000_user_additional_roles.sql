create table if not exists user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  role_id text not null references roles(role_code) on delete cascade,
  assigned_by uuid references profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  expires_at timestamptz,
  reason text,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, role_id)
);

create index if not exists user_roles_user_id_idx on user_roles(user_id);
create index if not exists user_roles_role_id_idx on user_roles(role_id);
create index if not exists user_roles_active_idx on user_roles(user_id, role_id)
  where revoked_at is null;

do $$
begin
  if to_regprocedure('set_updated_at()') is not null then
    drop trigger if exists set_user_roles_updated_at on user_roles;
    create trigger set_user_roles_updated_at before update on user_roles for each row execute function set_updated_at();
  end if;
end $$;
