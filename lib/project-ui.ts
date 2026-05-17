export function sortProjectDocuments(documents: any[]) {
  return [...documents].sort((a, b) => {
    const labelA = `${a.code || ""}-${a.name || ""}`;
    const labelB = `${b.code || ""}-${b.name || ""}`;
    const labelCompare = labelA.localeCompare(labelB);
    if (labelCompare !== 0) return labelCompare;

    return (b.version_number || 1) - (a.version_number || 1);
  });
}

export function isActiveDocumentVersion(document: any) {
  return document.status !== "SUPERSEDED";
}

export function canUploadDocument(document: any) {
  return !["REJECTED", "SUPERSEDED", "VERIFIED"].includes(document.status);
}

export function canVerifyDocument(document: any) {
  return document.status === "UPLOADED" || document.status === "PENDING_VERIFY";
}

export function canRejectDocument(document: any) {
  return document.status === "UPLOADED" || document.status === "PENDING_VERIFY" || document.status === "VERIFIED";
}

export function documentGovernanceTone(document: any) {
  if (document.status === "VERIFIED") return "good";
  if (document.status === "REJECTED" || (document.gate_severity === "HARD" && canUploadDocument(document))) return "risk";
  if (document.status === "PENDING_VERIFY" || document.status === "UPLOADED") return "review";
  return "pending";
}

export function documentGovernanceClass(document: any) {
  const tone = documentGovernanceTone(document);
  if (tone === "good") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "risk") return "border-rose-200 bg-rose-50 text-rose-700";
  if (tone === "review") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export function documentStatusClass(status: string) {
  if (status === "VERIFIED") return "border-emerald-100 bg-emerald-50 text-emerald-700";
  if (status === "PENDING_VERIFY") return "border-sky-100 bg-sky-50 text-sky-700";
  if (status === "UPLOADED") return "border-amber-100 bg-amber-50 text-amber-700";
  if (status === "REJECTED") return "border-rose-100 bg-rose-50 text-rose-700";
  if (status === "SUPERSEDED") return "border-slate-200 bg-slate-100 text-slate-400";
  return "border-slate-200 bg-slate-50 text-slate-500";
}

export function gateSeverityClass(severity?: string) {
  if (severity === "HARD") return "border-rose-200 bg-rose-50 text-rose-700";
  if (severity === "OVERRIDEABLE") return "border-amber-200 bg-amber-50 text-amber-700";
  if (severity === "SOFT") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export function gateStatusClass(status?: string) {
  if (status === "PASSED" || status === "VERIFIED" || status === "WAIVED") return "border-emerald-100 bg-emerald-50 text-emerald-700";
  if (status === "REJECTED" || status === "FAILED") return "border-rose-100 bg-rose-50 text-rose-700";
  if (status === "UPLOADED" || status === "PENDING_VERIFY") return "border-amber-100 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-500";
}

export function exceptionSeverityClass(severity?: string) {
  if (severity === "CRITICAL") return "border-rose-300 bg-rose-50 text-rose-700";
  if (severity === "HIGH") return "border-rose-200 bg-rose-50 text-rose-700";
  if (severity === "WARNING") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export function activityToneClass(action?: string) {
  const normalizedAction = String(action || "").toUpperCase();
  if (normalizedAction.includes("BLOCKED") || normalizedAction.includes("REJECTED") || normalizedAction.includes("FAIL")) return "border-rose-200 bg-rose-50 text-rose-700";
  if (normalizedAction === "CHECKLIST_UPDATED") return "border-slate-200 bg-slate-50 text-slate-600";
  if (normalizedAction.includes("APPROVAL") || normalizedAction.includes("OVERRIDE") || normalizedAction.includes("VERSION")) return "border-amber-200 bg-amber-50 text-amber-700";
  if (normalizedAction.includes("UPLOADED") || normalizedAction.includes("VERIFIED") || normalizedAction.includes("FORWARD") || normalizedAction.includes("CREATED")) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export function activityLabel(action?: string) {
  const normalizedAction = String(action || "").toUpperCase();
  const labels: Record<string, string> = {
    APPROVAL_REQUEST_CREATED: "ส่งคำขออนุมัติ",
    APPROVAL_REQUEST_DECIDED: "อนุมัติ/ปฏิเสธคำขอแล้ว",
    DOCUMENT_REJECTED: "เอกสารถูกปฏิเสธ",
    DOCUMENT_UPLOADED: "อัปโหลดเอกสารแล้ว",
    DOCUMENT_VERIFIED: "ตรวจเอกสารผ่านแล้ว",
    DOCUMENT_VERSION_CREATED: "สร้างเอกสารเวอร์ชันใหม่",
    CHECKLIST_PASSED: "Checklist ผ่านแล้ว",
    CHECKLIST_UPDATED: "อัปเดต Checklist",
    FIELD_CHECKED_IN: "ทีมหน้างาน Check-in แล้ว",
    STAGE_EVIDENCE_UPLOADED: "อัปโหลดหลักฐานหน้างานแล้ว",
    EXCEPTION_STATUS_CHANGED: "อัปเดตสถานะ Exception",
    QA_OUTCOME_SUBMITTED: "บันทึกผล QA แล้ว",
    BILLING_DECISION_SUBMITTED: "บันทึกผลวางบิลแล้ว",
    LOAN_REJECTED_CASH_OFFERED: "สินเชื่อไม่ผ่าน เสนอเงินสดแล้ว",
    LOAN_REJECTED_CASH_ACCEPTED: "ลูกค้ารับข้อเสนอเงินสด",
    PROJECT_CANCELLED_AFTER_LOAN_REJECTION: "ยกเลิกโครงการหลังสินเชื่อไม่ผ่าน",
    STAGE_TRANSITIONED_FORWARD: "เลื่อนไปขั้นตอนถัดไป",
    STAGE_TRANSITIONED_REWORK: "ส่งกลับไปแก้งาน",
    TRANSITION_BLOCKED: "ติด Hard Gate",
  };

  return labels[normalizedAction] || normalizedAction.replaceAll("_", " ").toLowerCase();
}

export function roleLabel(role?: string | null) {
  const labels: Record<string, string> = {
    system_admin: "System Admin",
    admin: "ผู้ดูแลระบบ",
    exec: "ผู้บริหาร",
    sales: "ฝ่ายขาย",
    ops: "ทีมปฏิบัติการ",
    survey: "ทีมสำรวจ",
    engineer: "วิศวกรรม",
    engineering: "วิศวกรรม",
    finance: "การเงิน",
    scheduler: "จัดตาราง",
    contractor: "ผู้รับเหมา",
    installer: "ทีมติดตั้ง",
    installation: "ทีมติดตั้ง",
    qa: "ตรวจคุณภาพ",
    handover: "ส่งมอบงาน",
    billing: "วางบิล",
    sbc: "SBC - Solar Champion Business",
  };
  const key = String(role || "").toLowerCase();
  return labels[key] || String(role || "ยังไม่กำหนด");
}

export function roleLabelWithCode(role?: string | null) {
  const code = String(role || "").trim();
  if (!code) return "ยังไม่กำหนด";
  return `${roleLabel(code)} (${code})`;
}

export function paymentTypeLabel(paymentType?: string | null) {
  const key = String(paymentType || "").toUpperCase();
  if (key === "LOAN") return "สินเชื่อ";
  if (key === "CASH") return "เงินสด";
  return key || "ไม่ระบุ";
}

export function statusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    ACTIVE: "ใช้งาน",
    ALL: "ทั้งหมด",
    PENDING: "รอดำเนินการ",
    SENT: "ส่งแล้ว",
    READ: "อ่านแล้ว",
    FAILED: "ไม่สำเร็จ",
    CANCELLED: "ยกเลิก",
    APPROVED: "อนุมัติแล้ว",
    REJECTED: "ปฏิเสธแล้ว",
    OPEN: "เปิดอยู่",
    ACKNOWLEDGED: "รับทราบแล้ว",
    IN_PROGRESS: "กำลังแก้ไข",
    RESOLVED: "แก้ไขแล้ว",
    CLOSED: "ปิดแล้ว",
    WAIVED: "ยกเว้นแล้ว",
    VERIFIED: "ตรวจผ่าน",
    PENDING_VERIFY: "รอตรวจ",
    UPLOADED: "อัปโหลดแล้ว",
    SUPERSEDED: "มีเวอร์ชันใหม่แล้ว",
    BLOCKED: "ติดขัด",
    COMPLETED: "เสร็จแล้ว",
    WAITING: "รอ",
  };
  const key = String(status || "").toUpperCase();
  return labels[key] || key || "ไม่ระบุ";
}

export function severityLabel(severity?: string | null) {
  const labels: Record<string, string> = {
    CRITICAL: "วิกฤต",
    HIGH: "สูง",
    WARNING: "เตือน",
    INFO: "ข้อมูล",
    HARD: "บังคับ",
    OVERRIDEABLE: "ขออนุมัติได้",
    SOFT: "ไม่บังคับ",
  };
  const key = String(severity || "").toUpperCase();
  return labels[key] || key || "ข้อมูล";
}

export function channelLabel(channel?: string | null) {
  const key = String(channel || "").toUpperCase();
  if (key === "IN_APP") return "ในระบบ";
  if (key === "EMAIL") return "อีเมล";
  if (key === "LINE") return "LINE";
  return key || "ระบบ";
}

export function workflowTypeLabel(type?: string | null) {
  const key = String(type || "").toUpperCase();
  if (key === "GATE_OVERRIDE") return "ขอข้าม Gate";
  if (key === "FORWARD") return "ไปขั้นถัดไป";
  if (key === "REWORK") return "ส่งกลับแก้";
  return key || "ทั่วไป";
}

export function exceptionCategoryLabel(category?: string | null) {
  const labels: Record<string, string> = {
    SLA: "SLA",
    QA: "QA",
    BILLING: "วางบิล",
    DOCUMENT: "เอกสาร",
    WORKFLOW: "Workflow",
    SYSTEM: "ระบบ",
    RESOURCE: "ทีม/ตารางงาน",
  };
  const key = String(category || "").toUpperCase();
  return labels[key] || key || "ทั่วไป";
}

export function isGatePassed(item: any) {
  return item.status === "PASSED" || item.status === "VERIFIED" || item.status === "WAIVED";
}

export function stageOverrideableBlockers(stage: any) {
  const documents = sortProjectDocuments(stage.documents || []).filter(isActiveDocumentVersion);
  const gateItems = [...(stage.checklists || []), ...documents];

  return gateItems.filter((item: any) => item.gate_severity === "OVERRIDEABLE" && !isGatePassed(item));
}

export function stageApprovedOverride(stage: any) {
  return (stage.approvals || []).find((approval: any) => approval.type === "GATE_OVERRIDE" && approval.status === "APPROVED");
}

export function stagePendingOverride(stage: any) {
  return (stage.approvals || []).find((approval: any) => approval.type === "GATE_OVERRIDE" && approval.status === "PENDING");
}

export function relatedProject(row: any) {
  return Array.isArray(row?.projects) ? row.projects[0] : row?.projects;
}

export function relatedStage(row: any) {
  return Array.isArray(row?.project_stages) ? row.project_stages[0] : row?.project_stages;
}

export function projectStageToneClass(stage: any) {
  if (!stage) return "border-slate-200 bg-slate-50 text-slate-500";
  if (stage.sla_status === "OVER_SLA") return "border-rose-200 bg-rose-50 text-rose-700";
  if (stage.sla_status === "NEAR_SLA") return "border-amber-200 bg-amber-50 text-amber-700";
  if (stage.status === "BLOCKED") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export function stageDisplay(stage: any) {
  const key = String(stage?.code || stage?.workflow_definitions?.step_name || stage?.name || "").toUpperCase().replace(/\s+/g, "_");
  const byKey: Record<string, { title: string; description: string }> = {
    LEAD: { title: "รับข้อมูลลูกค้า", description: "ลงทะเบียนลูกค้า ตรวจข้อมูลติดต่อ และเริ่มโครงการ" },
    SURVEY: { title: "สำรวจหน้างาน", description: "ตรวจพื้นที่ MDB ระบบกราวด์ GPS และรูปสำรวจที่จำเป็น" },
    TSSR: { title: "ออกแบบทางเทคนิค", description: "จัดทำ SLD, BOQ, แบบเทคนิค และอนุมัติจากวิศวกรรม" },
    QUOTATION: { title: "ใบเสนอราคา", description: "จัดทำใบเสนอราคา สัญญา และยืนยันกับลูกค้า" },
    LOAN_DOCUMENT_COLLECTION: { title: "เอกสารสินเชื่อ", description: "รวบรวมเอกสารสินเชื่อและตรวจความครบถ้วนของชุดเอกสาร" },
    LOAN_SUBMISSION: { title: "ยื่นสินเชื่อ", description: "ยื่นชุดเอกสารสินเชื่อและบันทึกหลักฐานการยื่น" },
    LOAN_REVIEW: { title: "ติดตามสินเชื่อ", description: "ติดตามผลธนาคาร และตัดสินใจว่าจะเสนอเปลี่ยนเป็นเงินสดหรือไม่" },
    LOAN_APPROVAL: { title: "อนุมัติสินเชื่อ", description: "ยืนยันผลอนุมัติสินเชื่อ หรือเปลี่ยนเส้นทางไปเงินสด" },
    DOWN_PAYMENT: { title: "เงินดาวน์", description: "ตรวจหลักฐานเงินดาวน์ก่อนเข้าสู่ความพร้อมติดตั้ง" },
    PAYMENT: { title: "ชำระเงินสด", description: "ตรวจหลักฐานชำระเงินและยืนยันความพร้อมก่อนติดตั้ง" },
    READY_FOR_INSTALL: { title: "พร้อมติดตั้ง", description: "ยืนยันเงิน วัสดุ ทีม และความพร้อมของตารางงาน" },
    SCHEDULING: { title: "จัดตารางติดตั้ง", description: "กำหนดทีม วันติดตั้ง และตรวจความซ้ำซ้อนของทรัพยากร" },
    INSTALLATION: { title: "ติดตั้งระบบ", description: "ดำเนินงานติดตั้ง อัปโหลดหลักฐาน และทำ checklist ติดตั้ง" },
    QA: { title: "ตรวจคุณภาพ", description: "ตรวจงานเครื่องกล ไฟฟ้า Monitoring และเอกสารประกอบ" },
    HANDOVER: { title: "ส่งมอบงาน", description: "ส่งมอบ site folder รับรองงานกับลูกค้า และปิดเอกสารสุดท้าย" },
    BILLING: { title: "วางบิล", description: "ตรวจ Invoice, PAC, FBOQ และความพร้อมด้านการเงินก่อนปิดงาน" },
    CLOSURE: { title: "ปิดโครงการ", description: "ยืนยัน workflow เอกสาร exception และ billing ครบถ้วน" },
  };

  return byKey[key] || { title: stage?.workflow_definitions?.step_name || stage?.name || "ขั้นตอน", description: "ขั้นตอนการทำงานของโครงการ" };
}

export function formatSlaDuration(hours?: number) {
  const totalHours = Number(hours || 0);
  if (!totalHours) return "ไม่มี SLA";
  if (totalHours > 24) {
    const days = Math.floor(totalHours / 24);
    const remainingHours = totalHours % 24;
    return remainingHours ? `${days} วัน ${remainingHours} ชม.` : `${days} วัน`;
  }
  return `${totalHours} ชม.`;
}

export function formatElapsedTime(from?: string | Date | null, to?: string | Date | null) {
  if (!from || !to) return "N/A";
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "N/A";

  const totalHours = Math.max(1, Math.round((end - start) / (1000 * 60 * 60)));
  return formatSlaDuration(totalHours);
}

export function stageCompletionGap(stage: any, previousStage?: any) {
  if (!stage?.actual_completed_at) return "N/A";
  const start = previousStage?.actual_completed_at || stage.started_at;
  return formatElapsedTime(start, stage.actual_completed_at);
}

export function formatDateTime(value?: string | Date | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "N/A";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date).replace(",", "");
}

export function stageCompletionHours(stage: any, previousStage?: any) {
  if (!stage?.actual_completed_at) return null;
  const startValue = previousStage?.actual_completed_at || stage.started_at;
  if (!startValue) return null;
  const start = new Date(startValue).getTime();
  const end = new Date(stage.actual_completed_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;

  return Math.max(1, Math.round((end - start) / (1000 * 60 * 60)));
}

export function transitionSlaTone(stage: any, previousStage?: any) {
  const elapsedHours = stageCompletionHours(stage, previousStage);
  const slaHours = Number(stage?.workflow_definitions?.sla_hours || 0);
  if (!elapsedHours || !slaHours) return "neutral";
  if (elapsedHours > slaHours) return "over";
  if (elapsedHours >= slaHours * 0.8) return "near";
  return "good";
}

export function transitionTimeClass(stage: any, previousStage?: any) {
  const tone = transitionSlaTone(stage, previousStage);
  if (tone === "over") return "border-rose-200 bg-rose-50 text-rose-700 shadow-rose-100";
  if (tone === "near") return "border-amber-200 bg-amber-50 text-amber-700 shadow-amber-100";
  if (tone === "good") return "border-emerald-200 bg-emerald-50 text-emerald-700 shadow-emerald-100";
  return "border-slate-200 bg-white text-slate-600 shadow-sm";
}

export function runningStageHours(stage: any) {
  if (!stage?.started_at || stage?.actual_completed_at) return null;
  const start = new Date(stage.started_at).getTime();
  const end = Date.now();
  if (!Number.isFinite(start) || end < start) return null;

  return Math.max(1, Math.round((end - start) / (1000 * 60 * 60)));
}

export function runningStageLabel(stage: any) {
  const elapsedHours = runningStageHours(stage);
  if (!elapsedHours) return "N/A";
  return formatSlaDuration(elapsedHours);
}

export function runningStageTone(stage: any) {
  const elapsedHours = runningStageHours(stage);
  const slaHours = Number(stage?.workflow_definitions?.sla_hours || 0);
  if (!elapsedHours || !slaHours) return "neutral";
  if (elapsedHours > slaHours) return "over";
  if (elapsedHours >= slaHours * 0.8) return "near";
  return "good";
}

export function runningStageTextClass(stage: any) {
  const tone = runningStageTone(stage);
  if (tone === "over") return "text-rose-600";
  if (tone === "near") return "text-amber-600";
  if (tone === "good") return "text-emerald-700";
  return "text-slate-800";
}

export function runningStageBadgeClass(stage: any) {
  return "border-amber-200 bg-amber-50 text-amber-800 shadow-sm shadow-amber-100";
}

export function fieldJobCheckIn(job: any) {
  return job?.metadata?.field_check_in;
}

export function scheduleDateValue(item: any) {
  return item?.metadata?.scheduled_at || item?.due_at || item?.started_at || null;
}

export function scheduleDayKey(value?: string | Date | null) {
  if (!value) return "unscheduled";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "unscheduled";
  return date.toISOString().slice(0, 10);
}

export function formatScheduleDayLabel(value: string) {
  if (value === "unscheduled") return "ยังไม่จัดตาราง";
  return new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "short" }).format(new Date(`${value}T00:00:00`));
}

export function scheduleConflictLabel(value?: string | null) {
  const labels: Record<string, string> = {
    NONE: "ไม่ชนทีม",
    CAPACITY_CONFLICT: "เกินความจุต่อวัน",
    TIME_CONFLICT: "เวลาชนกับงานอื่น",
    SKILL_MISMATCH: "ทักษะทีมไม่ตรง",
    TERRITORY_MISMATCH: "พื้นที่ทีมไม่ตรง",
  };
  return labels[value || "NONE"] || value || "ไม่ชนทีม";
}

export function currentTimelineStage(stages: any[]) {
  return stages.find((stage) => stage.dynamicStatus === "In Progress" || stage.dynamicStatus === "Near SLA" || stage.dynamicStatus === "Overdue" || stage.dynamicStatus === "Blocked")
    || [...stages].reverse().find((stage) => stage.actual_completed_at)
    || stages[0];
}

export function timelineElapsedHours(stages: any[], fallbackStart?: string | null) {
  if (!stages.length) return null;
  const firstStage = stages[0];
  const targetStage = currentTimelineStage(stages);
  const startValue = firstStage?.started_at || fallbackStart;
  const endValue = targetStage?.actual_completed_at || new Date().toISOString();
  if (!startValue || !endValue) return null;

  const start = new Date(startValue).getTime();
  const end = new Date(endValue).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;

  return Math.max(1, Math.round((end - start) / (1000 * 60 * 60)));
}

export function stageOwner(stage: any) {
  const owner = stage?.owner_role || stage?.metadata?.owner || stage?.metadata?.owner_name;
  if (!owner) return "ยังไม่กำหนด";
  return roleLabelWithCode(owner);
}

export function stageVisual(stage: any) {
  const key = String(stage?.code || stage?.workflow_definitions?.step_name || stage?.name || "").toUpperCase().replace(/\s+/g, "_");
  const visuals: Record<string, { gradient: string; iconClass: string; icon: string }> = {
    LEAD: { gradient: "from-sky-50 via-white to-white", iconClass: "border-sky-100 bg-sky-50 text-sky-600", icon: "user" },
    SURVEY: { gradient: "from-emerald-50 via-white to-white", iconClass: "border-emerald-100 bg-emerald-50 text-emerald-600", icon: "pin" },
    TSSR: { gradient: "from-indigo-50 via-white to-white", iconClass: "border-indigo-100 bg-indigo-50 text-indigo-600", icon: "plan" },
    QUOTATION: { gradient: "from-cyan-50 via-white to-white", iconClass: "border-cyan-100 bg-cyan-50 text-cyan-600", icon: "file" },
    LOAN_DOCUMENT_COLLECTION: { gradient: "from-sky-50 via-white to-white", iconClass: "border-sky-100 bg-sky-50 text-sky-600", icon: "file" },
    LOAN_SUBMISSION: { gradient: "from-sky-50 via-white to-white", iconClass: "border-sky-100 bg-sky-50 text-sky-600", icon: "file" },
    LOAN_REVIEW: { gradient: "from-sky-50 via-white to-white", iconClass: "border-sky-100 bg-sky-50 text-sky-600", icon: "shield" },
    LOAN_APPROVAL: { gradient: "from-sky-50 via-white to-white", iconClass: "border-sky-100 bg-sky-50 text-sky-600", icon: "check" },
    DOWN_PAYMENT: { gradient: "from-amber-50 via-white to-white", iconClass: "border-amber-100 bg-amber-50 text-amber-600", icon: "card" },
    PAYMENT: { gradient: "from-amber-50 via-white to-white", iconClass: "border-amber-100 bg-amber-50 text-amber-600", icon: "card" },
    READY_FOR_INSTALL: { gradient: "from-lime-50 via-white to-white", iconClass: "border-lime-100 bg-lime-50 text-lime-700", icon: "box" },
    SCHEDULING: { gradient: "from-violet-50 via-white to-white", iconClass: "border-violet-100 bg-violet-50 text-violet-600", icon: "calendar" },
    INSTALLATION: { gradient: "from-orange-50 via-white to-white", iconClass: "border-orange-100 bg-orange-50 text-orange-600", icon: "tool" },
    QA: { gradient: "from-teal-50 via-white to-white", iconClass: "border-teal-100 bg-teal-50 text-teal-600", icon: "shield" },
    HANDOVER: { gradient: "from-blue-50 via-white to-white", iconClass: "border-blue-100 bg-blue-50 text-blue-600", icon: "handover" },
    BILLING: { gradient: "from-rose-50 via-white to-white", iconClass: "border-rose-100 bg-rose-50 text-rose-600", icon: "receipt" },
    CLOSURE: { gradient: "from-slate-100 via-white to-white", iconClass: "border-slate-200 bg-slate-50 text-slate-600", icon: "check" },
  };

  return visuals[key] || { gradient: "from-slate-50 via-white to-white", iconClass: "border-slate-200 bg-slate-50 text-slate-600", icon: "file" };
}
