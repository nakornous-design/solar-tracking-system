"use client";

type ProfileAdminPanelProps = {
  users: any[];
  roles: Array<{ role_code: string; role_name: string; is_active: boolean }>;
  loadingId: string | null;
  onRefresh: () => void;
  onBootstrap: () => void;
  onCreateUser: (draft: { email: string; password: string; fullName: string; role: string; isActive: boolean; emailConfirmed: boolean }) => void;
  onSave: (user: any, draft: { fullName: string; role: string; isActive: boolean }) => void;
};

function roleOptions(roles: ProfileAdminPanelProps["roles"], currentRole?: string | null) {
  const normalizedRole = String(currentRole || "").trim();
  const activeRoles = roles.filter((role) => role.is_active || role.role_code === normalizedRole);
  if (!normalizedRole || activeRoles.some((role) => role.role_code === normalizedRole)) return activeRoles;
  return [{ role_code: normalizedRole, role_name: normalizedRole, is_active: true }, ...activeRoles];
}

function roleOptionLabel(role: { role_code: string; role_name: string }) {
  return `${role.role_name || role.role_code} (${role.role_code})`;
}

export default function ProfileAdminPanel({ users, roles, loadingId, onRefresh, onBootstrap, onCreateUser, onSave }: ProfileAdminPanelProps) {
  const fallbackRoles = roles.length ? roles : [{ role_code: "ops", role_name: "ทีมปฏิบัติการ", is_active: true }];

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div>
          <h3 className="text-[14px] font-bold text-slate-950">ผู้ใช้งานและสิทธิ์</h3>
          <p className="text-[12px] text-slate-500">เพิ่มผู้ใช้จริง กำหนด role และเปิด/ปิดสิทธิ์สำหรับระบบปฏิบัติการ</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onBootstrap}
            disabled={loadingId === "__bootstrap__"}
            className="rounded-md bg-slate-950 px-3 py-2 text-[11px] font-bold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {loadingId === "__bootstrap__" ? "กำลังตั้งค่า..." : "ตั้งฉันเป็น Admin"}
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            รีเฟรช
          </button>
        </div>
      </div>

      <form
        className="border-b border-slate-100 bg-slate-50/60 px-5 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const formData = new FormData(form);
          onCreateUser({
            email: String(formData.get("email") || ""),
            password: String(formData.get("password") || ""),
            fullName: String(formData.get("fullName") || ""),
            role: String(formData.get("role") || "ops"),
            isActive: formData.get("isActive") === "on",
            emailConfirmed: formData.get("emailConfirmed") === "on",
          });
          form.reset();
        }}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h4 className="text-[13px] font-bold text-slate-950">เพิ่มผู้ใช้งาน</h4>
            <p className="text-[11px] font-medium text-slate-500">สร้าง Supabase Auth user พร้อม profile role ในขั้นตอนเดียว</p>
          </div>
          <button
            type="submit"
            disabled={loadingId === "__create_user__"}
            className="rounded-md bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {loadingId === "__create_user__" ? "กำลังสร้าง..." : "สร้างผู้ใช้"}
          </button>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr_1fr_0.8fr_auto_auto]">
          <input
            name="email"
            type="email"
            required
            placeholder="อีเมลผู้ใช้งาน"
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-800 outline-none focus:border-emerald-400"
          />
          <input
            name="password"
            type="password"
            required
            minLength={8}
            placeholder="รหัสผ่านชั่วคราว"
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-800 outline-none focus:border-emerald-400"
          />
          <input
            name="fullName"
            placeholder="ชื่อ-นามสกุล"
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-800 outline-none focus:border-emerald-400"
          />
          <select
            name="role"
            defaultValue="ops"
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-[12px] font-bold text-slate-700 outline-none focus:border-emerald-400"
          >
            {roleOptions(fallbackRoles, "ops").map((role) => <option key={role.role_code} value={role.role_code}>{roleOptionLabel(role)}</option>)}
          </select>
          <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
            <input name="isActive" type="checkbox" defaultChecked className="h-4 w-4 accent-emerald-600" />
            เปิดใช้งาน
          </label>
          <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
            <input name="emailConfirmed" type="checkbox" defaultChecked className="h-4 w-4 accent-emerald-600" />
            ยืนยันอีเมล
          </label>
        </div>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-[12px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">ผู้ใช้งาน</th>
              <th className="px-4 py-3">ชื่อ</th>
              <th className="px-4 py-3">สิทธิ์</th>
              <th className="px-4 py-3">ใช้งาน</th>
              <th className="px-4 py-3">สถานะ</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[12px] font-medium text-slate-400">ยังไม่มีผู้ใช้งานใน Auth</td>
              </tr>
            ) : users.map((user) => {
              const profile = user.profile || {};
              const draft = {
                fullName: profile.full_name || "",
                role: profile.role || "ops",
                isActive: profile.is_active !== false,
              };

              return (
                <tr key={user.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-950">{user.email || "ไม่มีอีเมล"}</p>
                    <p className="mt-0.5 font-mono text-[10px] font-semibold text-slate-400">{user.id}</p>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      defaultValue={draft.fullName}
                      id={`profile-name-${user.id}`}
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-700 outline-none focus:border-emerald-400"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      defaultValue={draft.role}
                      id={`profile-role-${user.id}`}
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px] font-bold text-slate-700 outline-none focus:border-emerald-400"
                    >
                      {roleOptions(fallbackRoles, draft.role).map((role) => <option key={role.role_code} value={role.role_code}>{roleOptionLabel(role)}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      defaultChecked={draft.isActive}
                      id={`profile-active-${user.id}`}
                      className="h-4 w-4 accent-emerald-600"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded border px-2 py-1 text-[10px] font-bold ${profile.id ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                      {profile.id ? 'พร้อมใช้' : 'ยังไม่มี Profile'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        const fullName = (document.getElementById(`profile-name-${user.id}`) as HTMLInputElement | null)?.value || "";
                        const role = (document.getElementById(`profile-role-${user.id}`) as HTMLSelectElement | null)?.value || "ops";
                        const isActive = Boolean((document.getElementById(`profile-active-${user.id}`) as HTMLInputElement | null)?.checked);
                        onSave(user, { fullName, role, isActive });
                      }}
                      disabled={loadingId === user.id}
                      className="rounded-md bg-slate-950 px-3 py-2 text-[11px] font-bold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {loadingId === user.id ? "กำลังบันทึก..." : "บันทึก"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
