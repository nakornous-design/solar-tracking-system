insert into roles(role_code, role_name, role_group, description, is_system_role, is_active)
values (
  'project_admin',
  'Project Admin',
  'Admin Access',
  'Full project operations access: create projects, create Drive folders, view/upload/verify documents, manage QA, billing, scheduling, resources, approvals, exceptions, and notifications. Cannot delete projects, delete users, or edit/publish workflow definitions.',
  false,
  true
)
on conflict (role_code) do update set
  role_name = excluded.role_name,
  role_group = excluded.role_group,
  description = excluded.description,
  is_system_role = false,
  is_active = true,
  updated_at = now();

insert into role_permissions(role_code, permission_key, is_allowed)
select 'project_admin', permission_key, true
from (
  values
    ('dashboard.view'),
    ('projects.view'),
    ('projects.create'),
    ('projects.edit'),
    ('projects.transition'),
    ('documents.view'),
    ('documents.upload'),
    ('documents.verify'),
    ('field.check_in'),
    ('qa.view'),
    ('qa.edit'),
    ('billing.view'),
    ('billing.edit'),
    ('billing.approve'),
    ('approvals.view'),
    ('approvals.decide'),
    ('exceptions.view'),
    ('exceptions.edit'),
    ('resources.view'),
    ('resources.edit'),
    ('schedule.view'),
    ('schedule.edit'),
    ('workflow.view'),
    ('notifications.view'),
    ('notifications.edit'),
    ('admin.view'),
    ('users.view'),
    ('roles.view'),
    ('audit_logs.view')
) as permissions(permission_key)
on conflict (role_code, permission_key) do update set
  is_allowed = excluded.is_allowed,
  updated_at = now();

delete from role_permissions
where role_code = 'project_admin'
  and permission_key in (
    'projects.delete',
    'documents.delete',
    'users.create',
    'users.edit',
    'users.delete',
    'roles.create',
    'roles.edit',
    'permissions.edit',
    'workflow.edit',
    'workflow.publish',
    'danger_zone.view',
    'danger_zone.delete_project',
    'danger_zone.cleanup_test_data',
    'danger_zone.repair_metadata'
  );
