"use client";

type ActiveTab = "dashboard" | "projects" | "field" | "scheduling" | "billing" | "qa" | "approvals" | "settings";

type AppHeaderProps = {
  activeTab: ActiveTab;
  selectedProject: any | null;
  milestones: any[];
  totalMilestones: number;
  completedMilestones: number;
  progressPercent: number;
  overdueMilestones: number;
  nearSlaMilestones: number;
  timelineTargetStage: any | null;
  timelineTargetIndex: number;
  timelineProgressPercent: number;
  timelineRailTone: "rose" | "amber" | "emerald";
  timelineElapsed: number | null;
  refreshingSla: boolean;
  stageTitle: (stage: any) => string;
  formatSlaDuration: (hours?: number) => string;
  onGoProjects: () => void;
  onRefreshSla: () => void;
  onRefreshAll: () => void;
  onNewProject: () => void;
  onBackToProjects: () => void;
  userEmail?: string | null;
  userRoleLabel?: string | null;
  onOpenAuth: () => void;
  onSignOut: () => void;
};

const tabLabels: Record<ActiveTab, { crumb: string; title: string; description?: string }> = {
  dashboard: {
    crumb: "Project Pipeline",
    title: "Project Pipeline by Stage",
  },
  projects: { crumb: "โครงการ", title: "โครงการ" },
  field: {
    crumb: "งานหน้างาน",
    title: "งานหน้างาน",
    description: "Check-in อัปโหลดหลักฐาน ปิด gate และส่งงานหน้างาน",
  },
  scheduling: {
    crumb: "ตารางงาน",
    title: "ตารางงานติดตั้ง",
    description: "จัดทีมและวันติดตั้ง พร้อมดู SLA และความซ้ำซ้อนของทีม",
  },
  billing: {
    crumb: "วางบิล",
    title: "ศูนย์วางบิล",
    description: "ตรวจ Invoice, PAC และ FBOQ ก่อนอนุมัติวางบิล",
  },
  qa: {
    crumb: "ตรวจคุณภาพ",
    title: "ตรวจคุณภาพ",
    description: "ตรวจ gate คุณภาพ ผ่าน QA ไม่ผ่าน QA หรือส่งกลับแก้งาน",
  },
  approvals: {
    crumb: "อนุมัติ",
    title: "อนุมัติและ Override",
    description: "ควบคุมคำขออนุมัติและ override พร้อม audit trail",
  },
  settings: {
    crumb: "ตั้งค่าระบบ",
    title: "ตั้งค่า Workflow",
    description: "จัดการ source of truth, workflow version, SLA, owner และ hard gate",
  },
};
function railDotClass(tone: "rose" | "amber" | "emerald") {
  if (tone === "rose") return "bg-rose-500";
  if (tone === "amber") return "bg-amber-500";
  return "bg-emerald-500";
}

function railTextClass(tone: "rose" | "amber" | "emerald") {
  if (tone === "rose") return "text-rose-600";
  if (tone === "amber") return "text-amber-600";
  return "text-emerald-600";
}

function railFillClass(tone: "rose" | "amber" | "emerald") {
  if (tone === "rose") return "bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500";
  if (tone === "amber") return "bg-gradient-to-r from-emerald-400 via-teal-400 to-amber-400";
  return "bg-gradient-to-r from-emerald-500 via-teal-400 to-sky-400";
}

function railMarkerClass(tone: "rose" | "amber" | "emerald", isTarget: boolean, isPassed: boolean) {
  if (isTarget) {
    if (tone === "rose") return "border-rose-500 bg-white text-rose-600 shadow ring-2 ring-rose-50";
    if (tone === "amber") return "border-amber-500 bg-white text-amber-600 shadow ring-2 ring-amber-50";
    return "border-emerald-500 bg-white text-emerald-600 shadow ring-2 ring-emerald-50";
  }

  if (isPassed) return "border-white bg-emerald-500 text-white shadow-sm";
  return "border-slate-200 bg-white text-slate-400";
}

export default function AppHeader({
  activeTab,
  selectedProject,
  milestones,
  totalMilestones,
  completedMilestones,
  progressPercent,
  overdueMilestones,
  nearSlaMilestones,
  timelineTargetStage,
  timelineTargetIndex,
  timelineProgressPercent,
  timelineRailTone,
  timelineElapsed,
  refreshingSla,
  stageTitle,
  formatSlaDuration,
  onGoProjects,
  onRefreshSla,
  onRefreshAll,
  onNewProject,
  onBackToProjects,
  userEmail,
  userRoleLabel,
  onOpenAuth,
  onSignOut,
}: AppHeaderProps) {
  const currentTab = tabLabels[activeTab];
  const title = activeTab === "projects" && selectedProject ? selectedProject.customer_name : currentTab.title;
  const showProjectRail = activeTab === "projects" && selectedProject && totalMilestones > 0;
  const compactHeader = activeTab === "scheduling";
  const customerIntake = selectedProject?.customer_intake || {};
  const contactName = customerIntake.contactName || "-";
  const contactPhone = selectedProject?.customer_phone || customerIntake.customerPhone || customerIntake.contactPhone || "-";
  const siteDistrict = customerIntake.siteDistrict || "-";
  const siteProvince = customerIntake.siteProvince || "-";
  const isProjectClosed = selectedProject?.status === "COMPLETED" || timelineTargetStage?.code === "CLOSURE";

  return (
    <div className={`sticky top-0 z-10 flex shrink-0 items-center border-b border-slate-200 bg-white ${compactHeader ? "h-16" : selectedProject ? "min-h-[126px] py-4" : "h-[90px]"}`}>
      <div className={`flex w-full items-center justify-between gap-8 px-6 md:px-8 ${activeTab === "dashboard" || compactHeader ? "max-w-none" : selectedProject ? "max-w-none" : "max-w-[1200px]"}`}>
        <div className={`${selectedProject ? "w-[300px] shrink-0" : "min-w-0"} self-center`}>
          <div className={`${compactHeader ? "mb-0" : "mb-1.5"} flex flex-wrap items-center gap-2 text-[13px] font-medium text-slate-500`}>
            <span>SunBase</span>
            <span className="text-slate-300">/</span>
            {activeTab === "projects" && selectedProject ? (
              <>
                <button onClick={onGoProjects} className="transition-colors hover:text-slate-900">โครงการ</button>
                <span className="text-slate-300">/</span>
                <span className="font-semibold text-slate-950">{selectedProject.customer_code}</span>
              </>
            ) : (
              <span className="font-semibold text-slate-950">{currentTab.crumb}</span>
            )}
          </div>

          {!compactHeader && <h2 className="text-[20px] font-semibold leading-tight tracking-tight text-slate-950">{title}</h2>}
          {activeTab === "projects" && selectedProject && (
            <div className="mt-2 space-y-1 text-[12px] font-semibold text-slate-500">
              <p className="text-slate-600">
                <span className="font-bold text-slate-800">อ.{siteDistrict} จ.{siteProvince}</span>
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>ผู้ติดต่อ <b className="font-bold text-slate-800">{contactName}</b></span>
                <span className="text-slate-300">/</span>
                <span>โทร <b className="font-bold text-slate-800">{contactPhone}</b></span>
              </div>
            </div>
          )}
          {!compactHeader && currentTab.description && <p className="mt-2 text-[12px] leading-none text-slate-500">{currentTab.description}</p>}
        </div>

        {showProjectRail && (
          <div className="hidden min-w-[700px] max-w-[1080px] flex-1 self-center xl:block">
            <div className="rounded-xl bg-slate-50/70 px-4 py-3">
              <div className="mb-3 flex items-center justify-between gap-5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${railDotClass(timelineRailTone)}`}></span>
                  <p className="truncate text-[13px] font-bold text-slate-950">
                    {isProjectClosed ? "ปิดโครงการแล้ว" : `อยู่ในขั้นตอน : ${timelineTargetStage ? stageTitle(timelineTargetStage) : "Workflow"}`}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1 rounded-lg bg-white/85 p-1 shadow-sm ring-1 ring-slate-100">
                  <div className="min-w-[76px] rounded-md px-2.5 py-1.5 text-center">
                    <p className="text-[8px] font-bold uppercase tracking-wide text-slate-400">ความคืบหน้า</p>
                    <p className="mt-0.5 text-[14px] font-black leading-none text-slate-950">{progressPercent}%</p>
                  </div>
                  <div className="min-w-[76px] rounded-md px-2.5 py-1.5 text-center">
                    <p className="text-[8px] font-bold uppercase tracking-wide text-slate-400">ขั้นตอน</p>
                    <p className="mt-0.5 text-[14px] font-black leading-none text-slate-950">
                      {completedMilestones}<span className="text-[11px] font-bold text-slate-400">/{totalMilestones}</span>
                    </p>
                  </div>
                  <div className="min-w-[76px] rounded-md px-2.5 py-1.5 text-center">
                    <p className="text-[8px] font-bold uppercase tracking-wide text-slate-400">SLA</p>
                    <p className={`mt-0.5 text-[14px] font-black leading-none ${overdueMilestones > 0 ? "text-rose-600" : nearSlaMilestones > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                      {overdueMilestones > 0 ? "เสี่ยง" : nearSlaMilestones > 0 ? "ใกล้หมด" : "ปกติ"}
                    </p>
                  </div>
                  <div className="min-w-[76px] rounded-md px-2.5 py-1.5 text-center">
                    <p className="text-[8px] font-bold uppercase tracking-wide text-slate-400">ใช้เวลา</p>
                    <p className={`mt-0.5 truncate text-[13px] font-black leading-none ${railTextClass(timelineRailTone)}`}>
                      {timelineElapsed ? formatSlaDuration(timelineElapsed) : "N/A"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="relative h-6">
                <div className="absolute left-0 right-0 top-2 h-2 rounded-full bg-slate-100 shadow-inner ring-1 ring-slate-200/70"></div>
                <div className={`execution-rail-fill absolute left-0 top-2 h-2 rounded-full shadow-sm ${railFillClass(timelineRailTone)}`} style={{ width: `${timelineProgressPercent}%` }}></div>
                <div className="absolute inset-x-0 top-[3px] flex justify-between">
                  {milestones.map((stage, index) => {
                    const isPassed = index <= timelineTargetIndex;
                    const isTarget = stage.id === timelineTargetStage?.id;

                    return (
                      <span key={stage.id} className={`relative flex h-4 w-4 items-center justify-center rounded-full border text-[8px] font-bold ${railMarkerClass(timelineRailTone, isTarget, isPassed)}`}>
                        {isPassed && !isTarget ? (
                          <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          index + 1
                        )}
                      </span>
                    );
                  })}
                </div>
                <div className="absolute inset-x-0 top-[21px] flex justify-between text-[8px] font-bold uppercase tracking-wide text-slate-400">
                  <span>{milestones[0] ? stageTitle(milestones[0]) : "เริ่ม"}</span>
                  <span>{milestones[milestones.length - 1] ? stageTitle(milestones[milestones.length - 1]) : "จบ"}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex shrink-0 items-center gap-3">
          {userEmail ? (
            <div className="hidden items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] font-bold text-slate-600 lg:flex">
              <span className="max-w-[150px] truncate">{userEmail}</span>
              {userRoleLabel && <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-500">{userRoleLabel}</span>}
              <button type="button" onClick={onSignOut} className="text-slate-400 transition-colors hover:text-slate-900">
                ออกจากระบบ
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              เข้าสู่ระบบ
            </button>
          )}
          {activeTab === "projects" && selectedProject && (
            <button
              onClick={onRefreshSla}
              disabled={refreshingSla}
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshingSla ? "กำลังตรวจ SLA..." : "รีเฟรช SLA"}
            </button>
          )}
          <button onClick={onRefreshAll} className="rounded-md border border-slate-200 p-2 text-sm text-slate-500 transition-colors hover:text-slate-800">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          {activeTab === "projects" && !selectedProject && (
            <button onClick={onNewProject} className="rounded-md bg-emerald-500 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-emerald-600">
              สร้างโครงการ
            </button>
          )}
          {activeTab === "projects" && selectedProject && (
            <button onClick={onBackToProjects} className="rounded-md border border-slate-200 px-4 py-2 text-[13px] font-medium text-slate-700 transition-colors hover:bg-slate-50">
              กลับไปหน้าโครงการ
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

