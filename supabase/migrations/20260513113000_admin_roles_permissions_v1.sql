alter table profiles add column if not exists team_department text;
alter table profiles add column if not exists notes text;

create table if not exists roles (
  role_code text primary key,
  role_name text not null,
  role_group text not null,
  description text,
  is_system_role boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_code text not null references roles(role_code) on delete cascade,
  permission_key text not null,
  is_allowed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(role_code, permission_key)
);

do $$
begin
  if to_regprocedure('set_updated_at()') is not null then
    drop trigger if exists set_profiles_updated_at on profiles;
    create trigger set_profiles_updated_at before update on profiles for each row execute function set_updated_at();

    drop trigger if exists set_roles_updated_at on roles;
    create trigger set_roles_updated_at before update on roles for each row execute function set_updated_at();

    drop trigger if exists set_role_permissions_updated_at on role_permissions;
    create trigger set_role_permissions_updated_at before update on role_permissions for each row execute function set_updated_at();
  end if;
end $$;

insert into roles(role_code, role_name, role_group, description, is_system_role, is_active)
select *
from (
  values
    ('system_admin', 'System Admin', 'System Access', 'สิทธิ์สูงสุดของระบบ เห็นเมนูขั้นสูงและงานที่มีความเสี่ยง', true, true),
    ('admin', 'ผู้ดูแลระบบ', 'Admin Access', 'ดูแลผู้ใช้ workflow และการตั้งค่าทั่วไป', true, true),
    ('supervisor', 'supervisor', 'Management / Oversight', 'ดูแลภาพรวมการปฏิบัติงาน', false, true),
    ('exec', 'ผู้บริหาร', 'Management / Oversight', 'ดูข้อมูลภาพรวมสำหรับผู้บริหาร', false, true),
    ('sales', 'ฝ่ายขาย', 'Operational Roles', 'งาน Lead, Quotation และลูกค้า', false, true),
    ('ops', 'ทีมปฏิบัติการ', 'Operational Roles', 'งาน Scheduling และติดตามงาน', false, true),
    ('engineer', 'วิศวกรรม', 'Operational Roles', 'งาน Survey และ TSSR', false, true),
    ('qa', 'ตรวจคุณภาพ', 'Operational Roles', 'งานตรวจสอบคุณภาพ', false, true),
    ('contractor', 'ผู้รับเหมา', 'Operational Roles', 'งานภาคสนามและอัปโหลดรูป/เอกสาร', false, true),
    ('finance', 'การเงิน', 'Operational Roles', 'งาน Payment และ Billing', false, true),
    ('rcm', 'rcm', 'Operational Roles', 'งาน resource และ material', false, true),
    ('sbc', 'SBC - Solar Champion Business', 'Operational Roles', 'Solar Champion Business role', false, true)
) as seed(role_code, role_name, role_group, description, is_system_role, is_active)
where not exists (select 1 from roles);

insert into role_permissions(role_code, permission_key, is_allowed)
select role_code, permission_key, true
from (
  values
    ('system_admin', 'dashboard.view'), ('system_admin', 'projects.view'), ('system_admin', 'documents.view'), ('system_admin', 'billing.view'), ('system_admin', 'admin.view'), ('system_admin', 'danger_zone.view'),
    ('system_admin', 'projects.create'), ('system_admin', 'projects.edit'), ('system_admin', 'projects.delete'),
    ('system_admin', 'workflow.view'), ('system_admin', 'workflow.edit'), ('system_admin', 'workflow.publish'),
    ('system_admin', 'documents.upload'), ('system_admin', 'documents.verify'), ('system_admin', 'documents.delete'),
    ('system_admin', 'billing.edit'), ('system_admin', 'billing.approve'),
    ('system_admin', 'users.view'), ('system_admin', 'users.create'), ('system_admin', 'users.edit'), ('system_admin', 'roles.view'), ('system_admin', 'roles.create'), ('system_admin', 'roles.edit'), ('system_admin', 'permissions.edit'), ('system_admin', 'audit_logs.view'),
    ('system_admin', 'danger_zone.delete_project'), ('system_admin', 'danger_zone.cleanup_test_data'), ('system_admin', 'danger_zone.repair_metadata'),
    ('admin', 'dashboard.view'), ('admin', 'projects.view'), ('admin', 'documents.view'), ('admin', 'billing.view'), ('admin', 'admin.view'),
    ('admin', 'projects.create'), ('admin', 'projects.edit'), ('admin', 'workflow.view'), ('admin', 'workflow.edit'), ('admin', 'workflow.publish'),
    ('admin', 'documents.upload'), ('admin', 'documents.verify'), ('admin', 'billing.edit'), ('admin', 'billing.approve'),
    ('admin', 'users.view'), ('admin', 'users.create'), ('admin', 'users.edit'), ('admin', 'roles.view'), ('admin', 'roles.create'), ('admin', 'roles.edit'), ('admin', 'permissions.edit'), ('admin', 'audit_logs.view'),
    ('sales', 'dashboard.view'), ('sales', 'projects.view'), ('sales', 'projects.create'), ('sales', 'projects.edit'), ('sales', 'documents.view'), ('sales', 'documents.upload'),
    ('ops', 'dashboard.view'), ('ops', 'projects.view'), ('ops', 'projects.edit'), ('ops', 'documents.view'), ('ops', 'documents.upload'), ('ops', 'workflow.view'),
    ('engineer', 'dashboard.view'), ('engineer', 'projects.view'), ('engineer', 'documents.view'), ('engineer', 'documents.upload'), ('engineer', 'documents.verify'), ('engineer', 'workflow.view'),
    ('qa', 'dashboard.view'), ('qa', 'projects.view'), ('qa', 'documents.view'), ('qa', 'documents.verify'),
    ('contractor', 'projects.view'), ('contractor', 'documents.upload'),
    ('finance', 'dashboard.view'), ('finance', 'projects.view'), ('finance', 'billing.view'), ('finance', 'billing.edit'), ('finance', 'billing.approve'), ('finance', 'documents.view'), ('finance', 'documents.verify')
) as seed(role_code, permission_key)
on conflict (role_code, permission_key) do nothing;
