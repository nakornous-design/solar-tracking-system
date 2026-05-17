import {
  exceptionCategoryLabel,
  formatDateTime,
  roleLabel,
  severityLabel,
  stageDisplay,
  statusLabel,
} from "@/lib/project-ui";

type ExceptionDrawerProps = {
  exception: any;
  onClose: () => void;
  onAction: (exceptionId: string, status: string) => void;
  onOpenProject: (exception: any) => void;
};

function relatedProject(row: any) {
  return Array.isArray(row?.projects) ? row.projects[0] : row?.projects;
}

function relatedStage(row: any) {
  return Array.isArray(row?.project_stages) ? row.project_stages[0] : row?.project_stages;
}

function exceptionToneClass(severity?: string) {
  if (severity === "CRITICAL") return "border-rose-200 bg-rose-50 text-rose-700";
  if (severity === "HIGH") return "border-orange-200 bg-orange-50 text-orange-700";
  if (severity === "WARNING") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function projectStageToneClass(stage: any) {
  if (!stage) return "border-slate-200 bg-slate-50 text-slate-500";
  if (stage.sla_status === "OVER_SLA") return "border-rose-200 bg-rose-50 text-rose-700";
  if (stage.sla_status === "NEAR_SLA") return "border-amber-200 bg-amber-50 text-amber-700";
  if (stage.status === "BLOCKED") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export default function ExceptionDrawer({ exception, onClose, onAction, onOpenProject }: ExceptionDrawerProps) {
  const project = relatedProject(exception);
  const stage = relatedStage(exception);

  return (
    <div className="fixed inset-0 z-[95] flex justify-end bg-slate-950/30 backdrop-blur-[2px]" onClick={onClose}>
      <aside className="h-full w-full max-w-[520px] overflow-y-auto border-l border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={`rounded border px-2 py-1 text-[10px] font-bold ${exceptionToneClass(exception.severity)}`}>{severityLabel(exception.severity)}</span>
                <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-600">{statusLabel(exception.status)}</span>
                {exception.category && <span className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-500">{exceptionCategoryLabel(exception.category)}</span>}
              </div>
              <h2 className="text-lg font-bold text-slate-950">{exception.title}</h2>
              <p className="mt-1 text-[12px] font-medium text-slate-500">{project?.customer_code || "ไม่พบโครงการ"}{stage ? ` / ${stageDisplay(stage).title}` : ""}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="space-y-5 px-5 py-5">
          <section className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">รายละเอียดปัญหา</p>
            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-slate-700">{exception.description || "ไม่มีรายละเอียดเพิ่มเติม"}</p>
          </section>

          <section className="grid grid-cols-2 gap-3">
            {[
              { label: "ผู้รับผิดชอบ", value: roleLabel(exception.owner_role) },
              { label: "ตรวจพบเมื่อ", value: formatDateTime(exception.detected_at) },
              { label: "โครงการ", value: project?.customer_name || project?.customer_code || "N/A" },
              { label: "ขั้นตอน", value: stage ? stageDisplay(stage).title : "N/A" },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{item.label}</p>
                <p className="mt-1 truncate text-[13px] font-bold text-slate-900">{item.value}</p>
              </div>
            ))}
          </section>

          {stage && (
            <section className="rounded-lg border border-slate-200 bg-white px-4 py-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[13px] font-bold text-slate-950">บริบทของ Stage</h3>
                <span className={`rounded border px-2 py-1 text-[10px] font-bold ${projectStageToneClass(stage)}`}>{statusLabel(stage.sla_status || stage.status)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[12px] font-medium text-slate-500">
                <div className="flex justify-between gap-2"><span>Code</span><b className="text-slate-800">{stage.code || "N/A"}</b></div>
                <div className="flex justify-between gap-2"><span>สถานะ</span><b className="text-slate-800">{statusLabel(stage.status)}</b></div>
              </div>
            </section>
          )}

          <section className="rounded-lg border border-slate-200 bg-white px-4 py-4">
            <h3 className="text-[13px] font-bold text-slate-950">อัปเดตสถานะปัญหา</h3>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onAction(exception.id, "ACKNOWLEDGED")}
                disabled={exception.status !== "OPEN"}
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] font-bold text-amber-700 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300"
              >
                รับทราบ
              </button>
              <button
                type="button"
                onClick={() => onAction(exception.id, "IN_PROGRESS")}
                disabled={exception.status === "IN_PROGRESS"}
                className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2.5 text-[11px] font-bold text-sky-700 transition-colors hover:bg-sky-100 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300"
              >
                เริ่มแก้
              </button>
              <button
                type="button"
                onClick={() => onAction(exception.id, "RESOLVED")}
                className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100"
              >
                ปิดปัญหา
              </button>
            </div>
          </section>

          <button
            type="button"
            onClick={() => onOpenProject(exception)}
            className="w-full rounded-md bg-slate-950 px-4 py-3 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-slate-800"
          >
            เปิดโครงการและ Stage ที่เกี่ยวข้อง
          </button>
        </div>
      </aside>
    </div>
  );
}
