"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";

type AdminTab = "users" | "roles";
type RoleRow = {
  role_code: string;
  role_name: string;
  role_group: string;
  description: string | null;
  is_system_role: boolean;
  is_active: boolean;
  users_count: number;
};
type UserRow = {
  id: string;
  email: string | null;
  fullName: string;
  role: string;
  additionalRoles: Array<{ role: string; expiresAt?: string | null; reason?: string | null }>;
  effectiveRoles: string[];
  isActive: boolean;
  teamDepartment: string;
  notes: string;
  lastSignInAt: string | null;
};
type RoleDetail = {
  role: RoleRow;
  permissions: Array<{ key: string; label: string; group: string; risk: "normal" | "danger"; is_allowed: boolean }>;
  stageOwnership: Array<{ id: string; code: string; name: string; orderIndex: number; workflowCode?: string | null; workflowName?: string | null; workflowStatus?: string | null }>;
};

const STATUS_FILTERS = [
  { value: "ALL", label: "ทุกสถานะ" },
  { value: "ACTIVE", label: "ใช้งานอยู่" },
  { value: "INACTIVE", label: "ปิดใช้งาน" },
];

const ROLE_ORDER = [
  "system_admin",
  "admin",
  "project_admin",
  "exec",
  "supervisor",
  "sales",
  "engineer",
  "ops",
  "qa",
  "finance",
  "contractor",
];

const ROLE_GUIDE: Record<string, { tier: string; scope: string; summary: string; tone: string }> = {
  system_admin: {
    tier: "สูงสุด",
    scope: "Platform owner",
    summary: "จัดการระบบ ผู้ใช้ บทบาท สิทธิ์ Workflow และข้อมูลเสี่ยงสูง",
    tone: "border-slate-800 bg-slate-950 text-white",
  },
  admin: {
    tier: "สูงสุด",
    scope: "System admin",
    summary: "ดูแลผู้ใช้ Workflow และการตั้งค่าทั่วไป",
    tone: "border-slate-800 bg-slate-950 text-white",
  },
  project_admin: {
    tier: "สูง",
    scope: "Project operations",
    summary: "จัดการโครงการ เอกสาร QA Billing Scheduling และ Exception",
    tone: "border-blue-200 bg-blue-50 text-blue-700",
  },
  exec: {
    tier: "ผู้บริหาร",
    scope: "Read / monitor",
    summary: "ดูภาพรวม KPI ความเสี่ยง SLA และสถานะโครงการ",
    tone: "border-violet-200 bg-violet-50 text-violet-700",
  },
  supervisor: {
    tier: "ควบคุมงาน",
    scope: "Team oversight",
    summary: "ดูแลภาพรวมการปฏิบัติงานและติดตามทีม",
    tone: "border-indigo-200 bg-indigo-50 text-indigo-700",
  },
  sales: {
    tier: "ปฏิบัติการ",
    scope: "Sales stages",
    summary: "รับข้อมูลลูกค้า ใบเสนอราคา และงานขายที่เกี่ยวข้อง",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  engineer: {
    tier: "ปฏิบัติการ",
    scope: "Survey / TSSR",
    summary: "สำรวจหน้างานและงานออกแบบทางเทคนิค",
    tone: "border-cyan-200 bg-cyan-50 text-cyan-700",
  },
  ops: {
    tier: "ปฏิบัติการ",
    scope: "Scheduling / field ops",
    summary: "จัดตาราง ติดตามหน้างาน และประสานทีมปฏิบัติการ",
    tone: "border-sky-200 bg-sky-50 text-sky-700",
  },
  qa: {
    tier: "ปฏิบัติการ",
    scope: "Quality control",
    summary: "ตรวจคุณภาพและอนุมัติผล QA",
    tone: "border-teal-200 bg-teal-50 text-teal-700",
  },
  finance: {
    tier: "ปฏิบัติการ",
    scope: "Finance / billing",
    summary: "Payment, billing, invoice และเอกสารการเงิน",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
  },
  contractor: {
    tier: "ภายนอก",
    scope: "Field execution",
    summary: "งานภาคสนาม อัปโหลดรูป/เอกสารตามที่ได้รับมอบหมาย",
    tone: "border-slate-200 bg-slate-50 text-slate-600",
  },
};

function roleRank(roleCode: string) {
  const index = ROLE_ORDER.indexOf(roleCode);
  return index === -1 ? ROLE_ORDER.length + 1 : index + 1;
}

function roleGuide(roleCode: string) {
  return ROLE_GUIDE[roleCode] || {
    tier: "กำหนดเอง",
    scope: "Custom role",
    summary: "บทบาทที่กำหนดในระบบ",
    tone: "border-slate-200 bg-slate-50 text-slate-600",
  };
}

function Icon({ name, className = "h-4 w-4" }: { name: "users" | "check" | "shield" | "layers" | "search" | "edit" | "close" | "role"; className?: string }) {
  const common = { strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 2 };
  const paths = {
    users: <path {...common} d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />,
    check: <path {...common} d="M20 6 9 17l-5-5" />,
    shield: <path {...common} d="M12 3 19 6v5c0 4.5-2.7 7.9-7 10-4.3-2.1-7-5.5-7-10V6l7-3Z" />,
    layers: <path {...common} d="m12 3 8 4-8 4-8-4 8-4Zm8 8-8 4-8-4m16 4-8 4-8-4" />,
    search: <path {...common} d="m21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />,
    edit: <path {...common} d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />,
    close: <path {...common} d="M18 6 6 18M6 6l12 12" />,
    role: <path {...common} d="M12 3 4 7v6c0 4 3.4 6.5 8 8 4.6-1.5 8-4 8-8V7l-8-4Zm-3 9 2 2 4-4" />,
  };
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">{paths[name]}</svg>;
}

function initials(user: UserRow) {
  const label = user.fullName || user.email || "?";
  return label.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function roleLabel(roleCode: string, roles: RoleRow[]) {
  const role = roles.find((item) => item.role_code === roleCode);
  return role?.role_name || roleCode;
}

function RoleChip({ role, roles, subtle = false }: { role: string; roles: RoleRow[]; subtle?: boolean }) {
  const dark = role === "system_admin";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${
      dark
        ? "border-slate-800 bg-slate-950 text-white"
        : subtle
          ? "border-slate-200 bg-slate-50 text-slate-600"
          : "border-blue-200 bg-blue-50 text-blue-700"
    }`}>
      {roleLabel(role, roles)}
    </span>
  );
}

function StatCard({ label, value, subtitle, icon, tone }: { label: string; value: number; subtitle: string; icon: "users" | "check" | "shield" | "layers"; tone: "blue" | "green" | "slate" | "amber" }) {
  const tones = {
    blue: "border-blue-100 bg-blue-50/60 text-blue-700",
    green: "border-emerald-100 bg-emerald-50/70 text-emerald-700",
    slate: "border-slate-200 bg-white text-slate-700",
    amber: "border-amber-100 bg-amber-50/70 text-amber-700",
  };
  return (
    <div className={`relative overflow-hidden rounded-xl border p-4 shadow-sm ${tones[tone]}`}>
      <Icon name={icon} className="absolute right-4 top-4 h-12 w-12 opacity-10" />
      <p className="text-[12px] font-bold text-slate-500">{label}</p>
      <p className="mt-2 text-[28px] font-black text-slate-950">{value}</p>
      <p className="mt-1 text-[12px] font-semibold text-slate-500">{subtitle}</p>
    </div>
  );
}

function RoleDetailDrawer({
  detail,
  loading,
  error,
  canEdit,
  canEditDanger,
  updatingPermissionKey,
  onTogglePermission,
  onClose,
}: {
  detail: RoleDetail | null;
  loading: boolean;
  error: string;
  canEdit: boolean;
  canEditDanger: boolean;
  updatingPermissionKey: string;
  onTogglePermission: (permissionKey: string, nextAllowed: boolean) => void;
  onClose: () => void;
}) {
  if (!detail && !loading && !error) return null;

  const role = detail?.role;
  const guide = role ? roleGuide(role.role_code) : null;
  const allowed = (detail?.permissions || []).filter((item) => item.is_allowed);
  const groupedPermissions = (detail?.permissions || []).reduce((acc: Record<string, NonNullable<RoleDetail["permissions"]>>, permission) => {
    acc[permission.group] = acc[permission.group] || [];
    acc[permission.group].push(permission);
    return acc;
  }, {});
  const dangerCount = allowed.filter((item) => item.risk === "danger").length;
  const lockedRole = role?.role_code === "system_admin";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40">
      <aside className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Role permissions</p>
            <h2 className="mt-1 text-[20px] font-black text-slate-950">
              {role?.role_name || "Loading role"}
            </h2>
            {role && <p className="mt-1 font-mono text-[12px] font-bold text-slate-500">{role.role_code}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><Icon name="close" /></button>
        </div>

        <div className="space-y-4 p-5">
          {loading && <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-[13px] font-bold text-slate-500">Loading role permissions...</div>}
          {error && <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-[13px] font-bold text-rose-700">{error}</div>}

          {detail && role && guide && (
            <>
              <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-[12px] font-black ${guide.tone}`}>#{roleRank(role.role_code)} {guide.tier}</span>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[12px] font-bold text-slate-600">{guide.scope}</span>
                  {dangerCount > 0 && <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[12px] font-bold text-rose-700">{dangerCount} danger permissions</span>}
                </div>
                <p className="mt-3 text-[14px] font-bold text-slate-800">{guide.summary}</p>
                {role.description && <p className="mt-1 text-[12px] font-semibold text-slate-500">{role.description}</p>}
              </section>

              <section className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                  <p className="text-[11px] font-black uppercase tracking-wide text-blue-500">Allowed actions</p>
                  <p className="mt-2 text-[26px] font-black text-slate-950">{allowed.length}</p>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
                  <p className="text-[11px] font-black uppercase tracking-wide text-emerald-600">Owned stages</p>
                  <p className="mt-2 text-[26px] font-black text-slate-950">{detail.stageOwnership.length}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Users</p>
                  <p className="mt-2 text-[26px] font-black text-slate-950">{role.users_count || 0}</p>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-[14px] font-black text-slate-950">Action permissions</h3>
                      <p className="text-[12px] font-semibold text-slate-500">อ่าน/แก้จาก role_permissions จริง แยกตามกลุ่มงาน</p>
                    </div>
                    {lockedRole ? (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-500">system_admin locked</span>
                    ) : (
                      <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-bold text-blue-700">Editable</span>
                    )}
                  </div>
                </div>
                <div className="space-y-3 p-4">
                  {Object.keys(groupedPermissions).length === 0 ? (
                    <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-[12px] font-bold text-slate-400">ไม่มี permission ที่เปิดใช้งาน</p>
                  ) : Object.entries(groupedPermissions).map(([group, permissions]) => (
                    <div key={group} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                      <p className="text-[12px] font-black text-slate-700">{group}</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {permissions.map((permission) => (
                          <label
                            key={permission.key}
                            className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[12px] font-bold ${
                              permission.is_allowed
                                ? permission.risk === "danger"
                                  ? "border-rose-200 bg-rose-50 text-rose-700"
                                  : "border-emerald-100 bg-white text-slate-800"
                                : "border-slate-200 bg-white text-slate-400"
                            }`}
                            title={permission.key}
                          >
                            <span className="min-w-0">
                              <span className="block truncate">{permission.label}</span>
                              <span className="block truncate font-mono text-[10px] font-semibold opacity-60">{permission.key}</span>
                            </span>
                            <input
                              type="checkbox"
                              checked={permission.is_allowed}
                              disabled={
                                !canEdit ||
                                lockedRole ||
                                updatingPermissionKey === permission.key ||
                                (permission.risk === "danger" && !canEditDanger)
                              }
                              onChange={(event) => onTogglePermission(permission.key, event.target.checked)}
                              className="h-4 w-4 shrink-0 accent-slate-950 disabled:cursor-not-allowed"
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-4 py-3">
                  <h3 className="text-[14px] font-black text-slate-950">Stage ownership</h3>
                  <p className="text-[12px] font-semibold text-slate-500">stage ที่ owner_role ตรงกับบทบาทนี้</p>
                </div>
                <div className="max-h-72 overflow-y-auto p-4">
                  {detail.stageOwnership.length === 0 ? (
                    <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-[12px] font-bold text-slate-400">role นี้ไม่ได้เป็น owner stage โดยตรง</p>
                  ) : (
                    <div className="space-y-2">
                      {detail.stageOwnership.map((stage) => (
                        <div key={`${stage.id}-${stage.workflowCode}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                          <div>
                            <p className="text-[13px] font-black text-slate-900">{stage.orderIndex}. {stage.name}</p>
                            <p className="font-mono text-[11px] font-bold text-slate-400">{stage.code}</p>
                          </div>
                          <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-500">
                            {stage.workflowCode || stage.workflowName || "workflow"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

export default function AdminUsersPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>("users");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [currentUser, setCurrentUser] = useState<{ id: string | null; role: string | null; roles: string[] }>({ id: null, role: null, roles: [] });
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [filters, setFilters] = useState({ search: "", role: "ALL", status: "ALL", team: "ALL" });
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [roleDraft, setRoleDraft] = useState<string[]>([]);
  const [primaryRoleDraft, setPrimaryRoleDraft] = useState("ops");
  const [teamDraft, setTeamDraft] = useState("");
  const [activeDraft, setActiveDraft] = useState(true);
  const [reasonDraft, setReasonDraft] = useState("");
  const [expiresAtDraft, setExpiresAtDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedRoleDetail, setSelectedRoleDetail] = useState<RoleDetail | null>(null);
  const [roleDetailLoading, setRoleDetailLoading] = useState(false);
  const [roleDetailError, setRoleDetailError] = useState("");
  const [updatingPermissionKey, setUpdatingPermissionKey] = useState("");

  const canAdmin = currentUser.roles.includes("system_admin") || currentUser.roles.includes("admin");
  const canAssignSystemAdmin = currentUser.roles.includes("system_admin");
  const activeRoles = roles.filter((role) => role.is_active);
  const sortedRoles = useMemo(
    () => [...roles].sort((a, b) => roleRank(a.role_code) - roleRank(b.role_code) || a.role_name.localeCompare(b.role_name)),
    [roles],
  );
  const teams = useMemo(() => [...new Set(users.map((user) => user.teamDepartment).filter(Boolean))].sort(), [users]);

  async function loadAll() {
    setLoading(true);
    try {
      const [usersResponse, rolesResponse] = await Promise.all([
        apiFetch("/api/admin/users"),
        apiFetch("/api/admin/roles"),
      ]);
      const usersPayload = await usersResponse.json();
      const rolesPayload = await rolesResponse.json();
      if (!usersResponse.ok) throw new Error(usersPayload.error || "Unable to load users.");
      if (!rolesResponse.ok) throw new Error(rolesPayload.error || "Unable to load roles.");
      setUsers(usersPayload.users || []);
      setRoles(rolesPayload.roles || []);
      setCurrentUser({
        id: usersPayload.currentUser?.id || rolesPayload.currentUser?.id || null,
        role: usersPayload.currentUser?.role || rolesPayload.currentUser?.role || null,
        roles: usersPayload.currentUser?.roles || rolesPayload.currentUser?.roles || [],
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const summary = {
    total: users.length,
    active: users.filter((user) => user.isActive).length,
    systemAdmin: users.filter((user) => user.effectiveRoles?.includes("system_admin") || user.role === "system_admin").length,
    multiRole: users.filter((user) => (user.additionalRoles || []).length > 0).length,
  };

  const filteredUsers = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return users.filter((user) => {
      const roleText = [user.role, ...(user.additionalRoles || []).map((item) => item.role)].join(" ");
      const text = `${user.email || ""} ${user.fullName || ""} ${roleText} ${user.teamDepartment || ""}`.toLowerCase();
      const matchesSearch = !search || text.includes(search);
      const matchesRole = filters.role === "ALL" || user.role === filters.role || (user.additionalRoles || []).some((item) => item.role === filters.role);
      const matchesStatus = filters.status === "ALL" || (filters.status === "ACTIVE" ? user.isActive : !user.isActive);
      const matchesTeam = filters.team === "ALL" || user.teamDepartment === filters.team;
      return matchesSearch && matchesRole && matchesStatus && matchesTeam;
    });
  }, [users, filters]);

  function openEditUser(user: UserRow) {
    setEditingUser(user);
    setPrimaryRoleDraft(user.role || "ops");
    setRoleDraft((user.additionalRoles || []).map((item) => item.role));
    setTeamDraft(user.teamDepartment || "");
    setActiveDraft(user.isActive);
    setReasonDraft("");
    setExpiresAtDraft("");
  }

  function toggleAdditionalRole(roleCode: string) {
    setRoleDraft((current) => current.includes(roleCode) ? current.filter((item) => item !== roleCode) : [...current, roleCode]);
  }

  async function openRoleDetail(roleCode: string) {
    setRoleDetailLoading(true);
    setRoleDetailError("");
    setSelectedRoleDetail(null);
    try {
      const response = await apiFetch(`/api/admin/roles/${roleCode}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load role detail.");
      setSelectedRoleDetail(payload);
    } catch (error) {
      setRoleDetailError(error instanceof Error ? error.message : "Unable to load role detail.");
    } finally {
      setRoleDetailLoading(false);
    }
  }

  async function toggleRolePermission(permissionKey: string, nextAllowed: boolean) {
    if (!selectedRoleDetail?.role) return;
    setUpdatingPermissionKey(permissionKey);
    setRoleDetailError("");
    try {
      const roleCode = selectedRoleDetail.role.role_code;
      const response = await apiFetch("/api/admin/role-permissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleCode, permissionKey, isAllowed: nextAllowed }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to update permission.");

      setSelectedRoleDetail((current) => {
        if (!current) return current;
        return {
          ...current,
          permissions: current.permissions.map((permission) => (
            permission.key === permissionKey ? { ...permission, is_allowed: nextAllowed } : permission
          )),
        };
      });
      setNotice(`Updated permission ${permissionKey}`);
    } catch (error) {
      setRoleDetailError(error instanceof Error ? error.message : "Unable to update permission.");
    } finally {
      setUpdatingPermissionKey("");
    }
  }

  async function saveUserRoles() {
    if (!editingUser) return;
    setSaving(true);
    try {
      const additionalRoles = roleDraft.filter((role) => role !== primaryRoleDraft);
      const response = await apiFetch(`/api/admin/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: editingUser.fullName,
          role: primaryRoleDraft,
          additionalRoles,
          teamDepartment: teamDraft,
          isActive: activeDraft,
          reason: reasonDraft,
          expiresAt: expiresAtDraft || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "บันทึกบทบาทไม่สำเร็จ");
      setEditingUser(null);
      setNotice("บันทึกบทบาทผู้ใช้แล้ว");
      await loadAll();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "บันทึกบทบาทไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto max-w-[1440px] px-6 py-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[12px] font-bold text-slate-500">Admin Console / Users & Roles</p>
            <h1 className="mt-2 text-[28px] font-black text-slate-950">Users & Roles</h1>
            <p className="mt-1 text-[13px] font-medium text-slate-500">จัดการผู้ใช้งาน บทบาทหลัก และบทบาทเสริมแบบปลอดภัย</p>
          </div>
          <button onClick={loadAll} className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-[13px] font-bold text-slate-700 shadow-sm hover:bg-slate-50">Refresh</button>
        </header>

        {notice && (
          <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-[13px] font-semibold text-blue-800">
            {notice}
          </div>
        )}

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Users" value={summary.total} subtitle="ผู้ใช้งานทั้งหมด" icon="users" tone="blue" />
          <StatCard label="Active Users" value={summary.active} subtitle="เข้าใช้งานได้" icon="check" tone="green" />
          <StatCard label="System Admin users" value={summary.systemAdmin} subtitle="สิทธิ์สูงสุด" icon="shield" tone="slate" />
          <StatCard label="Users with Multiple Roles" value={summary.multiRole} subtitle="มีบทบาทเสริม" icon="layers" tone="amber" />
        </section>

        <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="inline-flex w-fit rounded-lg border border-slate-200 bg-slate-50 p-1">
              {(["users", "roles"] as AdminTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`h-9 rounded-md px-4 text-[13px] font-bold transition ${activeTab === tab ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
                >
                  {tab === "users" ? "ผู้ใช้งาน" : "บทบาทและสิทธิ์"}
                </button>
              ))}
            </div>
            {activeTab === "users" && (
              <div className="flex flex-wrap gap-2">
                <div className="relative">
                  <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={filters.search}
                    onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                    placeholder="ค้นหา email, ชื่อ, role, team"
                    className="h-10 w-72 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[13px] font-semibold outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                  />
                </div>
                <select value={filters.role} onChange={(event) => setFilters((current) => ({ ...current, role: event.target.value }))} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-bold">
                  <option value="ALL">ทุกบทบาท</option>
                  {roles.map((role) => <option key={role.role_code} value={role.role_code}>{role.role_name}</option>)}
                </select>
                <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-bold">
                  {STATUS_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
                <select value={filters.team} onChange={(event) => setFilters((current) => ({ ...current, team: event.target.value }))} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-bold">
                  <option value="ALL">ทุกทีม</option>
                  {teams.map((team) => <option key={team} value={team}>{team}</option>)}
                </select>
              </div>
            )}
          </div>

          {loading ? (
            <div className="px-5 py-12 text-center text-[13px] font-semibold text-slate-400">Loading...</div>
          ) : activeTab === "users" ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-left text-[13px]">
                <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">User</th>
                    <th className="px-5 py-3">Primary role</th>
                    <th className="px-5 py-3">Additional roles</th>
                    <th className="px-5 py-3">Team</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50/80">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-[12px] font-black text-white">{initials(user)}</div>
                          <div>
                            <p className="font-black text-slate-950">{user.fullName || "-"}</p>
                            <p className="mt-0.5 font-mono text-[11px] font-bold text-slate-500">{user.email || "-"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4"><RoleChip role={user.role} roles={roles} /></td>
                      <td className="px-5 py-4">
                        <div className="flex max-w-sm flex-wrap gap-1.5">
                          {(user.additionalRoles || []).length ? user.additionalRoles.map((item) => <RoleChip key={item.role} role={item.role} roles={roles} subtle />) : <span className="text-[12px] font-semibold text-slate-400">ไม่มีบทบาทเสริม</span>}
                        </div>
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-600">{user.teamDepartment || "-"}</td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${user.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{user.isActive ? "ใช้งานอยู่" : "ปิดใช้งาน"}</span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button onClick={() => openEditUser(user)} disabled={!canAdmin} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
                          <Icon name="edit" /> Edit roles
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!filteredUsers.length && (
                    <tr><td colSpan={6} className="px-5 py-10 text-center text-[13px] font-semibold text-slate-400">ไม่พบผู้ใช้งานตามเงื่อนไข</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div>
              <div className="grid gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-4 lg:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Highest access</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="rounded-full bg-slate-950 p-2 text-white"><Icon name="shield" /></span>
                    <div>
                      <p className="text-[14px] font-black text-slate-950">System Admin / Admin</p>
                      <p className="text-[12px] font-semibold text-slate-500">จัดการระบบ ผู้ใช้ บทบาท และ Workflow</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 shadow-sm">
                  <p className="text-[11px] font-black uppercase tracking-wide text-blue-400">Operations access</p>
                  <p className="mt-2 text-[14px] font-black text-slate-950">Project Admin / Supervisor</p>
                  <p className="mt-1 text-[12px] font-semibold text-slate-600">ดูแลโครงการ งานทีม และ exception โดยไม่ใช่สิทธิ์ระบบสูงสุด</p>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 shadow-sm">
                  <p className="text-[11px] font-black uppercase tracking-wide text-emerald-500">Stage roles</p>
                  <p className="mt-2 text-[14px] font-black text-slate-950">Sales / Engineer / Ops / QA / Finance</p>
                  <p className="mt-1 text-[12px] font-semibold text-slate-600">ใช้ผ่าน gate/stage ตาม owner role ที่ workflow กำหนด</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-left text-[13px]">
                  <thead className="bg-white text-[11px] font-black uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-20 px-5 py-3">Rank</th>
                      <th className="px-5 py-3">Role</th>
                      <th className="px-5 py-3">Level / Scope</th>
                      <th className="px-5 py-3">What this role can do</th>
                      <th className="px-5 py-3">Users</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedRoles.map((role) => {
                      const guide = roleGuide(role.role_code);
                      return (
                        <tr key={role.role_code} className="hover:bg-slate-50/80">
                          <td className="px-5 py-4 align-top">
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-[12px] font-black text-slate-600 shadow-sm">
                              {roleRank(role.role_code)}
                            </span>
                          </td>
                          <td className="px-5 py-4 align-top">
                            <div className="flex items-center gap-2 font-black text-slate-950"><Icon name="role" />{role.role_name}</div>
                            <p className="mt-1 font-mono text-[11px] font-bold text-slate-400">{role.role_code}</p>
                          </td>
                          <td className="px-5 py-4 align-top">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${guide.tone}`}>{guide.tier}</span>
                            <p className="mt-2 text-[12px] font-bold text-slate-500">{guide.scope}</p>
                          </td>
                          <td className="max-w-2xl px-5 py-4 align-top">
                            <p className="text-[13px] font-bold text-slate-700">{guide.summary}</p>
                            {role.description && <p className="mt-1 text-[12px] font-semibold text-slate-400">{role.description}</p>}
                          </td>
                          <td className="px-5 py-4 align-top text-[18px] font-black text-slate-950">{role.users_count || 0}</td>
                          <td className="px-5 py-4 align-top">
                            <span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${role.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                              {role.is_active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right align-top">
                            <button
                              onClick={() => openRoleDetail(role.role_code)}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                            >
                              ดูสิทธิ์
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>

      <RoleDetailDrawer
        detail={selectedRoleDetail}
        loading={roleDetailLoading}
        error={roleDetailError}
        canEdit={canAdmin}
        canEditDanger={canAssignSystemAdmin}
        updatingPermissionKey={updatingPermissionKey}
        onTogglePermission={toggleRolePermission}
        onClose={() => {
          setSelectedRoleDetail(null);
          setRoleDetailError("");
          setRoleDetailLoading(false);
          setUpdatingPermissionKey("");
        }}
      />

      {editingUser && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40">
          <aside className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Edit roles</p>
                <h2 className="mt-1 text-[18px] font-black text-slate-950">{editingUser.fullName || editingUser.email}</h2>
                <p className="mt-1 font-mono text-[12px] font-bold text-slate-500">{editingUser.email}</p>
              </div>
              <button onClick={() => setEditingUser(null)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><Icon name="close" /></button>
            </div>

            <div className="space-y-5 p-5">
              <label className="block">
                <span className="text-[12px] font-black text-slate-700">Primary role</span>
                <select value={primaryRoleDraft} onChange={(event) => setPrimaryRoleDraft(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-bold outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50">
                  {activeRoles.map((role) => (
                    <option key={role.role_code} value={role.role_code} disabled={role.role_code === "system_admin" && !canAssignSystemAdmin}>
                      {role.role_name} ({role.role_code})
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <p className="text-[12px] font-black text-slate-700">Additional roles</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {activeRoles.filter((role) => role.role_code !== primaryRoleDraft).map((role) => (
                    <label key={role.role_code} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                      <input
                        type="checkbox"
                        checked={roleDraft.includes(role.role_code)}
                        disabled={role.role_code === "system_admin" && !canAssignSystemAdmin}
                        onChange={() => toggleAdditionalRole(role.role_code)}
                        className="mt-1 h-4 w-4 accent-slate-950"
                      />
                      <span>
                        <span className="block text-[12px] font-black text-slate-800">{role.role_name}</span>
                        <span className="font-mono text-[10px] font-bold text-slate-400">{role.role_code}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[12px] font-black text-slate-700">Team</span>
                  <input value={teamDraft} onChange={(event) => setTeamDraft(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-[13px] font-semibold outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50" />
                </label>
                <label className="block">
                  <span className="text-[12px] font-black text-slate-700">Expires at</span>
                  <input type="datetime-local" value={expiresAtDraft} onChange={(event) => setExpiresAtDraft(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-[13px] font-semibold outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50" />
                </label>
              </div>

              <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <input type="checkbox" checked={activeDraft} disabled={editingUser.role === "system_admin"} onChange={(event) => setActiveDraft(event.target.checked)} className="mt-1 h-4 w-4 accent-slate-950" />
                <span><span className="block text-[12px] font-black text-slate-800">ใช้งานอยู่</span><span className="text-[11px] font-semibold text-slate-500">ปิดได้เฉพาะผู้ใช้ทั่วไป ไม่อนุญาตให้ปิด system_admin</span></span>
              </label>

              <label className="block">
                <span className="text-[12px] font-black text-slate-700">Reason</span>
                <textarea value={reasonDraft} onChange={(event) => setReasonDraft(event.target.value)} placeholder="เหตุผลการเปลี่ยนบทบาท (optional)" className="mt-2 min-h-24 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-semibold outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50" />
              </label>
            </div>

            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white px-5 py-4">
              <button onClick={() => setEditingUser(null)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-[13px] font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={saveUserRoles} disabled={saving} className="rounded-lg bg-slate-950 px-4 py-2 text-[13px] font-bold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">{saving ? "Saving..." : "Save changes"}</button>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
