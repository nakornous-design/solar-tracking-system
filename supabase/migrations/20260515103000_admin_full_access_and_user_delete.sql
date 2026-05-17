insert into role_permissions(role_code, permission_key, is_allowed)
select role_code, permission_key, true
from (
  values
    ('system_admin', 'users.delete'),
    ('system_admin', 'dashboard.view'),
    ('system_admin', 'projects.view'),
    ('system_admin', 'documents.view'),
    ('system_admin', 'billing.view'),
    ('system_admin', 'admin.view'),
    ('system_admin', 'danger_zone.view'),
    ('system_admin', 'projects.create'),
    ('system_admin', 'projects.edit'),
    ('system_admin', 'projects.delete'),
    ('system_admin', 'workflow.view'),
    ('system_admin', 'workflow.edit'),
    ('system_admin', 'workflow.publish'),
    ('system_admin', 'documents.upload'),
    ('system_admin', 'documents.verify'),
    ('system_admin', 'documents.delete'),
    ('system_admin', 'billing.edit'),
    ('system_admin', 'billing.approve'),
    ('system_admin', 'users.view'),
    ('system_admin', 'users.create'),
    ('system_admin', 'users.edit'),
    ('system_admin', 'roles.view'),
    ('system_admin', 'roles.create'),
    ('system_admin', 'roles.edit'),
    ('system_admin', 'permissions.edit'),
    ('system_admin', 'audit_logs.view'),
    ('system_admin', 'danger_zone.delete_project'),
    ('system_admin', 'danger_zone.cleanup_test_data'),
    ('system_admin', 'danger_zone.repair_metadata'),
    ('admin', 'dashboard.view'),
    ('admin', 'projects.view'),
    ('admin', 'documents.view'),
    ('admin', 'billing.view'),
    ('admin', 'admin.view'),
    ('admin', 'projects.create'),
    ('admin', 'projects.edit'),
    ('admin', 'workflow.view'),
    ('admin', 'workflow.edit'),
    ('admin', 'workflow.publish'),
    ('admin', 'documents.upload'),
    ('admin', 'documents.verify'),
    ('admin', 'billing.edit'),
    ('admin', 'billing.approve'),
    ('admin', 'users.view'),
    ('admin', 'users.create'),
    ('admin', 'users.edit'),
    ('admin', 'roles.view'),
    ('admin', 'roles.create'),
    ('admin', 'roles.edit'),
    ('admin', 'permissions.edit'),
    ('admin', 'audit_logs.view')
) as seed(role_code, permission_key)
on conflict (role_code, permission_key) do update set
  is_allowed = excluded.is_allowed,
  updated_at = now();

delete from role_permissions
where role_code = 'admin'
  and permission_key in ('projects.delete', 'danger_zone.delete_project', 'users.delete');
