"use client";

import { channelLabel, severityLabel, stageDisplay, statusLabel } from "@/lib/project-ui";

type NotificationPanelProps = {
  notifications: any[];
  projects: any[];
  filters: {
    status: string;
    severity: string;
    channel: string;
    projectId: string;
  };
  loadingId: string | null;
  refreshing?: boolean;
  onFilterChange: (filters: NotificationPanelProps["filters"]) => void;
  onRefresh: () => void;
  onMarkRead: (notificationId: string) => void;
  onOpenProject: (notification: any) => void;
};

function notificationToneClass(severity?: string) {
  if (severity === "CRITICAL" || severity === "HIGH") return "border-rose-200 bg-rose-50 text-rose-700";
  if (severity === "WARNING") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function relatedLabel(notification: any) {
  const project = Array.isArray(notification.projects) ? notification.projects[0] : notification.projects;
  const stage = Array.isArray(notification.project_stages) ? notification.project_stages[0] : notification.project_stages;
  return [project?.customer_code, stage ? stageDisplay(stage).title : null].filter(Boolean).join(" / ") || "ระบบ";
}

export default function NotificationPanel({
  notifications,
  projects,
  filters,
  loadingId,
  refreshing,
  onFilterChange,
  onRefresh,
  onMarkRead,
  onOpenProject,
}: NotificationPanelProps) {
  const statusSummary = filters.status === "ACTIVE" ? "ที่ยังต้องดู" : statusLabel(filters.status);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-[14px] font-bold text-slate-950">ศูนย์แจ้งเตือน</h3>
            <p className="text-[12px] text-slate-500">รวมแจ้งเตือนจาก workflow, SLA, exception และ approval</p>
          </div>
          <span className={`rounded-md border px-2.5 py-1 text-[11px] font-bold ${notifications.length ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}>
            {notifications.length ? `${notifications.length} ${statusSummary}` : "ไม่มีค้าง"}
          </span>
        </div>

        <div className="grid gap-2 md:grid-cols-[140px_140px_140px_minmax(0,1fr)_auto]">
          <select
            value={filters.status}
            onChange={(event) => onFilterChange({ ...filters, status: event.target.value })}
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-700 outline-none focus:border-emerald-400"
          >
            <option value="ACTIVE">ที่ยังต้องดู</option>
            <option value="ALL">ทุกสถานะ</option>
            <option value="PENDING">รอดำเนินการ</option>
            <option value="SENT">ส่งแล้ว</option>
            <option value="READ">อ่านแล้ว</option>
            <option value="FAILED">ไม่สำเร็จ</option>
            <option value="CANCELLED">ยกเลิก</option>
          </select>
          <select
            value={filters.severity}
            onChange={(event) => onFilterChange({ ...filters, severity: event.target.value })}
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-700 outline-none focus:border-emerald-400"
          >
            <option value="ALL">ทุกระดับ</option>
            <option value="CRITICAL">วิกฤต</option>
            <option value="HIGH">สูง</option>
            <option value="WARNING">เตือน</option>
            <option value="INFO">ข้อมูล</option>
          </select>
          <select
            value={filters.channel}
            onChange={(event) => onFilterChange({ ...filters, channel: event.target.value })}
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-700 outline-none focus:border-emerald-400"
          >
            <option value="ALL">ทุกช่องทาง</option>
            <option value="IN_APP">ในระบบ</option>
            <option value="EMAIL">อีเมล</option>
            <option value="LINE">LINE</option>
          </select>
          <select
            value={filters.projectId}
            onChange={(event) => onFilterChange({ ...filters, projectId: event.target.value })}
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-700 outline-none focus:border-emerald-400"
          >
            <option value="ALL">ทุกโครงการ</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.customer_code || project.customer_name || project.id}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            {refreshing ? "กำลังโหลด..." : "รีเฟรช"}
          </button>
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className="px-5 py-8 text-center text-[13px] font-medium text-slate-400">ไม่มีแจ้งเตือนตามตัวกรองนี้</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {notifications.map((notification) => (
            <div key={notification.id} className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${notificationToneClass(notification.severity)}`}>
                    {severityLabel(notification.severity)}
                  </span>
                  <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                    {statusLabel(notification.status)}
                  </span>
                  <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                    {channelLabel(notification.channel)}
                  </span>
                  <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                    L{notification.escalation_level || 0}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400">{relatedLabel(notification)}</span>
                </div>
                <p className="truncate text-[13px] font-bold text-slate-950">{notification.title}</p>
                {notification.message && <p className="mt-1 line-clamp-2 text-[12px] text-slate-500">{notification.message}</p>}
              </div>

              <div className="flex shrink-0 items-center gap-2 self-center">
                <button
                  type="button"
                  onClick={() => onOpenProject(notification)}
                  disabled={!notification.project_id}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                >
                  เปิดโครงการ
                </button>
                <button
                  type="button"
                  onClick={() => onMarkRead(notification.id)}
                  disabled={loadingId === notification.id || notification.status === "READ"}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                >
                  {loadingId === notification.id ? "กำลังบันทึก..." : notification.status === "READ" ? "อ่านแล้ว" : "ทำเครื่องหมายว่าอ่านแล้ว"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
