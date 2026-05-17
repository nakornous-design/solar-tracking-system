"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";

type AdminTab = "users" | "roles";
type RoleCode = string;
type RoleGroup = "System Access" | "Admin Access" | "Management / Oversight" | "Operational Roles" | "External / Contractor" | "Custom";

type UserRow = {
  id: string;
  email: string | null;
  fullName: string;
  role: RoleCode;
  isActive: boolean;
  teamDepartment: string;
  notes: string;
  lastSignInAt: string | null;
};

type RoleRow = {
  role_code: string;
  role_name: string;
  role_group: RoleGroup;
  description: string | null;
  is_system_role: boolean;
  is_active: boolean;
  users_count: number;
};

type PermissionRow = {
  role_code: string;
  permission_key: string;
  is_allowed: boolean;
};

const ROLE_GROUP_OPTIONS: RoleGroup[] = ["System Access", "Admin Access", "Management / Oversight", "Operational Roles", "External / Contractor", "Custom"];
const TEAMS = ["Sales", "Engineering", "Ops", "Finance", "Contractor", "QA", "Management", "System"];
const TEMPLATES = ["View Only", "Sales User", "Ops User", "Engineer User", "QA User", "Contractor User", "Finance User", "Supervisor", "Admin", "Custom Blank"];

const PERMISSION_GROUPS = [
  {
    title: "เมนูที่เห็น",
    items: [
      ["Dashboard", "dashboard.view"],
      ["Projects", "projects.view"],
      ["Documents", "documents.view"],
      ["Billing", "billing.view"],
      ["Admin Console", "admin.view"],
      ["Danger Zone", "danger_zone.view"],
    ],
  },
  {
    title: "สิทธิ์หลัก",
    items: [
      ["ดูโครงการ", "projects.view"],
      ["สร้างโครงการ", "projects.create"],
      ["แก้ไขโครงการ", "projects.edit"],
      ["ดูเอกสาร", "documents.view"],
      ["อัปโหลดเอกสาร", "documents.upload"],
      ["ตรวจสอบเอกสาร", "documents.verify"],
      ["ดู Billing", "billing.view"],
      ["แก้ไข Billing", "billing.edit"],
      ["อนุมัติ Billing", "billing.approve"],
    ],
  },
  {
    title: "สิทธิ์ Admin",
    items: [
      ["ดูรายชื่อผู้ใช้งาน", "users.view"],
      ["สร้างผู้ใช้งาน", "users.create"],
      ["แก้ไขผู้ใช้งาน", "users.edit"],
      ["ลบผู้ใช้งาน", "users.delete"],
      ["ดู role", "roles.view"],
      ["สร้าง role", "roles.create"],
      ["แก้ไข role", "roles.edit"],
      ["แก้ไข permission", "permissions.edit"],
      ["ดู Audit Logs", "audit_logs.view"],
    ],
  },
  {
    title: "สิทธิ์เสี่ยง",
    items: [
      ["เห็น Danger Zone", "danger_zone.view"],
      ["ลบโครงการ", "danger_zone.delete_project"],
      ["ลบข้อมูลทดสอบ", "danger_zone.cleanup_test_data"],
      ["ซ่อม metadata", "danger_zone.repair_metadata"],
    ],
  },
];

function roleCodeFromName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9\s_]/g, "").replace(/\s+/g, "_").replace(/_+/g, "_");
}

function formatDateTime(value?: string | null) {
  if (!value) return "ยังไม่เคยเข้าสู่ระบบ";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "ยังไม่เคยเข้าสู่ระบบ";
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function ShieldIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3 19 6v5c0 4.5-2.7 7.9-7 10-4.3-2.1-7-5.5-7-10V6l7-3Z" /></svg>;
}

function LockIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 10V8a5 5 0 0 1 10 0v2m-9 0h8a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z" /></svg>;
}

function RoleBadge({ role }: { role: string }) {
  if (role === "system_admin") return <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-[11px] font-bold text-white"><ShieldIcon />system_admin</span>;
  if (role === "admin") return <span className="inline-flex rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700">admin</span>;
  return <span className="inline-flex rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700">{role}</span>;
}

function Helper({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] font-medium leading-5 text-slate-500">{children}</p>;
}

function RoleSelect({ value, roles, onChange, currentUserRole }: { value: RoleCode; roles: RoleRow[]; onChange: (value: RoleCode) => void; currentUserRole: string | null }) {
  const canAssignSystemAdmin = currentUserRole === "system_admin";
  const activeRoles = roles.filter((role) => role.is_active || role.role_code === value);
  const grouped = activeRoles.reduce((acc: Record<string, RoleRow[]>, role) => {
    const group = role.role_group || "Custom";
    acc[group] = acc[group] || [];
    acc[group].push(role);
    return acc;
  }, {});
  if (value && !activeRoles.some((role) => role.role_code === value)) {
    grouped.Custom = grouped.Custom || [];
    grouped.Custom.push({ role_code: value, role_name: value, role_group: "Custom", description: "Current assigned role", is_system_role: false, is_active: true, users_count: 0 });
  }
  return (
    <select value={value} onChange={(event) => onChange(event.target.value as RoleCode)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-900 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100">
      {Object.entries(grouped).map(([group, groupRoles]) => (
        <optgroup key={group} label={group}>
          {groupRoles.map((role) => (
            <option key={role.role_code} value={role.role_code} disabled={role.role_code === "system_admin" && !canAssignSystemAdmin}>
              {role.role_name} ({role.role_code})
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export default function AdminUsersPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>("users");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string>("");
  const [userFilters, setUserFilters] = useState({ search: "", role: "ALL", status: "ALL" });
  const [roleFilters, setRoleFilters] = useState({ search: "", group: "ALL" });
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [creatingUserOpen, setCreatingUserOpen] = useState(false);
  const [createUserDraft, setCreateUserDraft] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "ops" as RoleCode,
    teamDepartment: "Ops",
    isActive: true,
    emailConfirmed: true,
    notes: "",
  });
  const [editingRole, setEditingRole] = useState<RoleRow | null>(null);
  const [roleDetail, setRoleDetail] = useState<RoleRow | null>(null);
  const [rolePermissions, setRolePermissions] = useState<PermissionRow[]>([]);

  const isSystemAdmin = currentUserRole === "system_admin";

  async function loadUsers() {
    const response = await apiFetch("/api/admin/users");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to load users.");
    setUsers(payload.users || []);
    setCurrentUserId(payload.currentUser?.id || null);
    setCurrentUserRole(payload.currentUser?.role || null);
  }

  async function loadRoles() {
    const response = await apiFetch("/api/admin/roles");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to load roles.");
    setRoles(payload.roles || []);
    setCurrentUserId(payload.currentUser?.id || null);
    setCurrentUserRole(payload.currentUser?.role || null);
  }

  async function loadAll() {
    setLoading(true);
    try {
      await Promise.all([loadUsers(), loadRoles()]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function saveUser() {
    if (!editingUser) return;
    try {
      const response = await apiFetch(`/api/admin/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: editingUser.fullName,
          role: editingUser.role,
          isActive: editingUser.isActive,
          teamDepartment: editingUser.teamDepartment,
          notes: editingUser.notes,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "บันทึกผู้ใช้งานไม่สำเร็จ");
      setEditingUser(null);
      setNotice("บันทึกผู้ใช้งานแล้ว");
      await loadUsers();
      await loadRoles();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "บันทึกผู้ใช้งานไม่สำเร็จ");
    }
  }

  async function createUser() {
    try {
      const response = await apiFetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createUserDraft),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "สร้างผู้ใช้งานไม่สำเร็จ");
      setCreatingUserOpen(false);
      setCreateUserDraft({
        fullName: "",
        email: "",
        password: "",
        role: "ops",
        teamDepartment: "Ops",
        isActive: true,
        emailConfirmed: true,
        notes: "",
      });
      setNotice("สร้างผู้ใช้งานจริงแล้ว");
      await loadUsers();
      await loadRoles();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "สร้างผู้ใช้งานไม่สำเร็จ");
    }
  }

  async function deleteUser(user: UserRow) {
    if (!isSystemAdmin) {
      setNotice("เฉพาะ system_admin เท่านั้นที่สามารถลบผู้ใช้งานได้");
      return;
    }
    const label = user.email || user.fullName || user.id;
    if (!window.confirm(`ลบผู้ใช้งาน ${label}? การลบนี้จะลบบัญชี Auth และ profile ของผู้ใช้งาน`)) return;

    try {
      const response = await apiFetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "ลบผู้ใช้งานไม่สำเร็จ");
      setEditingUser(null);
      setNotice("ลบผู้ใช้งานแล้ว");
      await loadUsers();
      await loadRoles();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "ลบผู้ใช้งานไม่สำเร็จ");
    }
  }

  async function saveRole() {
    if (!editingRole) return;
    try {
      const isCreate = !roles.some((role) => role.role_code === editingRole.role_code);
      const response = await apiFetch(isCreate ? "/api/admin/roles" : `/api/admin/roles/${editingRole.role_code}`, {
        method: isCreate ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleName: editingRole.role_name,
          roleCode: editingRole.role_code,
          roleGroup: editingRole.role_group,
          description: editingRole.description,
          isActive: editingRole.is_active,
          basePermissionTemplate: "Custom Blank",
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "บันทึกบทบาทไม่สำเร็จ");
      setEditingRole(null);
      setNotice("บันทึกบทบาทแล้ว");
      await loadRoles();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "บันทึกบทบาทไม่สำเร็จ");
    }
  }

  async function openRoleDetail(role: RoleRow) {
    setRoleDetail(role);
    const response = await apiFetch(`/api/admin/role-permissions?role_code=${encodeURIComponent(role.role_code)}`);
    const payload = await response.json();
    setRolePermissions(response.ok ? payload.permissions || [] : []);
  }

  async function togglePermission(role: RoleRow, permissionKey: string, current: boolean) {
    if (role.role_code === "system_admin") return;
    if (!isSystemAdmin && (permissionKey.startsWith("danger_zone.") || permissionKey === "projects.delete" || permissionKey === "users.delete")) {
      setNotice("Normal admin cannot grant danger_zone permissions.");
      return;
    }
    const response = await apiFetch("/api/admin/role-permissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleCode: role.role_code, permissionKey, isAllowed: !current }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setNotice(payload.error || "แก้ไข permission ไม่สำเร็จ");
      return;
    }
    await openRoleDetail(role);
  }

  const filteredUsers = useMemo(() => {
    const search = userFilters.search.trim().toLowerCase();
    return users.filter((user) => {
      const matchesSearch = !search || `${user.fullName} ${user.email}`.toLowerCase().includes(search);
      const matchesRole = userFilters.role === "ALL" || user.role === userFilters.role;
      const matchesStatus = userFilters.status === "ALL" || (userFilters.status === "ACTIVE" ? user.isActive : !user.isActive);
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, userFilters]);

  const filteredRoles = useMemo(() => {
    const search = roleFilters.search.trim().toLowerCase();
    return roles.filter((role) => {
      const matchesSearch = !search || `${role.role_name} ${role.role_code}`.toLowerCase().includes(search);
      const matchesGroup = roleFilters.group === "ALL" || role.role_group === roleFilters.group;
      return matchesSearch && matchesGroup;
    });
  }, [roles, roleFilters]);

  const summary = {
    total: users.length,
    active: users.filter((user) => user.isActive).length,
    systemAdmin: users.filter((user) => user.role === "system_admin").length,
    disabled: users.filter((user) => !user.isActive).length,
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto max-w-[1280px] px-6 py-6">
        <header className="border-b border-slate-200 pb-5">
          <div className="text-[12px] font-bold text-slate-500">SunBase / Admin Console</div>
          <h1 className="mt-2 text-[26px] font-black text-slate-950">ผู้ใช้งานและบทบาท</h1>
          <p className="mt-1 text-[13px] font-medium text-slate-500">จัดการผู้ใช้งาน บทบาท และสิทธิ์การเข้าถึงระบบ</p>
        </header>

        <div className="mt-5 flex items-center justify-between gap-4 border-b border-slate-200">
          <div className="flex gap-2">
            <button onClick={() => setActiveTab("users")} className={`h-10 border-b-2 px-4 text-[13px] font-bold ${activeTab === "users" ? "border-slate-950 text-slate-950" : "border-transparent text-slate-500"}`}>ผู้ใช้งาน</button>
            <button onClick={() => setActiveTab("roles")} className={`h-10 border-b-2 px-4 text-[13px] font-bold ${activeTab === "roles" ? "border-slate-950 text-slate-950" : "border-transparent text-slate-500"}`}>บทบาทและสิทธิ์</button>
          </div>
          <button onClick={loadAll} className="mb-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] font-bold text-slate-700 hover:bg-slate-50">Refresh</button>
        </div>

        {notice && <div className="mt-4 rounded-md border border-slate-200 bg-white px-4 py-3 text-[13px] font-semibold text-slate-700 shadow-sm">{notice}</div>}
        {loading && <div className="mt-6 rounded-lg border border-slate-200 bg-white p-8 text-center text-[13px] font-semibold text-slate-500">Loading real data...</div>}

        {!loading && activeTab === "users" && (
          <section className="mt-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex flex-wrap gap-4 text-[13px] font-bold text-slate-700">
                <span>ผู้ใช้งานทั้งหมด {summary.total} คน</span>
                <span>ใช้งานอยู่ {summary.active} คน</span>
                <span>system_admin {summary.systemAdmin} คน</span>
                <span>ปิดใช้งาน {summary.disabled} คน</span>
              </div>
              <button onClick={() => setCreatingUserOpen(true)} className="rounded-md bg-slate-950 px-3 py-2 text-[12px] font-bold text-white shadow-sm hover:bg-slate-800">เพิ่มผู้ใช้งาน</button>
            </div>

            <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(260px,1fr)_220px_160px]">
              <input value={userFilters.search} onChange={(event) => setUserFilters({ ...userFilters, search: event.target.value })} placeholder="ค้นหาชื่อหรืออีเมล" className="h-10 rounded-md border border-slate-200 px-3 text-[13px] outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100" />
              <select value={userFilters.role} onChange={(event) => setUserFilters({ ...userFilters, role: event.target.value })} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-[13px] font-semibold">
                <option value="ALL">ทุกบทบาท</option>
                {roles.map((role) => <option key={role.role_code} value={role.role_code}>{role.role_name} ({role.role_code})</option>)}
              </select>
              <select value={userFilters.status} onChange={(event) => setUserFilters({ ...userFilters, status: event.target.value })} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-[13px] font-semibold">
                <option value="ALL">ทุกสถานะ</option>
                <option value="ACTIVE">ใช้งานอยู่</option>
                <option value="DISABLED">ปิดใช้งาน</option>
              </select>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[900px] text-left text-[13px]">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
                  <tr><th className="px-4 py-3">ผู้ใช้งาน</th><th className="px-4 py-3">บทบาท</th><th className="px-4 py-3">สถานะ</th><th className="px-4 py-3">เข้าสู่ระบบล่าสุด</th><th className="px-4 py-3 text-right">จัดการ</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3"><div className="font-bold text-slate-950">{user.fullName || "-"}</div><div className="mt-0.5 text-[12px] font-medium text-slate-500">{user.email}</div></td>
                      <td className="px-4 py-3"><RoleBadge role={user.role} /></td>
                      <td className="px-4 py-3"><span className={`rounded-md border px-2 py-1 text-[11px] font-bold ${user.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-500"}`}>{user.isActive ? "ใช้งานอยู่" : "ปิดใช้งาน"}</span></td>
                      <td className="px-4 py-3 font-medium text-slate-500">{formatDateTime(user.lastSignInAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditingUser(user)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-700 hover:bg-slate-50">จัดการ</button>
                          {isSystemAdmin && <button onClick={() => deleteUser(user)} disabled={user.id === currentUserId} className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-[12px] font-bold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50">ลบ</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {!loading && activeTab === "roles" && (
          <section className="mt-5 space-y-4">
            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-[18px] font-black text-slate-950">บทบาทและสิทธิ์</h2>
                <p className="text-[13px] font-medium text-slate-500">กำหนดบทบาทและสิทธิ์การเข้าถึงของแต่ละกลุ่มผู้ใช้งาน</p>
              </div>
              <button onClick={() => setEditingRole({ role_code: "", role_name: "", role_group: "Custom", description: "", is_system_role: false, is_active: true, users_count: 0 })} className="rounded-md bg-slate-950 px-3 py-2 text-[12px] font-bold text-white shadow-sm hover:bg-slate-800">เพิ่มบทบาท</button>
            </div>

            <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(260px,1fr)_260px]">
              <input value={roleFilters.search} onChange={(event) => setRoleFilters({ ...roleFilters, search: event.target.value })} placeholder="ค้นหาบทบาท" className="h-10 rounded-md border border-slate-200 px-3 text-[13px] outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100" />
              <select value={roleFilters.group} onChange={(event) => setRoleFilters({ ...roleFilters, group: event.target.value })} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-[13px] font-semibold">
                <option value="ALL">ทุกกลุ่มบทบาท</option>
                {ROLE_GROUP_OPTIONS.map((group) => <option key={group} value={group}>{group}</option>)}
              </select>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[900px] text-left text-[13px]">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
                  <tr><th className="px-4 py-3">บทบาท</th><th className="px-4 py-3">คำอธิบาย</th><th className="px-4 py-3">ผู้ใช้งาน</th><th className="px-4 py-3">สถานะ</th><th className="px-4 py-3 text-right">จัดการ</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRoles.map((role) => (
                    <tr key={role.role_code} className="hover:bg-slate-50">
                      <td className="px-4 py-3"><div className="flex items-center gap-2 font-bold text-slate-950">{role.is_system_role && <LockIcon />} {role.role_name} {role.role_code === "system_admin" && <RoleBadge role="system_admin" />}</div><div className="mt-0.5 font-mono text-[11px] font-bold text-slate-400">{role.role_code}</div></td>
                      <td className="px-4 py-3 font-medium text-slate-600">{role.description || "-"}</td>
                      <td className="px-4 py-3 font-black text-slate-950">{role.users_count}</td>
                      <td className="px-4 py-3"><span className={`rounded-md border px-2 py-1 text-[11px] font-bold ${role.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-500"}`}>{role.is_active ? "ใช้งานอยู่" : "ปิดใช้งาน"}</span></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => openRoleDetail(role)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-700 hover:bg-slate-50">ดูรายละเอียด</button>
                          <button onClick={() => setEditingRole(role)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-700 hover:bg-slate-50">แก้ไข</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {(editingUser || creatingUserOpen) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-[16px] font-black text-slate-950">{editingUser ? "แก้ไขผู้ใช้งาน" : "เพิ่มผู้ใช้งาน"}</h2>
              {!editingUser && <p className="mt-1 text-[12px] font-semibold text-slate-500">สร้าง Supabase Auth user พร้อม profile role สำหรับใช้งานจริง</p>}
            </div>
            {editingUser ? (
              <div className="space-y-4 px-5 py-4">
                <label className="block"><span className="text-[12px] font-bold text-slate-700">ชื่อผู้ใช้งาน</span><input value={editingUser.fullName} onChange={(event) => setEditingUser({ ...editingUser, fullName: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-[13px]" /></label>
                <label className="block"><span className="text-[12px] font-bold text-slate-700">อีเมล</span><input value={editingUser.email || ""} disabled className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-[13px] text-slate-500" /></label>
                <label className="block"><span className="text-[12px] font-bold text-slate-700">บทบาท</span><div className="mt-1"><RoleSelect value={editingUser.role} roles={roles} currentUserRole={currentUserRole} onChange={(role) => setEditingUser({ ...editingUser, role })} /></div><Helper>เลือกบทบาทจากตาราง roles ที่เปิดใช้งานอยู่</Helper>{!isSystemAdmin && <Helper>เฉพาะ system_admin เท่านั้นที่สามารถมอบสิทธิ์ system_admin ให้ผู้อื่นได้</Helper>}</label>
                {editingUser.role === "system_admin" && <div className="rounded-md border border-slate-300 bg-slate-950 px-3 py-2 text-[12px] font-semibold text-white">system_admin เป็นสิทธิ์สูงสุดของระบบ สามารถเข้าถึงเมนูระบบขั้นสูงและการตั้งค่าที่มีความเสี่ยงได้</div>}
                <label className="block"><span className="text-[12px] font-bold text-slate-700">ทีม / แผนก</span><select value={editingUser.teamDepartment || ""} onChange={(event) => setEditingUser({ ...editingUser, teamDepartment: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-[13px]">{TEAMS.map((team) => <option key={team} value={team}>{team}</option>)}</select><Helper>ใช้จัดกลุ่มผู้ใช้งานตามทีม เช่น Sales, Engineering, Ops, Finance หรือ Contractor</Helper></label>
                <label className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3"><input type="checkbox" checked={editingUser.isActive} disabled={editingUser.role === "system_admin"} onChange={(event) => setEditingUser({ ...editingUser, isActive: event.target.checked })} className="mt-1 h-4 w-4 accent-slate-950" /><span><span className="block text-[12px] font-bold text-slate-700">ใช้งานอยู่</span><Helper>ถ้าปิดใช้งาน ผู้ใช้งานคนนี้จะไม่สามารถเข้าใช้ระบบได้</Helper></span></label>
                <label className="block"><span className="text-[12px] font-bold text-slate-700">หมายเหตุ</span><textarea value={editingUser.notes || ""} onChange={(event) => setEditingUser({ ...editingUser, notes: event.target.value })} className="mt-1 min-h-20 w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-[13px]" /></label>
              </div>
            ) : (
              <div className="space-y-4 px-5 py-4">
                <label className="block"><span className="text-[12px] font-bold text-slate-700">ชื่อผู้ใช้งาน</span><input value={createUserDraft.fullName} onChange={(event) => setCreateUserDraft({ ...createUserDraft, fullName: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-[13px]" /></label>
                <label className="block"><span className="text-[12px] font-bold text-slate-700">อีเมล</span><input value={createUserDraft.email} onChange={(event) => setCreateUserDraft({ ...createUserDraft, email: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-[13px]" /></label>
                <label className="block"><span className="text-[12px] font-bold text-slate-700">รหัสผ่านเริ่มต้น</span><input type="password" value={createUserDraft.password} onChange={(event) => setCreateUserDraft({ ...createUserDraft, password: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-[13px]" /><Helper>ต้องมีอย่างน้อย 8 ตัวอักษร ผู้ดูแลควรแจ้งให้ผู้ใช้เปลี่ยนรหัสผ่านหลังเข้าใช้งานครั้งแรก</Helper></label>
                <label className="block"><span className="text-[12px] font-bold text-slate-700">บทบาท</span><div className="mt-1"><RoleSelect value={createUserDraft.role} roles={roles} currentUserRole={currentUserRole} onChange={(role) => setCreateUserDraft({ ...createUserDraft, role })} /></div><Helper>เลือกบทบาทจากตาราง roles ที่เปิดใช้งานอยู่</Helper>{!isSystemAdmin && <Helper>เฉพาะ system_admin เท่านั้นที่สามารถมอบสิทธิ์ system_admin ให้ผู้อื่นได้</Helper>}</label>
                {createUserDraft.role === "system_admin" && <div className="rounded-md border border-slate-300 bg-slate-950 px-3 py-2 text-[12px] font-semibold text-white">system_admin เป็นสิทธิ์สูงสุดของระบบ สามารถเข้าถึงเมนูระบบขั้นสูงและการตั้งค่าที่มีความเสี่ยงได้</div>}
                <label className="block"><span className="text-[12px] font-bold text-slate-700">ทีม / แผนก</span><select value={createUserDraft.teamDepartment} onChange={(event) => setCreateUserDraft({ ...createUserDraft, teamDepartment: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-[13px]">{TEAMS.map((team) => <option key={team} value={team}>{team}</option>)}</select><Helper>ใช้จัดกลุ่มผู้ใช้งานตามทีม เช่น Sales, Engineering, Ops, Finance หรือ Contractor</Helper></label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3"><input type="checkbox" checked={createUserDraft.isActive} onChange={(event) => setCreateUserDraft({ ...createUserDraft, isActive: event.target.checked })} className="mt-1 h-4 w-4 accent-slate-950" /><span><span className="block text-[12px] font-bold text-slate-700">ใช้งานอยู่</span><Helper>ถ้าปิดใช้งาน ผู้ใช้งานคนนี้จะไม่สามารถเข้าใช้ระบบได้</Helper></span></label>
                  <label className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3"><input type="checkbox" checked={createUserDraft.emailConfirmed} onChange={(event) => setCreateUserDraft({ ...createUserDraft, emailConfirmed: event.target.checked })} className="mt-1 h-4 w-4 accent-slate-950" /><span><span className="block text-[12px] font-bold text-slate-700">ยืนยันอีเมลแล้ว</span><Helper>ใช้เมื่อต้องการให้บัญชีเข้าใช้งานได้ทันที</Helper></span></label>
                </div>
                <label className="block"><span className="text-[12px] font-bold text-slate-700">หมายเหตุ</span><textarea value={createUserDraft.notes} onChange={(event) => setCreateUserDraft({ ...createUserDraft, notes: event.target.value })} className="mt-1 min-h-20 w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-[13px]" /></label>
              </div>
            )}
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button onClick={() => { setEditingUser(null); setCreatingUserOpen(false); }} className="rounded-md px-4 py-2 text-[13px] font-bold text-slate-500 hover:bg-slate-50">ยกเลิก</button>
              {editingUser && isSystemAdmin && <button onClick={() => deleteUser(editingUser)} disabled={editingUser.id === currentUserId} className="mr-auto rounded-md border border-rose-200 bg-rose-50 px-4 py-2 text-[13px] font-bold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50">ลบผู้ใช้งาน</button>}
              {editingUser && <button onClick={saveUser} className="rounded-md bg-slate-950 px-4 py-2 text-[13px] font-bold text-white hover:bg-slate-800">บันทึก</button>}
              {!editingUser && <button onClick={createUser} disabled={!createUserDraft.email.trim() || createUserDraft.password.length < 8} className="rounded-md bg-slate-950 px-4 py-2 text-[13px] font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">สร้างผู้ใช้งาน</button>}
            </div>
          </div>
        </div>
      )}

      {editingRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-[16px] font-black text-slate-950">แก้ไขบทบาท</h2></div>
            <div className="space-y-4 px-5 py-4">
              <label className="block"><span className="text-[12px] font-bold text-slate-700">ชื่อบทบาท</span><input value={editingRole.role_name} onChange={(event) => setEditingRole({ ...editingRole, role_name: event.target.value, role_code: editingRole.role_code || roleCodeFromName(event.target.value) })} className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-[13px]" /><Helper>ชื่อบทบาทที่แสดงให้ผู้ดูแลระบบเห็น เช่น Billing Manager หรือ Site Supervisor</Helper></label>
              <label className="block"><span className="text-[12px] font-bold text-slate-700">Role code</span><input value={editingRole.role_code || roleCodeFromName(editingRole.role_name)} readOnly={Boolean(editingRole.is_system_role)} onChange={(event) => setEditingRole({ ...editingRole, role_code: roleCodeFromName(event.target.value) })} className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 font-mono text-[13px] font-bold" /><Helper>รหัส role สำหรับระบบ ใช้ตัวพิมพ์เล็กและ underscore เท่านั้น เช่น billing_manager</Helper></label>
              <label className="block"><span className="text-[12px] font-bold text-slate-700">กลุ่มบทบาท</span><select value={editingRole.role_group} onChange={(event) => setEditingRole({ ...editingRole, role_group: event.target.value as RoleGroup })} className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-[13px]">{ROLE_GROUP_OPTIONS.map((group) => <option key={group} value={group}>{group}</option>)}</select><Helper>ใช้จัดกลุ่ม role เพื่อให้ง่ายต่อการค้นหาและกำหนดสิทธิ์</Helper></label>
              <label className="block"><span className="text-[12px] font-bold text-slate-700">ใช้สิทธิ์ตั้งต้นจาก template</span><select className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-[13px]">{TEMPLATES.map((item) => <option key={item}>{item}</option>)}</select><Helper>เลือก template เริ่มต้นก่อน แล้วค่อยปรับสิทธิ์เพิ่มเติม</Helper></label>
              <label className="block"><span className="text-[12px] font-bold text-slate-700">คำอธิบาย</span><textarea value={editingRole.description || ""} onChange={(event) => setEditingRole({ ...editingRole, description: event.target.value })} className="mt-1 min-h-20 w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-[13px]" /></label>
              <label className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3"><input type="checkbox" checked={editingRole.is_active} disabled={editingRole.role_code === "system_admin"} onChange={(event) => setEditingRole({ ...editingRole, is_active: event.target.checked })} className="h-4 w-4 accent-slate-950" /><span className="text-[12px] font-bold text-slate-700">ใช้งานอยู่</span></label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4"><button onClick={() => setEditingRole(null)} className="rounded-md px-4 py-2 text-[13px] font-bold text-slate-500 hover:bg-slate-50">ยกเลิก</button><button onClick={saveRole} className="rounded-md bg-slate-950 px-4 py-2 text-[13px] font-bold text-white hover:bg-slate-800">บันทึก</button></div>
          </div>
        </div>
      )}

      {roleDetail && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35">
          <aside className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl">
            <div className="sticky top-0 border-b border-slate-100 bg-white px-5 py-4">
              <div className="flex items-start justify-between gap-4"><div><h2 className="text-[16px] font-black text-slate-950">{roleDetail.role_name}</h2><p className="font-mono text-[12px] font-bold text-slate-400">{roleDetail.role_code}</p></div><button onClick={() => setRoleDetail(null)} className="rounded-md border border-slate-200 px-3 py-1.5 text-[12px] font-bold">ปิด</button></div>
            </div>
            <div className="space-y-4 p-5">
              {roleDetail.role_code === "system_admin" && <div className="rounded-md border border-slate-300 bg-slate-950 px-3 py-2 text-[12px] font-semibold text-white">system_admin permissions are checked and locked.</div>}
              {!isSystemAdmin && <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800">Normal admin cannot grant danger_zone permissions.</div>}
              {PERMISSION_GROUPS.map((group) => (
                <div key={group.title} className="rounded-lg border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 px-4 py-3"><h3 className="text-[14px] font-black text-slate-950">{group.title}</h3></div>
                  <div className="divide-y divide-slate-100">
                    {group.items.map(([label, key]) => {
                      const checked = roleDetail.role_code === "system_admin" || rolePermissions.some((item) => item.permission_key === key && item.is_allowed);
                      const highRisk = key.startsWith("danger_zone.") || key === "projects.delete" || key === "users.delete";
                      return (
                        <label key={key} className="flex items-start justify-between gap-4 px-4 py-3 hover:bg-slate-50">
                          <span><span className="block text-[13px] font-bold text-slate-900">{label}</span><span className="mt-0.5 block font-mono text-[11px] font-bold text-slate-400">{key}</span>{highRisk && <span className="mt-1 inline-flex rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">สิทธิ์เสี่ยง</span>}</span>
                          <input type="checkbox" checked={checked} disabled={roleDetail.role_code === "system_admin"} onChange={() => togglePermission(roleDetail, key, checked)} className="mt-1 h-4 w-4 accent-slate-950" />
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
