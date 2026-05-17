alter table profiles alter column role drop default;
alter table profiles alter column role type text using role::text;
alter table profiles alter column role set default 'ops';

alter table workflow_stages alter column owner_role type text using owner_role::text;
alter table project_stages alter column owner_role type text using owner_role::text;
alter table project_exceptions alter column owner_role type text using owner_role::text;
alter table notifications alter column recipient_role type text using recipient_role::text;
alter table resource_teams alter column owner_role drop default;
alter table resource_teams alter column owner_role type text using owner_role::text;
alter table resource_teams alter column owner_role set default 'contractor';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_role_roles_fkey'
  ) then
    alter table profiles
      add constraint profiles_role_roles_fkey
      foreign key (role) references roles(role_code) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'workflow_stages_owner_role_roles_fkey'
  ) then
    alter table workflow_stages
      add constraint workflow_stages_owner_role_roles_fkey
      foreign key (owner_role) references roles(role_code) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'project_stages_owner_role_roles_fkey'
  ) then
    alter table project_stages
      add constraint project_stages_owner_role_roles_fkey
      foreign key (owner_role) references roles(role_code) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'project_exceptions_owner_role_roles_fkey'
  ) then
    alter table project_exceptions
      add constraint project_exceptions_owner_role_roles_fkey
      foreign key (owner_role) references roles(role_code) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'notifications_recipient_role_roles_fkey'
  ) then
    alter table notifications
      add constraint notifications_recipient_role_roles_fkey
      foreign key (recipient_role) references roles(role_code) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'resource_teams_owner_role_roles_fkey'
  ) then
    alter table resource_teams
      add constraint resource_teams_owner_role_roles_fkey
      foreign key (owner_role) references roles(role_code) not valid;
  end if;
end $$;

insert into role_permissions(role_code, permission_key, is_allowed)
select 'system_admin', permission_key, true
from (
  values
    ('dashboard.view'),
    ('projects.view'), ('projects.create'), ('projects.edit'), ('projects.transition'), ('projects.delete'),
    ('documents.view'), ('documents.upload'), ('documents.verify'), ('documents.delete'),
    ('field.check_in'),
    ('qa.view'), ('qa.edit'),
    ('billing.view'), ('billing.edit'), ('billing.approve'),
    ('approvals.view'), ('approvals.decide'),
    ('exceptions.view'), ('exceptions.edit'),
    ('resources.view'), ('resources.edit'),
    ('schedule.view'), ('schedule.edit'),
    ('workflow.view'), ('workflow.edit'), ('workflow.publish'),
    ('notifications.view'), ('notifications.edit'),
    ('admin.view'),
    ('users.view'), ('users.create'), ('users.edit'), ('users.delete'),
    ('roles.view'), ('roles.create'), ('roles.edit'), ('permissions.edit'), ('audit_logs.view'),
    ('danger_zone.view'), ('danger_zone.delete_project'), ('danger_zone.cleanup_test_data'), ('danger_zone.repair_metadata')
) as permissions(permission_key)
on conflict (role_code, permission_key) do update set
  is_allowed = excluded.is_allowed,
  updated_at = now();

insert into role_permissions(role_code, permission_key, is_allowed)
select 'admin', permission_key, true
from (
  values
    ('dashboard.view'),
    ('projects.view'), ('projects.create'), ('projects.edit'), ('projects.transition'),
    ('documents.view'), ('documents.upload'), ('documents.verify'),
    ('field.check_in'),
    ('qa.view'), ('qa.edit'),
    ('billing.view'), ('billing.edit'), ('billing.approve'),
    ('approvals.view'), ('approvals.decide'),
    ('exceptions.view'), ('exceptions.edit'),
    ('resources.view'), ('resources.edit'),
    ('schedule.view'), ('schedule.edit'),
    ('workflow.view'), ('workflow.edit'), ('workflow.publish'),
    ('notifications.view'), ('notifications.edit'),
    ('admin.view'),
    ('users.view'), ('users.create'), ('users.edit'),
    ('roles.view'), ('roles.create'), ('roles.edit'), ('permissions.edit'), ('audit_logs.view')
) as permissions(permission_key)
on conflict (role_code, permission_key) do update set
  is_allowed = excluded.is_allowed,
  updated_at = now();

delete from role_permissions
where role_code = 'admin'
  and permission_key in (
    'projects.delete',
    'documents.delete',
    'users.delete',
    'danger_zone.view',
    'danger_zone.delete_project',
    'danger_zone.cleanup_test_data',
    'danger_zone.repair_metadata'
  );

insert into role_permissions(role_code, permission_key, is_allowed)
select role_code, permission_key, true
from (
  values
    ('supervisor', 'dashboard.view'), ('supervisor', 'projects.view'), ('supervisor', 'projects.edit'), ('supervisor', 'projects.transition'), ('supervisor', 'documents.view'), ('supervisor', 'documents.upload'), ('supervisor', 'documents.verify'), ('supervisor', 'qa.view'), ('supervisor', 'billing.view'), ('supervisor', 'approvals.view'), ('supervisor', 'approvals.decide'), ('supervisor', 'exceptions.view'), ('supervisor', 'exceptions.edit'), ('supervisor', 'resources.view'), ('supervisor', 'schedule.view'), ('supervisor', 'schedule.edit'), ('supervisor', 'notifications.view'), ('supervisor', 'notifications.edit'),
    ('exec', 'dashboard.view'), ('exec', 'projects.view'), ('exec', 'documents.view'), ('exec', 'qa.view'), ('exec', 'billing.view'), ('exec', 'approvals.view'), ('exec', 'exceptions.view'), ('exec', 'resources.view'), ('exec', 'schedule.view'), ('exec', 'notifications.view'),
    ('sales', 'dashboard.view'), ('sales', 'projects.view'), ('sales', 'projects.create'), ('sales', 'projects.edit'), ('sales', 'projects.transition'), ('sales', 'documents.view'), ('sales', 'documents.upload'), ('sales', 'approvals.view'), ('sales', 'notifications.view'), ('sales', 'notifications.edit'),
    ('ops', 'dashboard.view'), ('ops', 'projects.view'), ('ops', 'projects.edit'), ('ops', 'projects.transition'), ('ops', 'documents.view'), ('ops', 'documents.upload'), ('ops', 'field.check_in'), ('ops', 'approvals.view'), ('ops', 'exceptions.view'), ('ops', 'exceptions.edit'), ('ops', 'resources.view'), ('ops', 'resources.edit'), ('ops', 'schedule.view'), ('ops', 'schedule.edit'), ('ops', 'workflow.view'), ('ops', 'notifications.view'), ('ops', 'notifications.edit'),
    ('engineer', 'dashboard.view'), ('engineer', 'projects.view'), ('engineer', 'projects.edit'), ('engineer', 'projects.transition'), ('engineer', 'documents.view'), ('engineer', 'documents.upload'), ('engineer', 'documents.verify'), ('engineer', 'approvals.view'), ('engineer', 'workflow.view'), ('engineer', 'notifications.view'),
    ('qa', 'dashboard.view'), ('qa', 'projects.view'), ('qa', 'projects.edit'), ('qa', 'projects.transition'), ('qa', 'documents.view'), ('qa', 'documents.verify'), ('qa', 'qa.view'), ('qa', 'qa.edit'), ('qa', 'exceptions.view'), ('qa', 'exceptions.edit'), ('qa', 'notifications.view'), ('qa', 'notifications.edit'),
    ('contractor', 'projects.view'), ('contractor', 'projects.edit'), ('contractor', 'projects.transition'), ('contractor', 'documents.view'), ('contractor', 'documents.upload'), ('contractor', 'field.check_in'), ('contractor', 'schedule.view'), ('contractor', 'notifications.view'), ('contractor', 'notifications.edit'),
    ('finance', 'dashboard.view'), ('finance', 'projects.view'), ('finance', 'projects.edit'), ('finance', 'projects.transition'), ('finance', 'documents.view'), ('finance', 'documents.verify'), ('finance', 'billing.view'), ('finance', 'billing.edit'), ('finance', 'billing.approve'), ('finance', 'approvals.view'), ('finance', 'exceptions.view'), ('finance', 'exceptions.edit'), ('finance', 'notifications.view'), ('finance', 'notifications.edit'),
    ('rcm', 'dashboard.view'), ('rcm', 'projects.view'), ('rcm', 'projects.edit'), ('rcm', 'projects.transition'), ('rcm', 'documents.view'), ('rcm', 'documents.upload'), ('rcm', 'billing.view'), ('rcm', 'resources.view'), ('rcm', 'resources.edit'), ('rcm', 'schedule.view'), ('rcm', 'schedule.edit'), ('rcm', 'notifications.view'), ('rcm', 'notifications.edit'),
    ('sbc', 'dashboard.view'), ('sbc', 'projects.view'), ('sbc', 'projects.create'), ('sbc', 'projects.edit'), ('sbc', 'projects.transition'), ('sbc', 'documents.view'), ('sbc', 'documents.upload'), ('sbc', 'documents.verify'), ('sbc', 'field.check_in'), ('sbc', 'qa.view'), ('sbc', 'qa.edit'), ('sbc', 'billing.view'), ('sbc', 'billing.edit'), ('sbc', 'approvals.view'), ('sbc', 'exceptions.view'), ('sbc', 'exceptions.edit'), ('sbc', 'resources.view'), ('sbc', 'schedule.view'), ('sbc', 'schedule.edit'), ('sbc', 'notifications.view'), ('sbc', 'notifications.edit')
) as permissions(role_code, permission_key)
on conflict (role_code, permission_key) do update set
  is_allowed = excluded.is_allowed,
  updated_at = now();
