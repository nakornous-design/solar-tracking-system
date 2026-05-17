import { formatDateTime, statusLabel, workflowTypeLabel } from "@/lib/project-ui";

type ApprovalCenterProps = {
  approvalItems: any[];
  projects: any[];
  approvalLoading: string | null;
  onOpenProject: (project: any) => void;
  onDecision: (approvalId: string, decision: "APPROVED" | "REJECTED") => void;
};

function relatedProject(row: any) {
  return Array.isArray(row?.projects) ? row.projects[0] : row?.projects;
}

function relatedStage(row: any) {
  return Array.isArray(row?.project_stages) ? row.project_stages[0] : row?.project_stages;
}

function approvalStatusClass(status?: string) {
  if (status === "APPROVED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "REJECTED") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "PENDING") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export default function ApprovalCenter({
  approvalItems,
  projects,
  approvalLoading,
  onOpenProject,
  onDecision,
}: ApprovalCenterProps) {
  const pendingApprovalItems = approvalItems.filter((approval) => approval.status === "PENDING");
  const decidedApprovalItems = approvalItems.filter((approval) => approval.status !== "PENDING");
  const overrideApprovalItems = approvalItems.filter((approval) => approval.type === "GATE_OVERRIDE");
  const approvalProjectsCount = new Set(approvalItems.map((approval) => approval.project_id).filter(Boolean)).size;

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {[
          ["รออนุมัติ", pendingApprovalItems.length, pendingApprovalItems.length ? "text-amber-600" : "text-slate-900"],
          ["อนุมัติแล้ว", decidedApprovalItems.filter((approval) => approval.status === "APPROVED").length, "text-emerald-600"],
          ["ปฏิเสธ", decidedApprovalItems.filter((approval) => approval.status === "REJECTED").length, "text-rose-600"],
          ["โครงการ", approvalProjectsCount, "text-slate-900"],
        ].map(([label, value, className]) => (
          <div key={label as string} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[12px] font-bold text-slate-500">{label}</p>
            <p className={`mt-2 text-3xl font-black ${className}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h3 className="text-[14px] font-bold text-slate-950">คิวอนุมัติ Override</h3>
              <p className="text-[12px] text-slate-500">รายการที่ต้องตัดสินใจ พร้อมเหตุผล โครงการ และ stage ที่เกี่ยวข้อง</p>
            </div>
            <span className={`rounded-md border px-2.5 py-1 text-[11px] font-bold ${pendingApprovalItems.length ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}>
              {pendingApprovalItems.length ? `${pendingApprovalItems.length} รออนุมัติ` : "ไม่มีค้าง"}
            </span>
          </div>
          {pendingApprovalItems.length === 0 ? (
            <div className="px-5 py-10 text-center text-[13px] font-medium text-slate-400">ไม่มีคำขออนุมัติค้างอยู่</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {pendingApprovalItems.map((approval) => {
                const project = relatedProject(approval);
                const stage = relatedStage(approval);
                const matchedProject = projects.find((item) => item.id === approval.project_id);

                return (
                  <div key={approval.id} className="px-5 py-4 transition-colors hover:bg-slate-50">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className={`rounded border px-2 py-1 text-[10px] font-bold ${approvalStatusClass(approval.status)}`}>{statusLabel(approval.status)}</span>
                          <span className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600">{workflowTypeLabel(approval.type)}</span>
                          <span className="text-[11px] font-semibold text-slate-400">{project?.customer_code || "ไม่พบโครงการ"}{stage?.name ? ` / ${stage.name}` : ""}</span>
                        </div>
                        <p className="line-clamp-2 text-[13px] font-bold text-slate-950">{approval.reason || "ไม่มีเหตุผลประกอบ"}</p>
                        <div className="mt-3 grid gap-2 text-[11px] font-semibold text-slate-500 sm:grid-cols-3">
                          <span>Stage: <b className="text-slate-800">{stage?.code || "N/A"}</b></span>
                          <span>SLA: <b className="text-slate-800">{statusLabel(stage?.sla_status) || "N/A"}</b></span>
                          <span>สร้างเมื่อ: <b className="text-slate-800">{formatDateTime(approval.created_at)}</b></span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col gap-2">
                        <button
                          onClick={() => matchedProject && onOpenProject(matchedProject)}
                          disabled={!matchedProject}
                          className="rounded border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                        >
                          เปิดโครงการ
                        </button>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => onDecision(approval.id, "APPROVED")}
                            disabled={Boolean(approvalLoading)}
                            className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            อนุมัติ
                          </button>
                          <button
                            onClick={() => onDecision(approval.id, "REJECTED")}
                            disabled={Boolean(approvalLoading)}
                            className="rounded border border-rose-200 bg-white px-3 py-2 text-[11px] font-bold text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            ปฏิเสธ
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-[14px] font-bold text-slate-950">กติกา Override</h3>
            <div className="mt-4 space-y-3 text-[12px] font-semibold text-slate-600">
              <div className="flex items-start gap-2"><span className="mt-1 h-2 w-2 rounded-full bg-amber-500"></span><p>ทุก override ต้องมีเหตุผล และถูกบันทึกใน audit log</p></div>
              <div className="flex items-start gap-2"><span className="mt-1 h-2 w-2 rounded-full bg-rose-500"></span><p>Hard gate ที่ไม่อนุญาต override ต้องแก้ให้ครบก่อนเลื่อน stage</p></div>
              <div className="flex items-start gap-2"><span className="mt-1 h-2 w-2 rounded-full bg-emerald-500"></span><p>อนุมัติแล้วมีผลเฉพาะโครงการและ stage นั้นเท่านั้น</p></div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-[14px] font-bold text-slate-950">ภาพรวมคำขอ</h3>
            <div className="mt-4 space-y-3">
              {[
                ["ขอข้าม Gate", overrideApprovalItems.length, "bg-amber-500"],
                ["รออนุมัติ", pendingApprovalItems.length, "bg-sky-500"],
                ["ตัดสินใจแล้ว", decidedApprovalItems.length, "bg-emerald-500"],
              ].map(([label, value, color]) => (
                <div key={label as string} className="flex items-center justify-between gap-3 text-[12px]">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${color}`}></span>
                    <span className="truncate font-semibold text-slate-600">{label}</span>
                  </div>
                  <span className="font-bold text-slate-950">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-[14px] font-bold text-slate-950">ประวัติการอนุมัติล่าสุด</h3>
            <p className="text-[12px] text-slate-500">ใช้ตรวจย้อนหลังว่าใครตัดสินใจอะไร และเกี่ยวกับโครงการไหน</p>
          </div>
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-600">{decidedApprovalItems.length} รายการ</span>
        </div>
        {decidedApprovalItems.length === 0 ? (
          <div className="px-5 py-8 text-center text-[13px] font-medium text-slate-400">ยังไม่มีประวัติการอนุมัติหรือปฏิเสธ</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {decidedApprovalItems.slice(0, 12).map((approval) => {
              const project = relatedProject(approval);
              const stage = relatedStage(approval);

              return (
                <div key={approval.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className={`rounded border px-2 py-1 text-[10px] font-bold ${approvalStatusClass(approval.status)}`}>{statusLabel(approval.status)}</span>
                      <span className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600">{workflowTypeLabel(approval.type)}</span>
                      <span className="text-[11px] font-semibold text-slate-400">{project?.customer_code || "ไม่พบโครงการ"}{stage?.name ? ` / ${stage.name}` : ""}</span>
                    </div>
                    <p className="line-clamp-1 text-[13px] font-bold text-slate-950">{approval.reason || "ไม่มีเหตุผลประกอบ"}</p>
                    {approval.decision_reason && <p className="mt-1 line-clamp-1 text-[12px] font-medium text-slate-500">{approval.decision_reason}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] font-bold text-slate-700">{formatDateTime(approval.decided_at || approval.created_at)}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{stage?.code || "N/A"}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
