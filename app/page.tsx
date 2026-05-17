"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { apiFetch } from "../lib/api-client";
import {
  enqueueUploadRetryItem,
  listUploadRetryItems,
  removeUploadRetryItem,
  updateUploadRetryItem,
  type UploadRetryItem,
} from "../lib/upload-retry-queue";
import AuthDialog from "../components/auth/AuthDialog";
import {
  activityToneClass,
  activityLabel,
  canRejectDocument,
  canUploadDocument,
  canVerifyDocument,
  currentTimelineStage,
  documentGovernanceClass,
  documentGovernanceTone,
  documentStatusClass,
  exceptionSeverityClass,
  fieldJobCheckIn,
  formatDateTime,
  formatScheduleDayLabel,
  formatSlaDuration,
  gateSeverityClass,
  gateStatusClass,
  isActiveDocumentVersion,
  isGatePassed,
  projectStageToneClass,
  relatedProject,
  relatedStage,
  roleLabel,
  roleLabelWithCode,
  runningStageBadgeClass,
  runningStageHours,
  runningStageLabel,
  runningStageTextClass,
  runningStageTone,
  scheduleConflictLabel,
  sortProjectDocuments,
  stageApprovedOverride,
  stageCompletionGap,
  stageDisplay,
  stageOverrideableBlockers,
  stageOwner,
  stagePendingOverride,
  stageSolidIconClass,
  stageVisual,
  statusLabel,
  severityLabel,
  exceptionCategoryLabel,
  workflowTypeLabel,
  timelineElapsedHours,
  transitionTimeClass,
} from "../lib/project-ui";
import CreateProjectModal from "../components/CreateProjectModal";
import AppHeader from "../components/layout/AppHeader";
import AppSidebar from "../components/layout/AppSidebar";
import CompactWorkflowMiniRail from "../components/workflow/CompactWorkflowMiniRail";
import StageIcon from "../components/workflow/StageIcon";
import WorkflowStageConnector from "../components/workflow/WorkflowStageConnector";
import WorkflowStageTile from "../components/workflow/WorkflowStageTile";
import CompleteStageModal from "../components/workflow/CompleteStageModal";
import ChecklistReviewModal from "../components/workflow/ChecklistReviewModal";
import GateBlockModal from "../components/workflow/GateBlockModal";
import StageActionModal from "../components/workflow/StageActionModal";
import OverrideModal from "../components/workflow/OverrideModal";
import NoticeToast, { type Notice } from "../components/ui/NoticeToast";
import PreviewImageModal from "../components/ui/PreviewImageModal";
import ApprovalCenter from "../components/approvals/ApprovalCenter";
import DocumentDrawer from "../components/documents/DocumentDrawer";
import RejectDocumentModal from "../components/documents/RejectDocumentModal";
import ExceptionDrawer from "../components/exceptions/ExceptionDrawer";
import NotificationPanel from "../components/notifications/NotificationPanel";
import UploadRetryQueue from "../components/field/UploadRetryQueue";

function normalizeStageOwnerRole(role?: string | null) {
  const key = String(role || "").toLowerCase();
  const aliases: Record<string, string> = {
    billing: "finance",
    engineering: "engineer",
    handover: "ops",
    installation: "contractor",
    installer: "contractor",
    scheduling: "ops",
    scheduler: "ops",
    survey: "ops",
  };
  return aliases[key] || key;
}

function uniqueIds(values: Array<string | null | undefined>) {
  return [...new Set(values.filter(Boolean) as string[])];
}

function completionButtonLabel(stage: any) {
  const key = String(stage?.code || "").toUpperCase();
  const labels: Record<string, string> = {
    CLOSURE: "ปิดโครงการ",
  };
  if (labels[key]) return labels[key];
  return "ไปขั้นตอนถัดไป";
}

function stageGateBlockers(stage: any) {
  if (!stage) return [];
  const documents = sortProjectDocuments(stage.documents || []).filter(isActiveDocumentVersion);
  const gates = [...(stage.checklists || []), ...documents].filter((item: any) =>
    item.is_required !== false && ["HARD", "OVERRIDEABLE"].includes(item.gate_severity),
  );
  const hasApprovedOverride = Boolean(stageApprovedOverride(stage));

  return gates.filter((item: any) => {
    if (item.gate_severity === "OVERRIDEABLE" && hasApprovedOverride) return false;
    return !gateItemPassed(item);
  });
}

function gateItemPassed(item: any) {
  if (Object.prototype.hasOwnProperty.call(item, "requires_verification")) {
    if (item.requires_verification) return item.status === "VERIFIED" || item.status === "WAIVED";
    return item.status !== "REQUIRED" && item.status !== "REJECTED";
  }
  return isGatePassed(item);
}

function canCurrentUserCompleteStage(stage: any, userRole?: string | null) {
  if (!stage || !userRole) return true;
  const role = normalizeStageOwnerRole(userRole);
  if (role === "system_admin" || role === "admin" || role === "supervisor" || role === "sbc") return true;
  const ownerRole = normalizeStageOwnerRole(stage.owner_role);
  return !ownerRole || ownerRole === role;
}

function findNextRuntimeStage(currentStage: any, stages: any[], project: any) {
  if (!currentStage) return null;

  const targetCodeByStage: Record<string, string> = {
    QUOTATION: project?.payment_type === "LOAN" ? "LOAN_DOCUMENT_COLLECTION" : "PAYMENT",
    LOAN_APPROVAL: "DOWN_PAYMENT",
    PAYMENT: "READY_FOR_INSTALL",
    DOWN_PAYMENT: "READY_FOR_INSTALL",
  };
  const targetCode = targetCodeByStage[String(currentStage.code || "").toUpperCase()];
  if (targetCode) {
    const target = stages.find((stage: any) => stage.code === targetCode && stage.status !== "SKIPPED");
    if (target) return target;
  }

  return stages.find((stage: any) =>
    stage.order_index > currentStage.order_index && stage.status !== "COMPLETED" && stage.status !== "SKIPPED",
  ) || null;
}

function requiredResourceSkillForStage(stage: any) {
  const key = String(stage?.code || "").toUpperCase();
  if (key === "SCHEDULING" || key === "INSTALLATION") return "installation";
  return key ? key.toLowerCase() : null;
}

function nextActionToneClass(tone: string) {
  if (tone === "ready") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (tone === "review") return "border-sky-200 bg-sky-50 text-sky-800";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  if (tone === "risk") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function summaryCardClass(tone: "emerald" | "amber" | "rose" | "blue" | "slate") {
  const tones = {
    emerald: "border-emerald-100 bg-gradient-to-br from-emerald-50/85 via-white to-white shadow-emerald-100/45",
    amber: "border-amber-100 bg-gradient-to-br from-amber-50/85 via-white to-white shadow-amber-100/45",
    rose: "border-rose-100 bg-gradient-to-br from-rose-50/85 via-white to-white shadow-rose-100/45",
    blue: "border-blue-100 bg-gradient-to-br from-blue-50/70 via-white to-white shadow-blue-100/40",
    slate: "border-slate-200/90 bg-gradient-to-br from-slate-50/75 via-white to-white shadow-slate-200/50",
  };
  return tones[tone];
}

function summaryIconClass(tone: "emerald" | "amber" | "rose" | "blue" | "slate") {
  const tones = {
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    rose: "border-rose-100 bg-rose-50 text-rose-700",
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    slate: "border-slate-200 bg-slate-50 text-slate-600",
  };
  return tones[tone];
}

function summaryWatermarkClass(tone: "emerald" | "amber" | "rose" | "blue" | "slate") {
  const tones = {
    emerald: "text-emerald-500",
    amber: "text-amber-500",
    rose: "text-rose-500",
    blue: "text-blue-500",
    slate: "text-slate-400",
  };
  return tones[tone];
}

function gateVisualState(item: any) {
  if (gateItemPassed(item)) {
    return {
      label: "ผ่านแล้ว",
      badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
      cardClass: "border-emerald-200 bg-gradient-to-r from-emerald-100 via-emerald-50 to-white shadow-emerald-100/70 ring-1 ring-emerald-100",
      icon: "✓",
      iconClass: "text-emerald-500/10",
    };
  }

  if (item.status === "FAILED") {
    return {
      label: "ไม่ผ่าน",
      badgeClass: "border-rose-200 bg-rose-50 text-rose-800",
      cardClass: "border-rose-200 bg-gradient-to-r from-rose-100 via-rose-50 to-white shadow-rose-100/70 ring-1 ring-rose-100",
      icon: "×",
      iconClass: "text-rose-500/10",
    };
  }

  const isBlocking = item.is_required !== false && ["HARD", "OVERRIDEABLE"].includes(item.gate_severity);
  if (isBlocking) {
    return {
      label: "ติดอยู่",
      badgeClass: "border-rose-200 bg-rose-50 text-rose-800",
      cardClass: "border-rose-200 bg-gradient-to-r from-rose-100 via-rose-50 to-white shadow-rose-100/70 ring-1 ring-rose-100",
      icon: "×",
      iconClass: "text-rose-500/10",
    };
  }

  return {
    label: "ควรทำ",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-800",
    cardClass: "border-amber-200 bg-gradient-to-r from-amber-100 via-amber-50 to-white shadow-amber-100/70 ring-1 ring-amber-100",
    icon: "!",
    iconClass: "text-amber-500/10",
  };
}

function checklistNoteClass(item: any) {
  if (item.status === "FAILED") return "border border-rose-100 bg-white/75 text-rose-700";
  if (gateItemPassed(item)) return "border border-emerald-100 bg-white/70 text-emerald-800";
  return "border border-slate-100 bg-white/70 text-slate-600";
}

function shouldShowChecklistNote(item: any) {
  const note = String(item.notes || "").trim();
  if (!note) return false;
  if (gateItemPassed(item) && note === "ตรวจแล้วไม่ผ่าน") return false;
  return true;
}

function checklistStatusSummary(item: any) {
  if (gateItemPassed(item)) {
    const checkedAt = item.completed_at || item.metadata?.passed_at || item.metadata?.updated_at;
    return checkedAt ? `ตรวจแล้ว ผ่านเมื่อ ${formatDateTime(checkedAt)}` : "ตรวจแล้ว ผ่าน";
  }

  if (item.status === "FAILED") {
    const checkedAt = item.metadata?.updated_at || item.updated_at;
    return checkedAt ? `ตรวจแล้ว ไม่ผ่านเมื่อ ${formatDateTime(checkedAt)}` : "ตรวจแล้ว ไม่ผ่าน";
  }

  return "รอตรวจ";
}

function gateBlockerSummary(item: any) {
  if (!item) return "ผ่านครบแล้ว";
  const name = item.label || item.name || item.code || "Gate";
  if (Object.prototype.hasOwnProperty.call(item, "requires_verification")) {
    if (item.status === "REJECTED") return `${name}: เอกสารถูกตีกลับ ต้องอัปโหลดใหม่`;
    if (canVerifyDocument(item)) return `${name}: อัปโหลดแล้ว รอตรวจเอกสาร`;
    if (canUploadDocument(item)) return `${name}: ยังไม่มีไฟล์`;
    return `${name}: ยังไม่ผ่านเอกสาร`;
  }
  if (item.status === "FAILED") return `${name}: ตรวจแล้วไม่ผ่าน`;
  return `${name}: ยังไม่ผ่าน checklist`;
}

function timelineDateLabel(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "วันนี้";
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short" }).format(date);
}

function timelineTimeLabel(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function timelineActivityView(activity: any) {
  const action = String(activity?.action || "").toUpperCase();
  const afterStatus = String(activity?.after_state?.status || activity?.metadata?.status || "").toUpperCase();
  const metadata = activity?.metadata || {};
  const relatedChecklist = activity?.relatedChecklist || null;
  const stageName = activity?.stageTitle || activity?.stageCode || "";
  const itemName =
    relatedChecklist?.label ||
    relatedChecklist?.name ||
    metadata.checklist_name ||
    metadata.checklistName ||
    metadata.checklist_label ||
    metadata.checklistLabel ||
    metadata.gate_name ||
    metadata.gateName ||
    metadata.gate_label ||
    metadata.gateLabel ||
    metadata.document_name ||
    metadata.documentName ||
    metadata.file_name ||
    metadata.fileName ||
    metadata.folder_name ||
    metadata.folderName ||
    metadata.name ||
    metadata.title ||
    "";

  if (action === "CHECKLIST_UPDATED" && afterStatus === "FAILED") {
    return {
      title: itemName || stageName || "Checklist",
      tone: "risk",
      badgeClass: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }

  if ((action === "CHECKLIST_UPDATED" && afterStatus === "PASSED") || action === "CHECKLIST_PASSED") {
    return {
      title: itemName || stageName || "Checklist",
      tone: "success",
      badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  if (action === "DOCUMENT_UPLOADED") {
    return {
      title: itemName ? `\u0e2d\u0e31\u0e1b\u0e42\u0e2b\u0e25\u0e14\u0e40\u0e2d\u0e01\u0e2a\u0e32\u0e23: ${itemName}` : stageName ? `\u0e2d\u0e31\u0e1b\u0e42\u0e2b\u0e25\u0e14\u0e40\u0e2d\u0e01\u0e2a\u0e32\u0e23: ${stageName}` : "\u0e2d\u0e31\u0e1b\u0e42\u0e2b\u0e25\u0e14\u0e40\u0e2d\u0e01\u0e2a\u0e32\u0e23\u0e41\u0e25\u0e49\u0e27",
      tone: "success",
      badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  if (action.includes("PROJECT") && action.includes("CREATED")) {
    return {
      title: stageName ? `\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e42\u0e04\u0e23\u0e07\u0e01\u0e32\u0e23: ${stageName}` : "\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e42\u0e04\u0e23\u0e07\u0e01\u0e32\u0e23",
      tone: "success",
      badgeClass: "border-blue-200 bg-blue-50 text-blue-700",
    };
  }

  if (action.includes("DRIVE") || action.includes("FOLDER")) {
    return {
      title: itemName ? `\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e42\u0e1f\u0e25\u0e40\u0e14\u0e2d\u0e23\u0e4c Drive: ${itemName}` : "\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e42\u0e1f\u0e25\u0e40\u0e14\u0e2d\u0e23\u0e4c Google Drive",
      tone: "success",
      badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  return {
    title: stageName ? `${activityLabel(activity?.action)}: ${stageName}` : activityLabel(activity?.action),
    tone: "neutral",
    badgeClass: activityToneClass(activity?.action),
  };
}
function activityAuditIcon(activity: any) {
  const action = String(activity?.action || "").toUpperCase();
  const afterStatus = String(activity?.after_state?.status || activity?.metadata?.status || "").toUpperCase();
  const decision = String(activity?.metadata?.decision || activity?.metadata?.approval_status || "").toUpperCase();

  if (action.includes("PROJECT") && action.includes("CREATED")) return { icon: "folderPlus", className: "workflow-stage-solid-blue" };
  if (action.includes("TRANSITION") || action.includes("STAGE_CHANGED")) return { icon: "arrowRight", className: "workflow-stage-solid-emerald" };
  if ((action.includes("CHECKLIST") && afterStatus === "PASSED") || action.includes("CHECKLIST_PASSED")) return { icon: "checkCircle", className: "workflow-stage-solid-green" };
  if (action.includes("CHECKLIST") && (afterStatus === "FAILED" || action.includes("FAILED"))) return { icon: "x", className: "workflow-stage-solid-rose" };
  if (action.includes("DOCUMENT_REJECTED") || action.includes("DOCUMENT_MISSING")) return { icon: "fileWarning", className: "workflow-stage-solid-rose" };
  if (action.includes("DOCUMENT_VERIFIED")) return { icon: "checkCircle", className: "workflow-stage-solid-green" };
  if (action.includes("DOCUMENT") && action.includes("UPLOAD")) return { icon: "fileUp", className: "workflow-stage-solid-blue" };
  if (action.includes("BLOCKED") || action.includes("FAIL")) return { icon: "warningCircle", className: "workflow-stage-solid-rose" };
  if (action.includes("APPROVAL") && (action.includes("REJECTED") || decision === "REJECTED")) return { icon: "x", className: "workflow-stage-solid-rose" };
  if (action.includes("APPROVAL") && (action.includes("APPROVED") || action.includes("DECIDED") || decision === "APPROVED")) return { icon: "badgeCheck", className: "workflow-stage-solid-green" };
  if (action.includes("APPROVAL") || action.includes("OVERRIDE")) return { icon: "waitBadge", className: "workflow-stage-solid-amber" };
  if (action.includes("DRIVE") || action.includes("FOLDER")) return { icon: "folderCheck", className: "workflow-stage-solid-teal" };
  if (action.includes("PAYMENT") || action.includes("BILLING")) return { icon: "creditCard", className: "workflow-stage-solid-amber" };
  if (action.includes("QA")) return { icon: afterStatus === "FAILED" ? "warningCircle" : "shield", className: afterStatus === "FAILED" ? "workflow-stage-solid-rose" : "workflow-stage-solid-green" };
  if (action.includes("SYSTEM")) return { icon: "bot", className: "workflow-stage-solid-slate" };
  return { icon: "activity", className: "workflow-stage-solid-slate" };
}

function activityActorLine(activity: any) {
  const metadata = activity?.metadata || {};
  if (activity?.actor?.full_name || activity?.actor?.email) {
    return `โดย ${activity.actor.full_name || activity.actor.email}${activity.actor.role ? ` • ${roleLabel(String(activity.actor.role))}` : ""}`;
  }
  const actorName = metadata.actor_name || metadata.actorName || metadata.user_name || metadata.userName || metadata.created_by_name || metadata.performed_by_name;
  const actorRole = metadata.actor_role || metadata.actorRole || metadata.user_role || metadata.userRole || metadata.role || metadata.team;
  const isSystem = metadata.system === true || String(metadata.actor_type || metadata.actorType || "").toLowerCase() === "system";
  if (actorName) return `โดย ${actorName}${actorRole ? ` • ${roleLabel(String(actorRole))}` : ""}`;
  if (isSystem) return "โดย ระบบ";
  return "โดย ไม่ระบุผู้ทำรายการ";
}

function activityContextLine(activity: any) {
  const metadata = activity?.metadata || {};
  const action = String(activity?.action || "").toUpperCase();
  const relatedChecklist = activity?.relatedChecklist || null;
  const checklistCode = relatedChecklist?.code || metadata.checklist_code || metadata.checklistCode || metadata.gate_code || metadata.gateCode;
  if (action.includes("CHECKLIST") || relatedChecklist) {
    const parts = [
      activity?.stageTitle || activity?.stageCode,
      relatedChecklist?.is_required || metadata.is_required || metadata.required ? "\u0e1a\u0e31\u0e07\u0e04\u0e31\u0e1a" : null,
      checklistCode ? `Gate: ${checklistCode}` : null,
    ].filter(Boolean);
    return parts.join(" • ");
  }

  const parts = [
    activity?.stageTitle || activity?.stageCode,
    metadata.file_name || metadata.fileName || metadata.document_name || metadata.documentName,
    metadata.folder_name || metadata.folderName || metadata.name || metadata.title,
  ].filter(Boolean);
  return parts.length ? parts.join(" / ") : "";
}

function activityStatusBadge(activity: any) {
  const action = String(activity?.action || "").toUpperCase();
  const status = String(activity?.after_state?.status || activity?.metadata?.status || "").toUpperCase();
  if (action.includes("BLOCKED")) return { label: "ถูกบล็อก", className: "border-rose-100 bg-rose-50 text-rose-700" };
  if (action.includes("REJECTED") || status === "REJECTED" || status === "FAILED") return { label: "มีปัญหา", className: "border-rose-100 bg-rose-50 text-rose-700" };
  if (action.includes("APPROVAL") && (action.includes("APPROVED") || status === "APPROVED")) return { label: "อนุมัติแล้ว", className: "border-emerald-100 bg-emerald-50 text-emerald-700" };
  if (action.includes("APPROVAL") || status === "PENDING" || status === "PENDING_VERIFY") return { label: "รอตรวจสอบ", className: "border-amber-100 bg-amber-50 text-amber-700" };
  if (action.includes("CHECKLIST") || status === "PASSED" || status === "VERIFIED") return { label: "สำเร็จ", className: "border-emerald-100 bg-emerald-50 text-emerald-700" };
  return null;
}

function buildNextActionAssistant(input: {
  selectedProject: any;
  milestones: any[];
  currentMilestone: any;
  nextMilestone: any;
  currentStageBlockers: any[];
  currentStageReady: boolean;
  projectReviewDocuments: any[];
}) {
  const { selectedProject, milestones, currentMilestone, nextMilestone, currentStageBlockers, currentStageReady, projectReviewDocuments } = input;
  if (!selectedProject) return null;

  const pendingApprovals = milestones.flatMap((stage: any) => stage.approvals || []).filter((approval: any) => approval.status === "PENDING");
  const openExceptions = milestones.flatMap((stage: any) => stage.exceptions || []).filter((exception: any) => ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS"].includes(exception.status));
  const blockerNames = currentStageBlockers.map((item: any) => gateBlockerSummary(item));
  const primaryBlocker = currentStageBlockers[0] || null;
  const primaryBlockerSummary = primaryBlocker ? gateBlockerSummary(primaryBlocker) : "";
  const driveReady = Boolean(selectedProject.google_drive_folder_id);

  const base = {
    tone: "neutral",
    status: "ติดตามขั้นตอนปัจจุบัน",
    title: "ติดตามขั้นตอนปัจจุบัน",
    suggestion: "ตรวจสอบ checklist และเอกสารให้ครบก่อนดำเนินการต่อ",
    blockers: [] as string[],
    chips: [
      { label: "Current", value: currentMilestone ? stageDisplay(currentMilestone).title : "ไม่พบขั้นตอน" },
      { label: "Owner", value: currentMilestone ? stageOwner(currentMilestone) : "ยังไม่กำหนด" },
      { label: "Next", value: nextMilestone ? stageDisplay(nextMilestone).title : "Final stage" },
      { label: "Drive", value: driveReady ? "พร้อม" : "ยังไม่มี Folder" },
      { label: "SLA", value: currentMilestone?.sla_status || selectedProject.sla_status || "ON_TRACK" },
      { label: "Gate", value: currentStageBlockers.length ? `${currentStageBlockers.length} blockers` : "พร้อม" },
    ],
    counts: {
      approvals: pendingApprovals.length,
      exceptions: openExceptions.length,
      reviewDocuments: projectReviewDocuments.length,
    },
  };

  if (!milestones.length) {
    return {
      ...base,
      tone: "warning",
      status: "ยังไม่มี Runtime",
      title: "ยังไม่พบ Runtime Workflow",
      suggestion: "Generate Runtime Workflow ก่อนเริ่มติดตามงาน",
      blockers: ["ยังไม่มี runtime stages สำหรับโครงการนี้"],
    };
  }

  if (selectedProject.status === "COMPLETED") {
    return {
      ...base,
      tone: "ready",
      status: "ปิดงานแล้ว",
      title: "โครงการปิดงานแล้ว",
      suggestion: "ตรวจสอบเอกสารและ audit log ได้หากต้องการ",
    };
  }

  if (!currentMilestone) {
    return {
      ...base,
      tone: "warning",
      status: "ไม่พบขั้นตอนปัจจุบัน",
      title: "ยังไม่พบขั้นตอนปัจจุบัน",
      suggestion: "ตรวจสอบ runtime stage หรือ current stage ของโครงการนี้",
      blockers: ["ไม่พบ stage ที่กำลังดำเนินการ"],
    };
  }

  if (!driveReady) {
    return {
      ...base,
      tone: "warning",
      status: "ยังไม่มี Drive Folder",
      title: "ยังไม่มี Drive Folder",
      suggestion: "สร้าง Drive Folder ก่อนอัปโหลดเอกสาร",
      blockers: ["ยังไม่ได้เชื่อม Google Drive folder"],
    };
  }

  if (currentStageBlockers.length > 0) {
    return {
      ...base,
      tone: "risk",
      blockers: blockerNames,
      status: `ติด ${currentStageBlockers.length} gate`,
      title: primaryBlockerSummary ? `ต้องแก้ก่อน: ${primaryBlockerSummary}` : "ยังไปต่อไม่ได้",
      suggestion: "กดดูรายการที่ติดอยู่เพื่ออัปโหลด ตรวจเอกสาร หรือผ่าน checklist ให้ครบก่อน",
    };
  }

  if (pendingApprovals.length > 0) {
    return {
      ...base,
      tone: "review",
      status: "รออนุมัติ",
      title: "รออนุมัติ",
      suggestion: "ติดตามผู้อนุมัติเพื่อปลด gate หรือ override",
      blockers: pendingApprovals.slice(0, 3).map((approval: any) => approval.type || "Approval request"),
    };
  }

  if (currentMilestone.sla_status === "OVER_SLA" || selectedProject.sla_status === "OVER_SLA") {
    return {
      ...base,
      tone: "risk",
      status: "เกิน SLA",
      title: `เร่งดำเนินการ: ${stageDisplay(currentMilestone).title}`,
      suggestion: `งานนี้เกิน SLA แล้ว ให้ ${stageOwner(currentMilestone)} ดำเนินการหรือแจ้ง supervisor`,
    };
  }

  if (currentMilestone.sla_status === "OVER_SLA" || selectedProject.sla_status === "OVER_SLA") {
    return {
      ...base,
      tone: "risk",
      status: "เกิน SLA แล้ว",
      title: "งานนี้เกิน SLA แล้ว",
      suggestion: "ให้ owner ดำเนินการทันที หรือแจ้ง supervisor",
    };
  }

  if (currentMilestone.sla_status === "NEAR_SLA" || selectedProject.sla_status === "NEAR_SLA") {
    return {
      ...base,
      tone: "warning",
      status: "ใกล้ SLA",
      title: `ควรทำวันนี้: ${stageDisplay(currentMilestone).title}`,
      suggestion: `งานนี้ใกล้หลุด SLA ให้ ${stageOwner(currentMilestone)} ตรวจและปิดงานในขั้นตอนนี้`,
    };
  }

  if (currentMilestone.sla_status === "NEAR_SLA" || selectedProject.sla_status === "NEAR_SLA") {
    return {
      ...base,
      tone: "warning",
      status: "ใกล้หลุด SLA",
      title: "งานนี้ใกล้หลุด SLA",
      suggestion: "ควรดำเนินการภายในวันนี้",
    };
  }

  if (currentStageReady) {
    return {
      ...base,
      tone: "ready",
      status: "พร้อมไปต่อ",
      title: nextMilestone ? `พร้อมส่งต่อไป: ${stageDisplay(nextMilestone).title}` : "พร้อมปิดขั้นตอนสุดท้าย",
      suggestion: `กด ${completionButtonLabel(currentMilestone)} เพื่อส่งงานจาก ${stageDisplay(currentMilestone).title}`,
    };
  }

  if (currentStageReady) {
    return {
      ...base,
      tone: "ready",
      status: "พร้อมไปต่อ",
      title: "ขั้นตอนนี้พร้อมไปต่อ",
      suggestion: "กดไปขั้นตอนถัดไปเพื่อส่งงานไปขั้นตอนถัดไป",
    };
  }

  return base;
}

export default function Dashboard() {
  const [projects, setProjects] = useState<any[]>([]);
  const [projectSearch, setProjectSearch] = useState("");
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [approvalItems, setApprovalItems] = useState<any[]>([]);
  const [riskyStages, setRiskyStages] = useState<any[]>([]);
  const [documentRisks, setDocumentRisks] = useState<any[]>([]);
  const [fieldJobs, setFieldJobs] = useState<any[]>([]);
  const [schedulingItems, setSchedulingItems] = useState<any[]>([]);
  const [resourceTeams, setResourceTeams] = useState<any[]>([]);
  const [billingItems, setBillingItems] = useState<any[]>([]);
  const [qaItems, setQaItems] = useState<any[]>([]);
  const [workflowGovernance, setWorkflowGovernance] = useState<any | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [selectedWorkflowStageId, setSelectedWorkflowStageId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'projects' | 'field' | 'scheduling' | 'billing' | 'qa' | 'approvals' | 'settings'>('dashboard');
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [loadingMilestones, setLoadingMilestones] = useState(false);
  const [uploadingMilestoneId, setUploadingMilestoneId] = useState<string | null>(null);
  const [uploadRetryItems, setUploadRetryItems] = useState<UploadRetryItem[]>([]);
  const [processingUploadRetryId, setProcessingUploadRetryId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [generatingRuntime, setGeneratingRuntime] = useState(false);
  const [creatingDriveFolder, setCreatingDriveFolder] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [stageHistoryScope, setStageHistoryScope] = useState<'stage' | 'all'>('stage');
  const [expandedHistoryStages, setExpandedHistoryStages] = useState<Record<string, boolean>>({});
  const [refreshingSla, setRefreshingSla] = useState(false);
  const [rejectingDocumentId, setRejectingDocumentId] = useState<string | null>(null);
  const [versioningDocumentId, setVersioningDocumentId] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<any | null>(null);
  const [rejectModal, setRejectModal] = useState<{ document: any; reason: string } | null>(null);
  const [showProjectDocumentControl, setShowProjectDocumentControl] = useState(false);
  const [showProjectStageSequence, setShowProjectStageSequence] = useState(false);
  const [stageRailOverflow, setStageRailOverflow] = useState({ left: false, right: false });
  const [stageActionLoading, setStageActionLoading] = useState<string | null>(null);
  const [checkingInStageId, setCheckingInStageId] = useState<string | null>(null);
  const [selectedException, setSelectedException] = useState<any | null>(null);
  const [exceptionFilters, setExceptionFilters] = useState({ status: 'ALL', severity: 'ALL', category: 'ALL' });
  const [dashboardStageFilter, setDashboardStageFilter] = useState("ALL");
  const [dashboardProjectPage, setDashboardProjectPage] = useState(1);
  const [dashboardProjectsPerPage, setDashboardProjectsPerPage] = useState(12);
  const [stageRailDragging, setStageRailDragging] = useState(false);
  const [stageActionModal, setStageActionModal] = useState<{
    type: 'QA' | 'BILLING';
    action: string;
    title: string;
    reason: string;
  } | null>(null);
  const [loanFallbackModal, setLoanFallbackModal] = useState<{
    stage: any;
    action: 'REJECT_AND_OFFER_CASH' | 'ACCEPT_CASH_OFFER' | 'DECLINE_CASH_OFFER';
    title: string;
    reason: string;
  } | null>(null);
  const [financePathModal, setFinancePathModal] = useState<{
    stage: any;
    action: 'SWITCH_TO_CASH' | 'SWITCH_TO_LOAN';
    title: string;
    reason: string;
  } | null>(null);
  const stageRailRef = useRef<HTMLDivElement | null>(null);
  const stageRailDragRef = useRef({ active: false, startX: 0, scrollLeft: 0, moved: false, pointerId: null as number | null });
  const suppressStageRailClickRef = useRef(false);
  const [approvalLoading, setApprovalLoading] = useState<string | null>(null);
  const [overrideModal, setOverrideModal] = useState<{ stage: any; reason: string } | null>(null);
  const [gateBlockModal, setGateBlockModal] = useState<{
    stageId: string;
    title: string;
    message: string;
    violations: any[];
  } | null>(null);
  const [completeStageModal, setCompleteStageModal] = useState<any | null>(null);
  const [checklistReviewModal, setChecklistReviewModal] = useState<any | null>(null);
  const [completingStageId, setCompletingStageId] = useState<string | null>(null);
  const [checklistLoadingId, setChecklistLoadingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [notificationLoadingId, setNotificationLoadingId] = useState<string | null>(null);
  const [notificationRefreshing, setNotificationRefreshing] = useState(false);
  const [notificationFilters, setNotificationFilters] = useState({ status: 'ACTIVE', severity: 'ALL', channel: 'ALL', projectId: 'ALL' });
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, { scheduledStart: string; scheduledEnd: string; resourceTeamId: string }>>({});
  const [scheduleRangeDays, setScheduleRangeDays] = useState<7 | 15 | 30>(15);
  const [scheduleWindowOffset, setScheduleWindowOffset] = useState(0);
  const [scheduleTeamFilter, setScheduleTeamFilter] = useState("ALL");
  const [scheduleStatusFilter, setScheduleStatusFilter] = useState("ALL");
  const [scheduleSearch, setScheduleSearch] = useState("");
  const [schedulingStageId, setSchedulingStageId] = useState<string | null>(null);
  const [draggedScheduleId, setDraggedScheduleId] = useState<string | null>(null);
  const [focusedScheduleStageId, setFocusedScheduleStageId] = useState<string | null>(null);
  const [editingScheduleStageId, setEditingScheduleStageId] = useState<string | null>(null);
  const [scheduleRescheduleReasons, setScheduleRescheduleReasons] = useState<Record<string, string>>({});
  const [resourceTeamDraft, setResourceTeamDraft] = useState({ name: "", territory: "", dailyCapacity: "1", skills: "" });
  const [creatingResourceTeam, setCreatingResourceTeam] = useState(false);
  const [editingResourceTeamId, setEditingResourceTeamId] = useState<string | null>(null);
  const [resourceTeamEdits, setResourceTeamEdits] = useState<Record<string, { name: string; territory: string; dailyCapacity: string; skills: string; isActive: boolean }>>({});
  const [resourceTeamUpdatingId, setResourceTeamUpdatingId] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [networkActivity, setNetworkActivity] = useState({ pending: 0, label: "" });
  const [directNetworkActivity, setDirectNetworkActivity] = useState({ pending: 0, label: "" });
  const [workflowBuilderLoading, setWorkflowBuilderLoading] = useState<string | null>(null);
  const [adminSettingsTab, setAdminSettingsTab] = useState<'workflow' | 'team' | 'user' | 'role' | 'audit'>('workflow');
  const [selectedAdminRole, setSelectedAdminRole] = useState("ops");
  const [workflowStageEdits, setWorkflowStageEdits] = useState<Record<string, { name: string; ownerRole: string; slaHours: string; isActive: boolean }>>({});
  const [workflowNewStageDraft, setWorkflowNewStageDraft] = useState({ code: "", name: "", ownerRole: "ops", slaHours: "24" });
  const [workflowChecklistDraft, setWorkflowChecklistDraft] = useState({ code: "", label: "", gateSeverity: "HARD", isRequired: true });
  const [workflowDocumentDraft, setWorkflowDocumentDraft] = useState({ code: "", name: "", gateSeverity: "HARD", isRequired: true, requiresVerification: true, driveFolderKey: "" });
  const [workflowTransitionDraft, setWorkflowTransitionDraft] = useState({ type: "FORWARD", toStageId: "", gateSeverity: "HARD", requiresApproval: false });
  const [profileUsers, setProfileUsers] = useState<any[]>([]);
  const [profileRoles, setProfileRoles] = useState<Array<{ role_code: string; role_name: string; is_active: boolean }>>([]);
  const [profileLoadingId, setProfileLoadingId] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditActions, setAuditActions] = useState<string[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditFilters, setAuditFilters] = useState({ action: "ALL", search: "", page: 1, pageSize: 50 });
  const [auditPagination, setAuditPagination] = useState({ page: 1, pageSize: 50, total: 0 });
  const resourceSkillOptions = [
    { value: "installation", label: "Installation" },
    { value: "survey", label: "Survey" },
    { value: "qa", label: "QA" },
    { value: "billing", label: "Billing" },
  ];
  const workflowSlaOptions = [
    { value: "0", label: "ไม่มี SLA" },
    { value: "1", label: "1 ชม." },
    { value: "3", label: "3 ชม." },
    { value: "8", label: "8 ชม." },
    { value: "24", label: "1 วัน" },
    { value: "48", label: "2 วัน" },
    { value: "72", label: "3 วัน" },
    { value: "120", label: "5 วัน" },
    { value: "168", label: "7 วัน" },
  ];
  const workflowGateSeverityOptions = ["HARD", "OVERRIDEABLE", "SOFT", "INFO"];
  const workflowTransitionTypeOptions = ["FORWARD", "REWORK"];
  const workflowDriveFolderOptions = [
    { value: "", label: "ไม่ผูก Drive folder" },
    { value: "01_Sales_Commercial", label: "01 Sales / Commercial" },
    { value: "02_Survey_TSSR", label: "02 Survey / TSSR" },
    { value: "03_Loan_Documents", label: "03 Loan Documents" },
    { value: "04_Installation_Photos", label: "04 Installation Photos" },
    { value: "05_Site_Folder_Handover", label: "05 Site Folder / Handover" },
    { value: "06_Billing_Finance", label: "06 Billing / Finance" },
  ];
  function clearAuthenticatedState() {
    setProjects([]);
    setProjectSearch("");
    setExceptions([]);
    setPendingApprovals([]);
    setApprovalItems([]);
    setRiskyStages([]);
    setDocumentRisks([]);
    setFieldJobs([]);
    setSchedulingItems([]);
    setResourceTeams([]);
    setBillingItems([]);
    setQaItems([]);
    setWorkflowGovernance(null);
    setNotifications([]);
    setSelectedWorkflowStageId(null);
    setSelectedProject(null);
    setMilestones([]);
    setSelectedStageId(null);
    setSelectedDocument(null);
    setShowProjectStageSequence(false);
    setSelectedException(null);
    setRejectModal(null);
    setStageActionModal(null);
    setLoanFallbackModal(null);
    setFinancePathModal(null);
    setOverrideModal(null);
    setGateBlockModal(null);
    setCompleteStageModal(null);
    setChecklistReviewModal(null);
    setScheduleDrafts({});
    setScheduleRescheduleReasons({});
    setProfileUsers([]);
    setProfileRoles([]);
    setAuditLogs([]);
    setAuditActions([]);
    setAuditPagination({ page: 1, pageSize: 50, total: 0 });
    setCurrentUserRole(null);
    setActiveTab("dashboard");
    setLoading(false);
  }

  const [adminRoleDefinitions, setAdminRoleDefinitions] = useState([
    {
      value: "system_admin",
      label: "System Admin",
      purpose: "Platform-level administrator for destructive system actions, production readiness, and emergency governance.",
      responsibilities: ["Delete projects with Drive cleanup", "Review audit logs", "Manage production readiness"],
      pages: ["Dashboard", "Projects", "System Admin"],
    },
    {
      value: "admin",
      label: "ผู้ดูแลระบบ",
      purpose: "ดูแลระบบทั้งหมด ตั้งค่า source of truth และจัดการผู้ใช้งาน",
      responsibilities: ["Workflow governance", "User and role administration", "System exception oversight"],
      pages: ["Dashboard", "Projects", "Schedule", "Billing", "QA", "Approvals", "System Admin"],
    },
    {
      value: "exec",
      label: "ผู้บริหาร",
      purpose: "ดูภาพรวมผู้บริหาร ติดตาม SLA, risk และ exception สำคัญ",
      responsibilities: ["Executive KPI review", "Exception monitoring", "Operational escalation"],
      pages: ["Dashboard", "Projects", "Approvals"],
    },
    {
      value: "sales",
      label: "ฝ่ายขาย",
      purpose: "ดูแลข้อมูลลูกค้า ใบเสนอราคา และเส้นทางชำระเงิน",
      responsibilities: ["Lead and quotation readiness", "Customer contact update", "Finance path coordination"],
      pages: ["Dashboard", "Projects", "Approvals"],
    },
    {
      value: "ops",
      label: "ทีมปฏิบัติการ",
      purpose: "ควบคุมงานปฏิบัติการ ตารางติดตั้ง และการส่งมอบงาน",
      responsibilities: ["Scheduling", "Handover coordination", "SLA follow-up"],
      pages: ["Dashboard", "Projects", "Schedule", "Field", "Approvals"],
    },
    {
      value: "engineer",
      label: "วิศวกรรม",
      purpose: "ดูแลข้อมูลวิศวกรรมและความพร้อมเชิงเทคนิคก่อนติดตั้ง",
      responsibilities: ["Survey/TSSR review", "Engineering gate completion", "Technical document readiness"],
      pages: ["Dashboard", "Projects"],
    },
    {
      value: "qa",
      label: "ตรวจคุณภาพ",
      purpose: "ตรวจคุณภาพงานติดตั้ง อนุมัติผ่าน/ไม่ผ่าน/ส่งกลับแก้ไข",
      responsibilities: ["QA checklist review", "QA pass/fail decision", "Rework tracking"],
      pages: ["Dashboard", "Projects", "QA"],
    },
    {
      value: "contractor",
      label: "ผู้รับเหมา",
      purpose: "ทำงานหน้างาน เช็คอิน อัปโหลดหลักฐาน และปิด checklist ติดตั้ง",
      responsibilities: ["Field check-in", "Photo evidence upload", "Installation checklist completion"],
      pages: ["Field", "Projects"],
    },
    {
      value: "finance",
      label: "การเงิน",
      purpose: "ตรวจเอกสารวางบิลและอนุมัติ/ตีกลับ billing",
      responsibilities: ["Invoice/PAC/FBOQ review", "Billing approval", "Billing exception follow-up"],
      pages: ["Dashboard", "Projects", "Billing"],
    },
    {
      value: "rcm",
      label: "RCM",
      purpose: "ดูแลงานตัด MAT และประสานงาน resource/material ก่อนวางบิล",
      responsibilities: ["MAT cut coordination", "Material readiness confirmation", "Billing handoff support"],
      pages: ["Dashboard", "Projects", "Billing"],
    },
    {
      value: "sbc",
      label: "SBC - Solar Champion Business",
      purpose: "Operational champion ที่สร้างและดูแล project ได้ครบทุก step ตาม scope ที่ system admin กำหนด",
      responsibilities: ["Project creation", "Cross-stage execution", "Document and exception follow-up"],
      pages: ["Dashboard", "Projects", "Field", "Schedule", "Billing", "QA", "Approvals"],
    },
  ]);
  const [adminRoleDraft, setAdminRoleDraft] = useState({
    value: "",
    label: "",
    purpose: "",
    responsibilities: "",
    pages: "",
  });
  const selectedAdminRoleDefinition = adminRoleDefinitions.find((role) => role.value === selectedAdminRole) || adminRoleDefinitions[0];

  function showNotice(tone: 'success' | 'error' | 'info', title: string, message?: string) {
    setNotice({ tone, title, message });
    window.setTimeout(() => {
      setNotice((current) => current?.title === title ? null : current);
    }, 4500);
  }

  async function withNetworkActivity<T>(label: string, task: () => Promise<T>) {
    setDirectNetworkActivity((current) => ({
      pending: current.pending + 1,
      label,
    }));

    try {
      return await task();
    } finally {
      setDirectNetworkActivity((current) => {
        const pending = Math.max(0, current.pending - 1);
        return {
          pending,
          label: pending ? "Still working with server" : "",
        };
      });
    }
  }

  async function handleOpenDriveImage(fileId: string) {
    try {
      const response = await apiFetch(`/api/drive/image?fileId=${encodeURIComponent(fileId)}`);
      if (!response.ok) throw new Error(await response.text());

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      setPreviewImage(objectUrl);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unable to load image.";
      showNotice("error", "Preview failed", message);
    }
  }

  function adminRoleDisplay(role: { value: string; label?: string }) {
    const code = String(role.value || "").trim();
    const label = role.label || roleLabel(code);
    return code ? `${label} (${code})` : label;
  }

  const canDeleteProjects = currentUserRole === "system_admin";

  function auditActorLabel(log: any) {
    return log.actor?.full_name || log.actor?.email || (log.actor_id ? `User ${String(log.actor_id).slice(0, 8)}` : "System");
  }

  function auditProjectLabel(log: any) {
    if (!log.project) return log.project_id ? `Project ${String(log.project_id).slice(0, 8)}` : "System";
    return `${log.project.customer_code || "Project"}${log.project.customer_name ? ` / ${log.project.customer_name}` : ""}`;
  }

  function auditPayloadSummary(log: any) {
    const payload = log.after_state || log.metadata || log.before_state || {};
    const text = JSON.stringify(payload);
    if (!text || text === "{}") return "No payload";
    return text.length > 180 ? `${text.slice(0, 180)}...` : text;
  }

  function saveAdminRoleDefinition() {
    const value = adminRoleDraft.value.trim().toLowerCase();
    if (!value) {
      showNotice('error', 'เพิ่ม Role ไม่สำเร็จ', 'กรุณาระบุ role code');
      return;
    }
    const nextRole = {
      value,
      label: adminRoleDraft.label.trim() || value.toUpperCase(),
      purpose: adminRoleDraft.purpose.trim() || 'ยังไม่ได้ระบุหน้าที่ของ role นี้',
      responsibilities: adminRoleDraft.responsibilities.split('\n').map((item) => item.trim()).filter(Boolean),
      pages: adminRoleDraft.pages.split(',').map((item) => item.trim()).filter(Boolean),
    };
    setAdminRoleDefinitions((current) => {
      const exists = current.some((role) => role.value === value);
      return exists ? current.map((role) => role.value === value ? nextRole : role) : [...current, nextRole];
    });
    setSelectedAdminRole(value);
    setAdminRoleDraft({ value: "", label: "", purpose: "", responsibilities: "", pages: "" });
    showNotice('success', 'บันทึก Role แล้ว', nextRole.label);
  }

  function beginEditAdminRole(role: any) {
    setAdminRoleDraft({
      value: role.value,
      label: role.label || roleLabel(role.value),
      purpose: role.purpose || "",
      responsibilities: (role.responsibilities || []).join('\n'),
      pages: (role.pages || []).join(', '),
    });
  }

                                            useEffect(() => {
    fetchProjects();
    fetchFieldJobs();
    fetchSchedulingItems();
    fetchResourceTeams();
    fetchBillingItems();
    fetchQaItems();
    fetchApprovalItems();
    fetchWorkflowGovernance();
    fetchNotifications();
    fetchProfileUsers();
    fetchProfileRoles();
    fetchAuditLogs();
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthEmail(data.session?.user.email || null);
      if (data.session?.user) {
        loadCurrentUserRole(data.session.user.id, data.session.user.user_metadata?.role || null);
      } else {
        clearAuthenticatedState();
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setAuthEmail(session?.user.email || null);
      if (session?.user) {
        loadCurrentUserRole(session.user.id, session.user.user_metadata?.role || null);
        if (event === "SIGNED_IN") {
          fetchProjects();
          fetchFieldJobs();
          fetchSchedulingItems();
          fetchResourceTeams();
          fetchBillingItems();
          fetchQaItems();
          fetchApprovalItems();
          fetchWorkflowGovernance();
          fetchNotifications();
          fetchProfileUsers();
          fetchProfileRoles();
          fetchAuditLogs();
        }
      } else {
        clearAuthenticatedState();
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    function handleNetworkActivity(event: Event) {
      const detail = (event as CustomEvent<{ pending: number; label: string }>).detail;
      setNetworkActivity({
        pending: detail?.pending || 0,
        label: detail?.label || "",
      });
    }

    window.addEventListener("sunbase:network", handleNetworkActivity);
    return () => window.removeEventListener("sunbase:network", handleNetworkActivity);
  }, []);

  async function loadCurrentUserRole(userId: string | null, fallbackRole?: string | null) {
    if (!userId) {
      setCurrentUserRole(null);
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (!error) setCurrentUserRole(data?.role || fallbackRole || null);
    else setCurrentUserRole(fallbackRole || null);
  }

  useEffect(() => {
    refreshUploadRetryQueue();

    const retryWhenOnline = () => {
      refreshUploadRetryQueue();
    };
    window.addEventListener('online', retryWhenOnline);
    return () => window.removeEventListener('online', retryWhenOnline);
  }, []);

  useEffect(() => {
    return () => {
      if (previewImage?.startsWith("blob:")) URL.revokeObjectURL(previewImage);
    };
  }, [previewImage]);

  async function handleSignIn(email: string, password: string) {
    setAuthLoading(true);
    setAuthError("");
    try {
      const loginId = email.trim();
      const loginEmail = loginId.includes("@") ? loginId.toLowerCase() : `${loginId.toLowerCase()}@sbc.local`;
      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
      if (error) throw error;
      setAuthDialogOpen(false);
      showNotice("success", "เข้าสู่ระบบแล้ว", loginId);
    } catch (error: any) {
      setAuthError(error.message || "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    clearAuthenticatedState();
    const { error } = await supabase.auth.signOut();
    if (error) {
      showNotice("error", "ออกจากระบบไม่สำเร็จ", error.message);
      return;
    }
    setAuthEmail(null);
    showNotice("success", "ออกจากระบบแล้ว", "ข้อมูลบนหน้าจอถูกล้างแล้ว");
  }

  async function fetchNotifications(nextFilters = notificationFilters) {
    setNotificationRefreshing(true);
    try {
      const params = new URLSearchParams({
        status: nextFilters.status,
        limit: '60',
      });
      if (nextFilters.severity !== 'ALL') params.set('severity', nextFilters.severity);
      if (nextFilters.channel !== 'ALL') params.set('channel', nextFilters.channel);
      if (nextFilters.projectId !== 'ALL') params.set('projectId', nextFilters.projectId);

      const response = await apiFetch(`/api/notifications?${params.toString()}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to fetch notifications.');
      }

      setNotifications(payload.notifications || []);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setNotificationRefreshing(false);
    }
  }

  async function fetchProfileUsers() {
    try {
      const response = await apiFetch('/api/profiles');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to fetch profiles.');
      setProfileUsers(payload.users || []);
    } catch (error) {
      console.error('Error fetching profile users:', error);
    }
  }

  async function fetchProfileRoles() {
    try {
      const response = await apiFetch('/api/admin/roles');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to fetch roles.');
      setProfileRoles((payload.roles || []).map((role: any) => ({
        role_code: role.role_code,
        role_name: role.role_name,
        is_active: role.is_active !== false,
      })));
    } catch (error) {
      console.error('Error fetching profile roles:', error);
    }
  }

  async function fetchAuditLogs(nextFilters = auditFilters) {
    setAuditLoading(true);
    try {
      const params = new URLSearchParams({
        action: nextFilters.action,
        search: nextFilters.search,
        page: String(nextFilters.page),
        pageSize: String(nextFilters.pageSize),
      });
      const response = await apiFetch(`/api/audit-logs?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to fetch audit logs.');

      setAuditLogs(payload.logs || []);
      setAuditActions(payload.actions || []);
      setAuditPagination(payload.pagination || { page: nextFilters.page, pageSize: nextFilters.pageSize, total: 0 });
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      setAuditLogs([]);
    } finally {
      setAuditLoading(false);
    }
  }

  async function handleSaveProfileUser(user: any, draft: { fullName: string; role: string; isActive: boolean }) {
    setProfileLoadingId(user.id);
    try {
      const response = await apiFetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
          fullName: draft.fullName,
          role: draft.role,
          isActive: draft.isActive,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to save profile.');
      showNotice('success', 'บันทึกผู้ใช้แล้ว', payload.profile?.email || user.email);
      await fetchProfileUsers();
    } catch (error: any) {
      showNotice('error', 'บันทึกผู้ใช้ไม่สำเร็จ', error.message);
    } finally {
      setProfileLoadingId(null);
    }
  }

  async function handleCreateProfileUser(draft: { email: string; password: string; fullName: string; role: string; isActive: boolean; emailConfirmed: boolean }) {
    setProfileLoadingId("__create_user__");
    try {
      const response = await apiFetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'createUser',
          email: draft.email,
          password: draft.password,
          fullName: draft.fullName,
          role: draft.role,
          isActive: draft.isActive,
          emailConfirmed: draft.emailConfirmed,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to create user.');
      showNotice('success', 'สร้างผู้ใช้แล้ว', payload.profile?.email || draft.email);
      await fetchProfileUsers();
    } catch (error: any) {
      showNotice('error', 'สร้างผู้ใช้ไม่สำเร็จ', error.message);
    } finally {
      setProfileLoadingId(null);
    }
  }

  async function handleBootstrapAdminProfile() {
    setProfileLoadingId("__bootstrap__");
    try {
      const response = await apiFetch('/api/profiles/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to bootstrap admin profile.');
      showNotice('success', 'ตั้งค่า Admin แล้ว', payload.profile?.email || authEmail || undefined);
      await fetchProfileUsers();
    } catch (error: any) {
      showNotice('error', 'ตั้งค่า Admin ไม่สำเร็จ', error.message);
    } finally {
      setProfileLoadingId(null);
    }
  }

  async function fetchResourceTeams() {
    try {
      const response = await apiFetch('/api/resource-teams');
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to fetch resource teams.');
      }

      setResourceTeams(payload.teams || []);
    } catch (error) {
      console.error('Error fetching resource teams:', error);
    }
  }

  function defaultScheduleStart(item: any) {
    const value = item?.metadata?.scheduled_at || item?.due_at || item?.started_at || new Date().toISOString();
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
    return localDate.toISOString().slice(0, 10);
  }

  function defaultScheduleEnd(item: any) {
    const value = item?.metadata?.scheduled_end || item?.metadata?.scheduled_at || item?.due_at || item?.started_at || new Date().toISOString();
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
    return localDate.toISOString().slice(0, 10);
  }

  function scheduleDraftFor(item: any) {
    return scheduleDrafts[item.id] || {
      scheduledStart: defaultScheduleStart(item),
      scheduledEnd: defaultScheduleEnd(item),
      resourceTeamId: item?.metadata?.resource_team_id || '',
    };
  }

  function scheduleDateKeyFromValue(value?: string | Date | null) {
    if (!value) return "";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
    return localDate.toISOString().slice(0, 10);
  }

  function scheduleDateKeyOffset(dayKey: string, offset: number) {
    const date = new Date(`${dayKey}T00:00:00`);
    date.setDate(date.getDate() + offset);
    return date.toISOString().slice(0, 10);
  }

  function scheduleDayDiff(startKey: string, endKey: string) {
    const start = new Date(`${startKey}T00:00:00`).getTime();
    const end = new Date(`${endKey}T00:00:00`).getTime();
    return Math.round((end - start) / 86400000);
  }

  function scheduleBookingRange(item: any) {
    const draft = scheduleDrafts[item.id];
    const savedStart = scheduleDateKeyFromValue(item?.metadata?.scheduled_at);
    const savedEnd = scheduleDateKeyFromValue(item?.metadata?.scheduled_end || item?.metadata?.scheduled_at);
    const scheduledStart = draft?.scheduledStart || savedStart;
    const scheduledEnd = draft?.scheduledEnd || savedEnd || scheduledStart;
    if (!scheduledStart) return null;
    return {
      startKey: scheduledStart,
      endKey: scheduledEnd < scheduledStart ? scheduledStart : scheduledEnd,
      resourceTeamId: draft?.resourceTeamId ?? item?.metadata?.resource_team_id ?? "",
    };
  }

  function scheduleDatesChanged(item: any, draft = scheduleDraftFor(item)) {
    const savedStart = scheduleDateKeyFromValue(item?.metadata?.scheduled_at);
    const savedEnd = scheduleDateKeyFromValue(item?.metadata?.scheduled_end || item?.metadata?.scheduled_at);
    if (!savedStart) return false;
    return draft.scheduledStart !== savedStart || (draft.scheduledEnd || draft.scheduledStart) !== (savedEnd || savedStart);
  }

  function activityScheduleRange(activity: any) {
    const afterState = activity?.after_state || {};
    const metadata = activity?.metadata || {};
    const startKey = scheduleDateKeyFromValue(afterState.scheduled_start || metadata.scheduled_start);
    const endKey = scheduleDateKeyFromValue(afterState.scheduled_end || metadata.scheduled_end || afterState.scheduled_start || metadata.scheduled_start);
    if (!startKey) return null;
    return { startKey, endKey: endKey || startKey };
  }

  function rescheduleCountFromActivities(activities: any[]) {
    const scheduledEvents = (activities || [])
      .filter((activity) => activity.action === 'RESOURCE_SCHEDULED')
      .map((activity) => ({ activity, range: activityScheduleRange(activity) }))
      .filter((entry) => entry.range)
      .sort((a, b) => new Date(a.activity.created_at).getTime() - new Date(b.activity.created_at).getTime());

    let previousRange: { startKey: string; endKey: string } | null = null;
    let count = 0;
    scheduledEvents.forEach(({ range }) => {
      if (previousRange && range && (range.startKey !== previousRange.startKey || range.endKey !== previousRange.endKey)) {
        count += 1;
      }
      if (range) previousRange = range;
    });
    return count;
  }

  function scheduleActivityDetail(activity: any) {
    if (activity?.action !== 'RESOURCE_SCHEDULED' || !activity?.metadata?.is_reschedule) return null;
    const beforeStart = activity?.before_state?.scheduled_start;
    const beforeEnd = activity?.before_state?.scheduled_end;
    const afterStart = activity?.after_state?.scheduled_start;
    const afterEnd = activity?.after_state?.scheduled_end;
    const beforeStartKey = scheduleDateKeyFromValue(beforeStart);
    const afterStartKey = scheduleDateKeyFromValue(afterStart);
    if (!beforeStartKey || !afterStartKey) return null;
    const diff = scheduleDayDiff(beforeStartKey, afterStartKey);
    const direction = diff > 0 ? "เลื่อนออก" : diff < 0 ? "เลื่อนเข้า" : "เปลี่ยนช่วงวัน";
    const notes = String(activity.metadata?.schedule_notes || "").replace(/^Re Schedule:\s*/i, "").trim();
    return {
      direction,
      from: `${formatDateTime(beforeStart)} - ${formatDateTime(beforeEnd || beforeStart)}`,
      to: `${formatDateTime(afterStart)} - ${formatDateTime(afterEnd || afterStart)}`,
      notes: notes || "ไม่ระบุสาเหตุ",
    };
  }

  function scheduleDateStartIso(value: string) {
    return new Date(`${value}T00:00:00`).toISOString();
  }

  function scheduleDateEndIso(value: string) {
    return new Date(`${value}T23:59:59`).toISOString();
  }

  async function handleScheduleBookingDrop(dayKey: string, resourceTeamId: string, itemId: string | null) {
    if (!itemId) return;
    const item = schedulingItems.find((entry) => entry.id === itemId);
    if (!item) return;
    const draft = scheduleDraftFor(item);
    const currentDuration = draft.scheduledStart && draft.scheduledEnd ? Math.max(0, scheduleDayDiff(draft.scheduledStart, draft.scheduledEnd)) : 0;
    const nextDraft = {
      ...draft,
      scheduledStart: dayKey,
      scheduledEnd: scheduleDateKeyOffset(dayKey, currentDuration),
      resourceTeamId,
    };
    setDraggedScheduleId(null);
    setScheduleDrafts((current) => ({
      ...current,
      [item.id]: nextDraft,
    }));
    if (scheduleDatesChanged(item, nextDraft)) {
      setEditingScheduleStageId(item.id);
      setFocusedScheduleStageId(item.id);
      showNotice('info', 'กรุณาระบุเหตุผล Re Schedule', 'การเลื่อนวันต้องบันทึกเหตุผลก่อน Save');
      return;
    }
    await handleScheduleStage(item, nextDraft);
  }

  async function handleScheduleStage(item: any, overrideDraft?: { scheduledStart: string; scheduledEnd: string; resourceTeamId: string }, overrideNotes?: string) {
    const project = relatedProject(item);
    if (!project?.id) {
      showNotice('error', 'จัดตารางไม่สำเร็จ', 'ไม่พบโครงการของงานนี้');
      return;
    }

    const draft = overrideDraft || scheduleDraftFor(item);
    if (!draft.scheduledStart) {
      showNotice('error', 'จัดตารางไม่สำเร็จ', 'กรุณาเลือกวันและเวลา');
      return;
    }

    const scheduledEnd = draft.scheduledEnd || draft.scheduledStart;
    if (scheduledEnd < draft.scheduledStart) {
      showNotice('error', 'จัดตารางไม่สำเร็จ', 'วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น');
      return;
    }
    const isReschedule = scheduleDatesChanged(item, draft);
    const rescheduleReason = (overrideNotes ?? scheduleRescheduleReasons[item.id] ?? '').trim();
    if (isReschedule && !rescheduleReason) {
      setEditingScheduleStageId(item.id);
      showNotice('error', 'ต้องระบุเหตุผล Re Schedule', 'กรุณาใส่เหตุผลเมื่อต้องเปลี่ยนวันเริ่มหรือวันสิ้นสุด');
      return;
    }

    setSchedulingStageId(item.id);
    try {
      const response = await apiFetch(`/api/projects/${project.id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectStageId: item.id,
          scheduledStart: scheduleDateStartIso(draft.scheduledStart),
          scheduledEnd: scheduleDateEndIso(scheduledEnd),
          resourceTeamId: draft.resourceTeamId || null,
          requiredSkill: requiredResourceSkillForStage(item),
          territory: project.territory || project.metadata?.territory || null,
          notes: isReschedule ? `Re Schedule: ${rescheduleReason}` : 'จัดตารางจากหน้าตารางงาน',
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to schedule stage.');
      }

      showNotice(
        payload.conflictStatus === 'NONE' ? 'success' : 'info',
        payload.conflictStatus === 'NONE' ? 'บันทึกตารางแล้ว' : 'บันทึกตารางแล้ว แต่มีความเสี่ยงทีมชนกัน',
        scheduleConflictLabel(payload.conflictStatus),
      );
      await Promise.all([fetchSchedulingItems(), fetchNotifications(), fetchProjects()]);
      setEditingScheduleStageId(null);
      setScheduleRescheduleReasons((current) => ({ ...current, [item.id]: '' }));
      if (selectedProject?.id === project.id) await handleSelectProject(selectedProject);
    } catch (error: any) {
      showNotice('error', 'จัดตารางไม่สำเร็จ', error.message);
    } finally {
      setSchedulingStageId(null);
    }
  }

  async function openSchedulingForStage(stage: any) {
    setChecklistReviewModal(null);
    setSelectedStageId(null);
    setFocusedScheduleStageId(stage?.id || null);
    setScheduleRangeDays(15);
    setActiveTab('scheduling');
    await fetchSchedulingItems();
    await fetchResourceTeams();
    if (stage?.id) {
      setScheduleDrafts((current) => ({
        ...current,
        [stage.id]: current[stage.id] || {
          scheduledStart: stage?.metadata?.scheduled_at ? defaultScheduleStart(stage) : '',
          scheduledEnd: stage?.metadata?.scheduled_end ? defaultScheduleEnd(stage) : (stage?.metadata?.scheduled_at ? defaultScheduleStart(stage) : ''),
          resourceTeamId: stage?.metadata?.resource_team_id || '',
        },
      }));
    }
    showNotice('info', stage?.metadata?.scheduled_at ? 'แก้ไขตารางติดตั้ง' : 'เลือกวันติดตั้งจาก Calendar', 'ดูช่องว่างของทีมก่อนเลือกวันและบันทึกตาราง');
  }

  async function handleCreateResourceTeam() {
    if (!resourceTeamDraft.name.trim()) {
      showNotice('error', 'Team name required', 'Please enter resource team name.');
      return;
    }

    setCreatingResourceTeam(true);
    try {
      const response = await apiFetch('/api/resource-teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: resourceTeamDraft.name,
          territory: resourceTeamDraft.territory || null,
          dailyCapacity: Number(resourceTeamDraft.dailyCapacity || 1),
          skills: resourceTeamDraft.skills,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to create resource team.');
      }

      setResourceTeamDraft({ name: "", territory: "", dailyCapacity: "1", skills: "" });
      showNotice('success', 'Resource team created', payload.team?.name);
      await fetchResourceTeams();
    } catch (error: any) {
      showNotice('error', 'Create team failed', error.message);
    } finally {
      setCreatingResourceTeam(false);
    }
  }

  function resourceTeamEditFor(team: any) {
    return resourceTeamEdits[team.id] || {
      name: team.name || "",
      territory: team.territory || "",
      dailyCapacity: String(team.daily_capacity || 1),
      skills: Array.isArray(team.skills) ? team.skills.join(", ") : "",
      isActive: team.is_active !== false,
    };
  }

  function beginEditResourceTeam(team: any) {
    setEditingResourceTeamId(team.id);
    setResourceTeamEdits((current) => ({
      ...current,
      [team.id]: resourceTeamEditFor(team),
    }));
  }

  async function handleUpdateResourceTeam(team: any) {
    const draft = resourceTeamEditFor(team);

    if (!draft.name.trim()) {
      showNotice('error', 'Team name required', 'Please enter resource team name.');
      return;
    }

    setResourceTeamUpdatingId(team.id);
    try {
      const response = await apiFetch(`/api/resource-teams/${team.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          territory: draft.territory || null,
          dailyCapacity: Number(draft.dailyCapacity || 1),
          skills: draft.skills,
          isActive: draft.isActive,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to update resource team.');
      }

      setEditingResourceTeamId(null);
      setResourceTeamEdits((current) => {
        const next = { ...current };
        delete next[team.id];
        return next;
      });
      showNotice('success', 'Resource team updated', payload.team?.name);
      await fetchResourceTeams();
    } catch (error: any) {
      showNotice('error', 'Update team failed', error.message);
    } finally {
      setResourceTeamUpdatingId(null);
    }
  }

  async function handleToggleResourceTeam(team: any) {
    setResourceTeamUpdatingId(team.id);
    try {
      const response = await apiFetch(`/api/resource-teams/${team.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: team.is_active === false }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to update resource team.');
      }

      showNotice('success', payload.team?.is_active ? 'Team enabled' : 'Team disabled', payload.team?.name);
      await fetchResourceTeams();
    } catch (error: any) {
      showNotice('error', 'Update team failed', error.message);
    } finally {
      setResourceTeamUpdatingId(null);
    }
  }

  async function handleMarkNotificationRead(notificationId: string) {
    setNotificationLoadingId(notificationId);
    try {
      const response = await apiFetch(`/api/notifications/${notificationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'READ' }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to update notification.');
      }

      showNotice('success', 'Notification updated', 'Marked as read.');
      await fetchNotifications();
    } catch (error: any) {
      showNotice('error', 'Notification update failed', error.message);
    } finally {
      setNotificationLoadingId(null);
    }
  }

  function workflowStageEditFor(stage: any) {
    return workflowStageEdits[stage.id] || {
      name: stage.name || "",
      ownerRole: stage.owner_role || "",
      slaHours: String(stage.sla_hours || 0),
      isActive: stage.is_active !== false,
    };
  }

  async function handleCreateWorkflowDraft() {
    if (!workflowGovernance?.version?.id) return;

    setWorkflowBuilderLoading('create-draft');
    try {
      const response = await apiFetch('/api/workflows/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceVersionId: workflowGovernance.version.id }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to create workflow draft.');
      }

      showNotice('success', 'Workflow draft created', `Version ${payload.version?.version_number || ''}`);
      await fetchWorkflowGovernance();
    } catch (error: any) {
      showNotice('error', 'Create draft failed', error.message);
    } finally {
      setWorkflowBuilderLoading(null);
    }
  }

  async function handleSaveWorkflowStage(stage: any) {
    const draft = workflowStageEditFor(stage);
    if (!draft.name.trim()) {
      showNotice('error', 'Stage name required', 'Please enter stage name.');
      return;
    }

    setWorkflowBuilderLoading(`stage:${stage.id}`);
    try {
      const response = await apiFetch(`/api/workflows/stages/${stage.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          ownerRole: draft.ownerRole || null,
          slaHours: Number(draft.slaHours || 0),
          isActive: draft.isActive,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to update workflow stage.');
      }

      setWorkflowStageEdits((current) => {
        const next = { ...current };
        delete next[stage.id];
        return next;
      });
      showNotice('success', 'Workflow stage saved', payload.stage?.name);
      await fetchWorkflowGovernance();
    } catch (error: any) {
      showNotice('error', 'Save stage failed', error.message);
    } finally {
      setWorkflowBuilderLoading(null);
    }
  }

  async function handlePublishWorkflowDraft() {
    const draftVersion = workflowGovernance?.draftVersion;
    if (!draftVersion?.id) return;

    setWorkflowBuilderLoading('publish-draft');
    try {
      const response = await apiFetch(`/api/workflows/versions/${draftVersion.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to publish workflow version.');
      }

      setWorkflowStageEdits({});
      showNotice('success', 'Workflow published', `Version ${payload.version?.version_number || ''} is active.`);
      await fetchWorkflowGovernance();
    } catch (error: any) {
      showNotice('error', 'Publish failed', error.message);
    } finally {
      setWorkflowBuilderLoading(null);
    }
  }

  async function handleAddWorkflowStage() {
    const draftVersion = workflowGovernance?.draftVersion;
    if (!draftVersion?.id) return;
    if (!workflowNewStageDraft.code.trim() || !workflowNewStageDraft.name.trim()) {
      showNotice('error', 'Stage code and name required');
      return;
    }

    setWorkflowBuilderLoading('add-stage');
    try {
      const response = await apiFetch(`/api/workflows/versions/${draftVersion.id}/stages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: workflowNewStageDraft.code,
          name: workflowNewStageDraft.name,
          ownerRole: workflowNewStageDraft.ownerRole || null,
          slaHours: Number(workflowNewStageDraft.slaHours || 0),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to add workflow stage.');

      setWorkflowNewStageDraft({ code: "", name: "", ownerRole: "ops", slaHours: "24" });
      showNotice('success', 'Workflow stage added', payload.stage?.name);
      await fetchWorkflowGovernance();
      if (payload.stage?.id) setSelectedWorkflowStageId(payload.stage.id);
    } catch (error: any) {
      showNotice('error', 'Add stage failed', error.message);
    } finally {
      setWorkflowBuilderLoading(null);
    }
  }

  async function handleReorderWorkflowStages(orderedStages: any[]) {
    const draftVersion = workflowGovernance?.draftVersion;
    if (!draftVersion?.id) return;

    setWorkflowBuilderLoading('reorder-stages');
    try {
      const response = await apiFetch(`/api/workflows/versions/${draftVersion.id}/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedStageIds: orderedStages.map((stage) => stage.id) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to reorder workflow stages.');

      showNotice('success', 'Workflow stages reordered', `${payload.reordered || orderedStages.length} stages`);
      await fetchWorkflowGovernance();
    } catch (error: any) {
      showNotice('error', 'Reorder failed', error.message);
    } finally {
      setWorkflowBuilderLoading(null);
    }
  }

  async function handleAddWorkflowChecklist(stage: any) {
    if (!stage?.id || !workflowChecklistDraft.code.trim() || !workflowChecklistDraft.label.trim()) {
      showNotice('error', 'Checklist code and label required');
      return;
    }

    setWorkflowBuilderLoading('add-checklist');
    try {
      const response = await apiFetch(`/api/workflows/stages/${stage.id}/checklists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: workflowChecklistDraft.code,
          label: workflowChecklistDraft.label,
          gateSeverity: workflowChecklistDraft.gateSeverity,
          isRequired: workflowChecklistDraft.isRequired,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to add checklist.');

      setWorkflowChecklistDraft({ code: "", label: "", gateSeverity: "HARD", isRequired: true });
      showNotice('success', 'Checklist added', payload.checklist?.label);
      await fetchWorkflowGovernance();
    } catch (error: any) {
      showNotice('error', 'Add checklist failed', error.message);
    } finally {
      setWorkflowBuilderLoading(null);
    }
  }

  async function handleUpdateWorkflowChecklist(item: any, updates: any) {
    setWorkflowBuilderLoading(`checklist:${item.id}`);
    try {
      const response = await apiFetch(`/api/workflows/checklists/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to update checklist.');

      showNotice('success', 'Checklist updated', payload.checklist?.label);
      await fetchWorkflowGovernance();
    } catch (error: any) {
      showNotice('error', 'Update checklist failed', error.message);
    } finally {
      setWorkflowBuilderLoading(null);
    }
  }

  async function handleAddWorkflowDocument(stage: any) {
    if (!stage?.id || !workflowDocumentDraft.code.trim() || !workflowDocumentDraft.name.trim()) {
      showNotice('error', 'Document code and name required');
      return;
    }

    setWorkflowBuilderLoading('add-document');
    try {
      const response = await apiFetch(`/api/workflows/stages/${stage.id}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: workflowDocumentDraft.code,
          name: workflowDocumentDraft.name,
          gateSeverity: workflowDocumentDraft.gateSeverity,
          isRequired: workflowDocumentDraft.isRequired,
          requiresVerification: workflowDocumentDraft.requiresVerification,
          driveFolderKey: workflowDocumentDraft.driveFolderKey || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to add document.');

      setWorkflowDocumentDraft({ code: "", name: "", gateSeverity: "HARD", isRequired: true, requiresVerification: true, driveFolderKey: "" });
      showNotice('success', 'Document requirement added', payload.document?.name);
      await fetchWorkflowGovernance();
    } catch (error: any) {
      showNotice('error', 'Add document failed', error.message);
    } finally {
      setWorkflowBuilderLoading(null);
    }
  }

  async function handleUpdateWorkflowDocument(item: any, updates: any) {
    setWorkflowBuilderLoading(`document:${item.id}`);
    try {
      const response = await apiFetch(`/api/workflows/documents/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to update document.');

      showNotice('success', 'Document requirement updated', payload.document?.name);
      await fetchWorkflowGovernance();
    } catch (error: any) {
      showNotice('error', 'Update document failed', error.message);
    } finally {
      setWorkflowBuilderLoading(null);
    }
  }

  async function handleAddWorkflowTransition(stage: any) {
    const draftVersion = workflowGovernance?.draftVersion;
    if (!draftVersion?.id || !stage?.id || !workflowTransitionDraft.toStageId) {
      showNotice('error', 'Transition target required');
      return;
    }

    setWorkflowBuilderLoading('add-transition');
    try {
      const response = await apiFetch(`/api/workflows/versions/${draftVersion.id}/transitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromStageId: stage.id,
          toStageId: workflowTransitionDraft.toStageId,
          type: workflowTransitionDraft.type,
          gateSeverity: workflowTransitionDraft.gateSeverity,
          requiresApproval: workflowTransitionDraft.requiresApproval,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to add transition.');

      setWorkflowTransitionDraft({ type: "FORWARD", toStageId: "", gateSeverity: "HARD", requiresApproval: false });
      showNotice('success', 'Transition added', payload.transition?.type);
      await fetchWorkflowGovernance();
    } catch (error: any) {
      showNotice('error', 'Add transition failed', error.message);
    } finally {
      setWorkflowBuilderLoading(null);
    }
  }

  async function handleUpdateWorkflowTransition(item: any, updates: any) {
    setWorkflowBuilderLoading(`transition:${item.id}`);
    try {
      const response = await apiFetch(`/api/workflows/transitions/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to update transition.');

      showNotice('success', 'Transition updated', payload.transition?.type);
      await fetchWorkflowGovernance();
    } catch (error: any) {
      showNotice('error', 'Update transition failed', error.message);
    } finally {
      setWorkflowBuilderLoading(null);
    }
  }

  async function fetchApprovalItems() {
    const { data, error } = await supabase
      .from('approval_requests')
      .select('id, project_id, project_stage_id, type, status, reason, decision_reason, requested_by, approver_id, created_at, decided_at, projects(customer_code, customer_name), project_stages(name, code, status, sla_status)')
      .in('status', ['PENDING', 'APPROVED', 'REJECTED'])
      .order('created_at', { ascending: false })
      .limit(40);

    if (error) {
      console.error('Error fetching approval items:', error);
      return;
    }

    setApprovalItems(data || []);
  }

  async function fetchWorkflowGovernance() {
    const [{ data: versionData, error: versionError }, { data: standardData, error: standardError }] = await Promise.all([
      supabase
        .from('workflow_versions')
        .select('id, workflow_template_id, version_number, name, status, is_active, published_at, workflow_templates(code, name, project_type, payment_type)')
        .eq('status', 'PUBLISHED')
        .eq('is_active', true)
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(1),
      supabase
        .from('installation_standards')
        .select('id, code, name, version, status, is_active, effective_from, published_at')
        .eq('status', 'PUBLISHED')
        .eq('is_active', true)
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(1),
    ]);

    if (versionError) {
      console.error('Error fetching workflow governance:', versionError);
      return;
    }
    if (standardError) console.error('Error fetching active standard:', standardError);

    const version = versionData?.[0];
    if (!version?.id) {
      setWorkflowGovernance(null);
      return;
    }

    const { data: draftData, error: draftError } = await supabase
      .from('workflow_versions')
      .select('id, workflow_template_id, version_number, name, status, is_active, published_at, workflow_templates(code, name, project_type, payment_type)')
      .eq('workflow_template_id', version.workflow_template_id)
      .eq('status', 'DRAFT')
      .order('created_at', { ascending: false })
      .limit(1);
    if (draftError) console.error('Error fetching workflow draft:', draftError);

    const draftVersion = draftData?.[0] || null;
    const builderVersion = draftVersion || version;

    const [{ data: stageData, error: stageError }, { data: checklistData, error: checklistError }, { data: documentData, error: documentError }, { data: transitionData, error: transitionError }] = await Promise.all([
      supabase
        .from('workflow_stages')
        .select('id, code, name, order_index, owner_role, sla_hours, is_start, is_terminal, is_active')
        .eq('workflow_version_id', builderVersion.id)
        .order('order_index', { ascending: true }),
      supabase
        .from('workflow_checklists')
        .select('id, workflow_stage_id, code, label, gate_severity, is_required')
        .order('order_index', { ascending: true }),
      supabase
        .from('workflow_required_documents')
        .select('id, workflow_stage_id, code, name, gate_severity, is_required, requires_verification')
        .order('order_index', { ascending: true }),
      supabase
        .from('workflow_transitions')
        .select('id, workflow_version_id, from_stage_id, to_stage_id, type, name, requires_approval, gate_severity, is_active')
        .eq('workflow_version_id', builderVersion.id),
    ]);

    if (stageError) {
      console.error('Error fetching workflow stages:', stageError);
      return;
    }
    if (checklistError) console.error('Error fetching workflow checklists:', checklistError);
    if (documentError) console.error('Error fetching workflow documents:', documentError);
    if (transitionError) console.error('Error fetching workflow transitions:', transitionError);

    const stageIds = new Set((stageData || []).map((stage: any) => stage.id));
    const checklistsByStage = (checklistData || [])
      .filter((item: any) => stageIds.has(item.workflow_stage_id))
      .reduce((acc: any, item: any) => {
        acc[item.workflow_stage_id] = [...(acc[item.workflow_stage_id] || []), item];
        return acc;
      }, {});
    const documentsByStage = (documentData || [])
      .filter((item: any) => stageIds.has(item.workflow_stage_id))
      .reduce((acc: any, item: any) => {
        acc[item.workflow_stage_id] = [...(acc[item.workflow_stage_id] || []), item];
        return acc;
      }, {});
    const transitionsByStage = (transitionData || [])
      .filter((item: any) => !item.from_stage_id || stageIds.has(item.from_stage_id))
      .reduce((acc: any, item: any) => {
        const key = item.from_stage_id || '__START__';
        acc[key] = [...(acc[key] || []), item];
        return acc;
      }, {});

    const stages = (stageData || []).map((stage: any) => ({
      ...stage,
      checklists: checklistsByStage[stage.id] || [],
      documents: documentsByStage[stage.id] || [],
      transitions: transitionsByStage[stage.id] || [],
    }));

    setWorkflowGovernance({
      version,
      draftVersion,
      builderVersion,
      standard: standardData?.[0] || null,
      stages,
    });
    setSelectedWorkflowStageId((current) => current && stages.some((stage: any) => stage.id === current) ? current : stages[0]?.id || null);
  }

  async function fetchQaItems() {
    const { data: stageData, error: stageError } = await supabase
      .from('project_stages')
      .select('id, project_id, name, code, order_index, status, sla_status, started_at, due_at, completed_at, metadata, owner_role, workflow_stages(sla_hours), projects(id, customer_code, customer_name, google_drive_folder_id)')
      .eq('code', 'QA')
      .neq('status', 'COMPLETED')
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(50);

    if (stageError) {
      console.error('Error fetching QA items:', stageError);
      return;
    }

    const stageIds = (stageData || []).map((stage: any) => stage.id);
    if (!stageIds.length) {
      setQaItems([]);
      return;
    }

    const [{ data: checklistData, error: checklistError }, { data: documentData, error: documentError }] = await Promise.all([
      supabase
        .from('project_checklists')
        .select('id, project_id, project_stage_id, code, label, status, gate_severity')
        .in('project_stage_id', stageIds),
      supabase
        .from('project_documents')
        .select('id, project_id, project_stage_id, code, name, is_required, status, gate_severity, requires_verification, version_number, supersedes_document_id, rejection_reason, web_view_link, google_drive_file_id, google_drive_folder_id, file_name, mime_type, uploaded_at, verified_at')
        .in('project_stage_id', stageIds),
    ]);

    if (checklistError) console.error('Error fetching QA checklists:', checklistError);
    if (documentError) console.error('Error fetching QA documents:', documentError);

    const checklistsByStage = (checklistData || []).reduce((acc: any, item: any) => {
      acc[item.project_stage_id] = [...(acc[item.project_stage_id] || []), item];
      return acc;
    }, {});
    const documentsByStage = sortProjectDocuments(documentData || []).reduce((acc: any, item: any) => {
      acc[item.project_stage_id] = [...(acc[item.project_stage_id] || []), item];
      return acc;
    }, {});

    setQaItems((stageData || []).map((stage: any) => ({
      ...stage,
      checklists: checklistsByStage[stage.id] || [],
      documents: documentsByStage[stage.id] || [],
      actual_completed_at: stage.completed_at,
      workflow_definitions: {
        step_name: stage.name,
        order_index: stage.order_index,
        sla_hours: stage.workflow_stages?.sla_hours || 0,
      },
    })));
  }

  async function fetchBillingItems() {
    const { data: stageData, error: stageError } = await supabase
      .from('project_stages')
      .select('id, project_id, name, code, order_index, status, sla_status, started_at, due_at, completed_at, metadata, owner_role, workflow_stages(sla_hours), projects(id, customer_code, customer_name, google_drive_folder_id)')
      .eq('code', 'BILLING')
      .neq('status', 'COMPLETED')
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(50);

    if (stageError) {
      console.error('Error fetching billing items:', stageError);
      return;
    }

    const stageIds = (stageData || []).map((stage: any) => stage.id);
    if (!stageIds.length) {
      setBillingItems([]);
      return;
    }

    const { data: documentData, error: documentError } = await supabase
      .from('project_documents')
      .select('id, project_id, project_stage_id, code, name, is_required, status, gate_severity, requires_verification, version_number, supersedes_document_id, rejection_reason, web_view_link, google_drive_file_id, google_drive_folder_id, file_name, mime_type, uploaded_at, verified_at')
      .in('project_stage_id', stageIds);

    if (documentError) {
      console.error('Error fetching billing documents:', documentError);
      return;
    }

    const documentsByStage = sortProjectDocuments(documentData || []).reduce((acc: any, item: any) => {
      acc[item.project_stage_id] = [...(acc[item.project_stage_id] || []), item];
      return acc;
    }, {});

    setBillingItems((stageData || []).map((stage: any) => ({
      ...stage,
      documents: documentsByStage[stage.id] || [],
      actual_completed_at: stage.completed_at,
      workflow_definitions: {
        step_name: stage.name,
        order_index: stage.order_index,
        sla_hours: stage.workflow_stages?.sla_hours || 0,
      },
    })));
  }

  async function fetchFieldJobs() {
    const { data: stageData, error: stageError } = await supabase
      .from('project_stages')
      .select('id, project_id, name, code, order_index, status, sla_status, started_at, due_at, completed_at, metadata, owner_role, workflow_stages(sla_hours), projects(id, customer_code, customer_name, google_drive_folder_id)')
      .in('status', ['IN_PROGRESS', 'BLOCKED'])
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(20);

    if (stageError) {
      console.error('Error fetching field jobs:', stageError);
      return;
    }

    const stageIds = (stageData || []).map((stage: any) => stage.id);
    if (!stageIds.length) {
      setFieldJobs([]);
      return;
    }

    const [{ data: checklistData, error: checklistError }, { data: documentData, error: documentError }] = await Promise.all([
      supabase
        .from('project_checklists')
        .select('id, project_stage_id, code, label, status, gate_severity, notes, completed_at, metadata')
        .in('project_stage_id', stageIds),
      supabase
        .from('project_documents')
        .select('id, project_id, project_stage_id, code, name, is_required, status, gate_severity, requires_verification, version_number, supersedes_document_id, rejection_reason, web_view_link, google_drive_file_id, google_drive_folder_id, file_name, mime_type, uploaded_at, verified_at')
        .in('project_stage_id', stageIds),
    ]);

    if (checklistError) {
      console.error('Error fetching field checklists:', checklistError);
      return;
    }

    if (documentError) {
      console.error('Error fetching field documents:', documentError);
      return;
    }

    const checklistsByStage = (checklistData || []).reduce((acc: any, item: any) => {
      acc[item.project_stage_id] = [...(acc[item.project_stage_id] || []), item];
      return acc;
    }, {});
    const documentsByStage = sortProjectDocuments(documentData || []).reduce((acc: any, item: any) => {
      acc[item.project_stage_id] = [...(acc[item.project_stage_id] || []), item];
      return acc;
    }, {});

    setFieldJobs((stageData || []).map((stage: any) => ({
      ...stage,
      checklists: checklistsByStage[stage.id] || [],
      documents: documentsByStage[stage.id] || [],
      actual_completed_at: stage.completed_at,
      deadline: stage.due_at ? new Date(stage.due_at) : null,
      workflow_definitions: {
        step_name: stage.name,
        order_index: stage.order_index,
        sla_hours: stage.workflow_stages?.sla_hours || 0,
      },
    })));
  }

  async function fetchSchedulingItems() {
    const { data: stageData, error: stageError } = await supabase
      .from('project_stages')
      .select('id, project_id, name, code, order_index, status, sla_status, started_at, due_at, completed_at, metadata, owner_role, workflow_stages(sla_hours), projects!project_stages_project_id_fkey(id, customer_code, customer_name, customer_phone, google_drive_folder_id, customer_intake)')
      .eq('code', 'SCHEDULING')
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(80);

    if (stageError) {
      console.error('Error fetching scheduling items:', stageError);
      return;
    }

    const scheduledProjectIds = (stageData || [])
      .filter((stage: any) => stage.metadata?.scheduled_at)
      .map((stage: any) => stage.project_id);
    let completedInstallationProjectIds = new Set<string>();

    if (scheduledProjectIds.length) {
      const { data: installationData, error: installationError } = await supabase
        .from('project_stages')
        .select('project_id, status')
        .eq('code', 'INSTALLATION')
        .eq('status', 'COMPLETED')
        .in('project_id', scheduledProjectIds);

      if (installationError) {
        console.error('Error fetching installation completion for schedule:', installationError);
      } else {
        completedInstallationProjectIds = new Set((installationData || []).map((stage: any) => stage.project_id));
      }
    }

    setSchedulingItems((stageData || []).filter((stage: any) =>
      stage.status !== 'COMPLETED' || (stage.metadata?.scheduled_at && !completedInstallationProjectIds.has(stage.project_id)),
    ).map((stage: any) => ({
      ...stage,
      actual_completed_at: stage.completed_at,
      deadline: stage.due_at ? new Date(stage.due_at) : null,
      workflow_definitions: {
        step_name: stage.name,
        order_index: stage.order_index,
        sla_hours: stage.workflow_stages?.sla_hours || 0,
      },
    })));
  }

  async function fetchProjects() {
    await withNetworkActivity("Loading dashboard and projects", async () => {
      const [
        { data, error },
        { data: exceptionData, error: exceptionError },
        { data: approvalData, error: approvalError },
        { data: riskyStageData, error: riskyStageError },
        { data: documentRiskData, error: documentRiskError },
      ] = await Promise.all([
        supabase
          .from("projects")
          .select("*, current_stage:project_stages!projects_current_stage_id_fkey(id, name, code, order_index, status, sla_status, started_at, due_at, owner_role)")
          .order("created_at", { ascending: false }),
        supabase
          .from("project_exceptions")
          .select("id, project_id, project_stage_id, category, severity, status, title, description, owner_role, detected_at, resolved_at, projects(customer_code, customer_name), project_stages(name, code, status, sla_status)")
          .in("status", ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS"])
          .order("detected_at", { ascending: false })
          .limit(12),
        supabase
          .from("approval_requests")
          .select("id, project_id, project_stage_id, type, status, reason, created_at, projects(customer_code, customer_name), project_stages(name, code)")
          .eq("status", "PENDING")
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("project_stages")
          .select("id, project_id, name, code, status, sla_status, due_at, owner_role, projects(customer_code, customer_name)")
          .in("status", ["IN_PROGRESS", "BLOCKED"])
          .in("sla_status", ["NEAR_SLA", "OVER_SLA"])
          .order("due_at", { ascending: true })
          .limit(12),
        supabase
          .from("project_documents")
          .select("id, project_id, project_stage_id, code, name, is_required, status, gate_severity, requires_verification, version_number, google_drive_file_id, google_drive_folder_id, web_view_link, uploaded_at, verified_at, projects(customer_code, customer_name), project_stages(name, code)")
          .in("status", ["PENDING_VERIFY", "UPLOADED", "REJECTED"])
          .neq("status", "SUPERSEDED")
          .order("uploaded_at", { ascending: true, nullsFirst: false })
          .limit(12),
      ]);

      if (data) setProjects(data);
      if (exceptionData) setExceptions(exceptionData);
      if (approvalData) setPendingApprovals(approvalData);
      if (riskyStageData) setRiskyStages(riskyStageData);
      if (documentRiskData) setDocumentRisks(documentRiskData);
      if (error) console.error("Error fetching projects:", error);
      if (exceptionError) console.error("Error fetching exceptions:", exceptionError);
      if (approvalError) console.error("Error fetching approvals:", approvalError);
      if (riskyStageError) console.error("Error fetching risky stages:", riskyStageError);
      if (documentRiskError) console.error("Error fetching document risks:", documentRiskError);
      setLoading(false);
    });
  }

  async function handleSelectProject(project: any) {
    setSelectedProject(project);
    setActiveTab('projects');
    setMilestones([]);
    setShowProjectStageSequence(false);
    setLoadingMilestones(true);

    await withNetworkActivity("Loading project workflow", async () => {
    const { data } = await supabase
      .from('project_stages')
      .select(`id, name, code, order_index, status, sla_status, started_at, due_at, completed_at, metadata, owner_role, workflow_stages (sla_hours)`)
      .eq('project_id', project.id)
      .order('order_index', { ascending: true });

    if (data) {
      const stageIds = (data as any[]).map((stage: any) => stage.id);
      if (stageIds.length === 0) {
        setMilestones([]);
        setLoadingMilestones(false);
        return;
      }
      const [{ data: checklistData }, { data: documentData }, { data: approvalData }, { data: exceptionData }, { data: activityData }] = await Promise.all([
        supabase
          .from('project_checklists')
          .select('id, project_stage_id, code, label, status, gate_severity, is_required, notes, completed_at, metadata')
          .in('project_stage_id', stageIds),
        supabase
          .from('project_documents')
          .select('id, project_stage_id, code, name, is_required, status, gate_severity, requires_verification, version_number, supersedes_document_id, rejection_reason, web_view_link, google_drive_file_id, google_drive_folder_id, file_name, mime_type, uploaded_at, verified_at')
          .in('project_stage_id', stageIds),
        supabase
          .from('approval_requests')
          .select('id, project_stage_id, type, status, reason, decision_reason, created_at, decided_at')
          .eq('project_id', project.id)
          .in('project_stage_id', stageIds),
        supabase
          .from('project_exceptions')
          .select('id, project_stage_id, category, severity, status, title, description, owner_role, detected_at')
          .eq('project_id', project.id)
          .in('project_stage_id', stageIds)
          .in('status', ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS']),
        supabase
          .from('activity_logs')
          .select('id, project_stage_id, actor_id, action, reason, before_state, after_state, related_entity_type, related_entity_id, metadata, created_at')
          .eq('project_id', project.id)
          .in('project_stage_id', stageIds)
          .order('created_at', { ascending: false })
          .limit(80),
      ]);
      const checklistsByStage = (checklistData || []).reduce((acc: any, item: any) => {
        acc[item.project_stage_id] = [...(acc[item.project_stage_id] || []), item];
        return acc;
      }, {});
      const documentsByStage = sortProjectDocuments(documentData || []).reduce((acc: any, item: any) => {
        acc[item.project_stage_id] = [...(acc[item.project_stage_id] || []), item];
        return acc;
      }, {});
      const approvalsByStage = (approvalData || []).reduce((acc: any, item: any) => {
        acc[item.project_stage_id] = [...(acc[item.project_stage_id] || []), item];
        return acc;
      }, {});
      const exceptionsByStage = (exceptionData || []).reduce((acc: any, item: any) => {
        acc[item.project_stage_id] = [...(acc[item.project_stage_id] || []), item];
        return acc;
      }, {});
      const activityActorIds = uniqueIds((activityData || []).map((item: any) => item.actor_id));
      const { data: activityActorData } = activityActorIds.length
        ? await supabase
            .from('profiles')
            .select('id, email, full_name, role')
            .in('id', activityActorIds)
        : { data: [] };
      const activityActorsById = new Map((activityActorData || []).map((profile: any) => [profile.id, profile]));
      const activitiesByStage = (activityData || []).reduce((acc: any, item: any) => {
        const stageChecklists = checklistsByStage[item.project_stage_id] || [];
        const relatedChecklist = String(item.related_entity_type || "").includes("checklist")
          ? stageChecklists.find((checklist: any) => checklist.id === item.related_entity_id) || null
          : null;
        const activityWithActor = {
          ...item,
          actor: item.actor_id ? activityActorsById.get(item.actor_id) || null : null,
          relatedChecklist,
        };
        acc[item.project_stage_id] = [...(acc[item.project_stage_id] || []), activityWithActor];
        return acc;
      }, {});

      const milestonesWithSLA = (data as any[])
        .filter((m: any) => m.status !== 'SKIPPED')
        .map((m: any) => {
        const deadline = m.due_at ? new Date(m.due_at) : null;
        let dynamicStatus = 'Waiting';

        if (m.completed_at || m.status === 'COMPLETED') dynamicStatus = 'Completed';
        if (m.status === 'IN_PROGRESS') dynamicStatus = m.sla_status === 'OVER_SLA' || (deadline && new Date() > deadline) ? 'Overdue' : m.sla_status === 'NEAR_SLA' ? 'Near SLA' : 'In Progress';
        if (m.status === 'BLOCKED') dynamicStatus = 'Blocked';
        
        return {
          ...m,
          actual_completed_at: m.completed_at,
          evidence_files: m.metadata?.evidence_files || [],
          checklists: checklistsByStage[m.id] || [],
          documents: documentsByStage[m.id] || [],
          approvals: approvalsByStage[m.id] || [],
          exceptions: exceptionsByStage[m.id] || [],
          activities: activitiesByStage[m.id] || [],
          dynamicStatus,
          deadline,
          workflow_definitions: {
            step_name: m.name,
            order_index: m.order_index,
            sla_hours: m.workflow_stages?.sla_hours || 0,
          },
        };
      });

      setMilestones(milestonesWithSLA);
    }
    });
    setLoadingMilestones(false);
  }

  async function handleDeleteProject(project: any) {
    if (!project?.id || !canDeleteProjects || deletingProjectId) return;

    const label = `${project.customer_code || "-"} / ${project.customer_name || "-"}`;
    const confirmed = window.confirm(`Delete project ${label} and its Google Drive folder? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingProjectId(project.id);
    try {
      const response = await apiFetch(`/api/projects/${project.id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Delete project failed.");

      if (selectedProject?.id === project.id) {
        setSelectedProject(null);
        setMilestones([]);
        setSelectedStageId(null);
      }

      await fetchProjects();
      showNotice("success", "Project deleted", label);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unable to delete project.";
      showNotice("error", "Delete project failed", message);
    } finally {
      setDeletingProjectId(null);
    }
  }

  async function handleCompleteMilestone(milestoneId: string) {
    setCompletingStageId(milestoneId);

    try {
      const res = await apiFetch(`/api/projects/${selectedProject.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectStageId: milestoneId, type: 'FORWARD' }),
      });
      const result = await res.json();

      if (!res.ok) {
        if (result.violations?.length) {
          const stage = milestones.find((item) => item.id === milestoneId);
          setGateBlockModal({
            stageId: milestoneId,
            title: stage ? `${stageDisplay(stage).title} ` : 'Stage blocked',
            message: result.error || 'Required gates are incomplete.',
            violations: result.violations,
          });
          if (stage) setSelectedStageId(stage.id);
          return;
        }

        throw new Error(result.error || 'Transition failed.');
      }

      fetchProjects();
      if (selectedProject) {
        handleSelectProject({ ...selectedProject, status: result.projectStatus, current_stage_id: result.nextStageId });
      }
      setCompleteStageModal(null);
      setChecklistReviewModal(null);
      setSelectedStageId(null);
      showNotice('success', 'Stage completed');
    } catch (error: any) {
      showNotice('error', 'Transition failed', error.message);
    } finally {
      setCompletingStageId(null);
    }
  }

  async function handleGenerateRuntime() {
    if (!selectedProject) return;
    setGeneratingRuntime(true);

    try {
      const res = await apiFetch(`/api/projects/${selectedProject.id}/runtime`, {
        method: 'POST',
      });
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Runtime generation failed.');
      }

      const nextProject = {
        ...selectedProject,
        workflow_version_id: result.workflowVersionId,
        applied_standard_id: result.appliedStandardId,
        current_stage_id: result.currentStageId,
        status: 'IN_PROGRESS',
      };

      setSelectedProject(nextProject);
      fetchProjects();
      handleSelectProject(nextProject);
      showNotice('success', 'Runtime workflow generated', 'Project stages, gates, and documents are ready.');
    } catch (error: any) {
      showNotice('error', 'Runtime generation failed', error.message);
    } finally {
      setGeneratingRuntime(false);
    }
  }

  async function handlePassChecklist(checklistId: string, closeAfterPass = true) {
    setChecklistLoadingId(checklistId);
    try {
      const res = await apiFetch(`/api/project-checklists/${checklistId}/pass`, {
        method: 'POST',
      });
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Checklist update failed.');
      }

      if (selectedProject) handleSelectProject(selectedProject);
      fetchFieldJobs();
      if (closeAfterPass) {
        setChecklistReviewModal(null);
        setSelectedStageId(null);
      }
      showNotice('success', result.alreadyPassed ? 'Checklist already passed' : 'Checklist passed');
      return true;
    } catch (error: any) {
      showNotice('error', 'Checklist update failed', error.message);
      return false;
    } finally {
      setChecklistLoadingId(null);
    }
  }

  async function handleUpdateChecklist(checklistId: string, payload: { status: string; notes: string }) {
    setChecklistLoadingId(`checklist:${checklistId}`);
    try {
      const res = await apiFetch(`/api/project-checklists/${checklistId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Checklist update failed.');
      }

      if (selectedProject) handleSelectProject(selectedProject);
      fetchFieldJobs();
      showNotice('success', 'Checklist saved');
    } catch (error: any) {
      showNotice('error', 'Checklist update failed', error.message);
    } finally {
      setChecklistLoadingId(null);
    }
  }

  async function handleFailChecklist(checklistId: string, notes?: string | null) {
    await handleUpdateChecklist(checklistId, {
      status: "FAILED",
      notes: notes || "ตรวจแล้วไม่ผ่าน",
    });
  }

  async function handleUpdateCustomerIntake(payload: any) {
    if (!selectedProject?.id) return false;
    setChecklistLoadingId("customer-intake");
    try {
      const res = await apiFetch(`/api/projects/${selectedProject.id}/customer-intake`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Customer intake update failed.");
      }

      const nextProject = result.project || { ...selectedProject, customer_intake: payload };
      setSelectedProject(nextProject);
      setProjects((current) => current.map((project) => (project.id === nextProject.id ? { ...project, ...nextProject } : project)));
      handleSelectProject(nextProject);
      showNotice("success", "Customer intake saved", "Audit log was recorded.");
      return true;
    } catch (error: any) {
      showNotice("error", "Customer intake update failed", error.message);
      return false;
    } finally {
      setChecklistLoadingId(null);
    }
  }

  async function handleFieldCheckIn(job: any) {
    setCheckingInStageId(job.id);

    try {
      const res = await apiFetch(`/api/project-stages/${job.id}/check-in`, {
        method: 'POST',
      });
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Check-in failed.');
      }

      fetchFieldJobs();
      if (selectedProject?.id === job.project_id) handleSelectProject(selectedProject);
      showNotice('success', 'Checked in', formatDateTime(result.checkedInAt));
    } catch (error: any) {
      showNotice('error', 'Check-in failed', error.message);
    } finally {
      setCheckingInStageId(null);
    }
  }

  async function handleCompleteFieldJob(job: any) {
    const project = relatedProject(job);
    if (!project?.id) {
      showNotice('error', 'Submit failed', 'Project not found for this field job.');
      return;
    }

    setCompletingStageId(job.id);

    try {
      const res = await apiFetch(`/api/projects/${project.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectStageId: job.id, type: 'FORWARD' }),
      });
      const result = await res.json();

      if (!res.ok) {
        if (result.violations?.length) {
          setGateBlockModal({
            stageId: job.id,
            title: '',
            message: result.error || 'Hard gate validation failed.',
            violations: result.violations,
          });
        }
        throw new Error(result.error || 'Stage submit failed.');
      }

      showNotice('success', '', result.projectStatus);
      fetchFieldJobs();
      fetchProjects();
      if (selectedProject?.id === project.id) handleSelectProject(selectedProject);
    } catch (error: any) {
      showNotice('error', 'Submit failed', error.message);
    } finally {
      setCompletingStageId(null);
    }
  }

  async function handleVerifyDocument(documentId: string) {
    try {
      const res = await apiFetch(`/api/documents/${documentId}/verify`, {
        method: 'POST',
      });
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Document verify failed.');
      }

      if (selectedProject) handleSelectProject(selectedProject);
      fetchBillingItems();
      fetchFieldJobs();
      fetchQaItems();
      setChecklistReviewModal(null);
      setSelectedStageId(null);
      showNotice('success', 'Document verified');
      return true;
    } catch (error: any) {
      showNotice('error', 'Document verify failed', error.message);
      return false;
    }
  }

  async function handleRejectDocument() {
    if (!rejectModal?.document || !rejectModal.reason.trim()) return;

    setRejectingDocumentId(rejectModal.document.id);

    try {
      const res = await apiFetch(`/api/documents/${rejectModal.document.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectModal.reason.trim() }),
      });
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Document reject failed.');
      }

      setRejectModal(null);
      if (selectedProject) handleSelectProject(selectedProject);
      fetchBillingItems();
      fetchFieldJobs();
      fetchQaItems();
      showNotice('success', 'Document rejected', rejectModal.document.name);
    } catch (error: any) {
      showNotice('error', 'Document reject failed', error.message);
    } finally {
      setRejectingDocumentId(null);
    }
  }

  async function handleCreateDocumentVersion(documentId: string) {
    setVersioningDocumentId(documentId);

    try {
      const res = await apiFetch(`/api/documents/${documentId}/version`, {
        method: 'POST',
      });
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Document version failed.');
      }

      if (selectedProject) handleSelectProject(selectedProject);
      fetchBillingItems();
      fetchFieldJobs();
      fetchQaItems();
      showNotice('success', 'New document version created');
    } catch (error: any) {
      showNotice('error', 'Document version failed', error.message);
    } finally {
      setVersioningDocumentId(null);
    }
  }

  async function submitStageAction(
    type: 'QA' | 'BILLING',
    action: string,
    reason = '',
  ) {
    if (!selectedProject || !selectedStage) return;

    const loadingKey = `${type}:${action}`;
    setStageActionLoading(loadingKey);

    try {
      const endpoint = type === 'QA'
        ? `/api/projects/${selectedProject.id}/qa`
        : `/api/projects/${selectedProject.id}/billing`;
      const payload = type === 'QA'
        ? { projectStageId: selectedStage.id, outcome: action, reason }
        : { projectStageId: selectedStage.id, decision: action, reason };

      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || `${type} action failed.`);
      }

      setStageActionModal(null);
      fetchProjects();
      handleSelectProject(selectedProject);
      fetchQaItems();
      fetchBillingItems();
      fetchFieldJobs();
      setStageActionModal(null);
      setSelectedStageId(null);
      showNotice('success', `${type} action submitted`, action);
    } catch (error: any) {
      showNotice('error', `${type} action failed`, error.message);
    } finally {
      setStageActionLoading(null);
    }
  }

  function openStageActionModal(type: 'QA' | 'BILLING', action: string, title: string) {
    setStageActionModal({ type, action, title, reason: '' });
  }

  async function submitLoanFallbackAction() {
    if (!selectedProject || !loanFallbackModal) return;

    const loadingKey = `LOAN:${loanFallbackModal.action}`;
    setStageActionLoading(loadingKey);

    try {
      const res = await apiFetch(`/api/projects/${selectedProject.id}/loan-fallback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectStageId: loanFallbackModal.stage.id,
          action: loanFallbackModal.action,
          reason: loanFallbackModal.reason.trim(),
          evidence: [],
        }),
      });
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Loan fallback action failed.');
      }

      setLoanFallbackModal(null);
      fetchProjects();
      fetchNotifications();
      handleSelectProject(selectedProject);
      showNotice('success', 'Loan fallback updated', result.paymentType || result.projectStatus);
    } catch (error: any) {
      showNotice('error', 'Loan fallback failed', error.message);
    } finally {
      setStageActionLoading(null);
    }
  }

  async function submitFinancePathAction() {
    if (!selectedProject || !financePathModal) return;

    const loadingKey = `FINANCE:${financePathModal.action}`;
    setStageActionLoading(loadingKey);

    try {
      const res = await apiFetch(`/api/projects/${selectedProject.id}/finance-path`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectStageId: financePathModal.stage.id,
          action: financePathModal.action,
          reason: financePathModal.reason.trim(),
        }),
      });
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Finance path change failed.');
      }

      const nextProject = {
        ...selectedProject,
        payment_type: result.paymentType,
        finance_state: result.financeState,
        current_stage_id: result.nextStageId,
      };
      setFinancePathModal(null);
      setSelectedProject(nextProject);
      fetchProjects();
      fetchFieldJobs();
      fetchBillingItems();
      await handleSelectProject(nextProject);
      showNotice('success', 'Finance path updated', result.paymentType === 'LOAN' ? 'สินเชื่อ' : 'เงินสด');
    } catch (error: any) {
      showNotice('error', 'Finance path change failed', error.message);
    } finally {
      setStageActionLoading(null);
    }
  }

  async function submitQaConsoleAction(project: any, stage: any, outcome: string, reason = '') {
    if (!project || !stage) return;

    const loadingKey = `QA:${outcome}:${stage.id}`;
    setStageActionLoading(loadingKey);

    try {
      const res = await apiFetch(`/api/projects/${project.id}/qa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectStageId: stage.id, outcome, reason }),
      });
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'QA action failed.');
      }

      fetchProjects();
      fetchQaItems();
      fetchFieldJobs();
      showNotice('success', 'QA action submitted', outcome);
    } catch (error: any) {
      showNotice('error', 'QA action failed', error.message);
    } finally {
      setStageActionLoading(null);
    }
  }

  async function handleRequestOverride() {
    if (!selectedProject || !overrideModal?.stage || !overrideModal.reason.trim()) return;

    const stageId = overrideModal.stage.id;
    setApprovalLoading(`request:${stageId}`);

    try {
      const res = await apiFetch(`/api/projects/${selectedProject.id}/approvals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectStageId: stageId,
          reason: overrideModal.reason.trim(),
          evidence: [],
        }),
      });
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Override request failed.');
      }

      setOverrideModal(null);
      handleSelectProject(selectedProject);
      fetchProjects();
      fetchApprovalItems();
      showNotice('success', 'Override requested');
    } catch (error: any) {
      showNotice('error', 'Override request failed', error.message);
    } finally {
      setApprovalLoading(null);
    }
  }

  async function handleApprovalDecision(approvalId: string, decision: 'APPROVED' | 'REJECTED') {
    setApprovalLoading(`${decision}:${approvalId}`);

    try {
      const res = await apiFetch(`/api/approvals/${approvalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Approval decision failed.');
      }

      fetchProjects();
      fetchApprovalItems();
      if (selectedProject) {
        handleSelectProject(selectedProject);
      }
      showNotice('success', `Approval ${decision.toLowerCase()}`);
    } catch (error: any) {
      showNotice('error', 'Approval decision failed', error.message);
    } finally {
      setApprovalLoading(null);
    }
  }

  async function handleRefreshSla() {
    if (!selectedProject) return;
    setRefreshingSla(true);

    try {
      const res = await apiFetch(`/api/projects/${selectedProject.id}/sla`, {
        method: 'POST',
      });
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'SLA refresh failed.');
      }

      const nextProject = { ...selectedProject, sla_status: result.projectSlaStatus };
      setSelectedProject(nextProject);
      fetchProjects();
      handleSelectProject(nextProject);
      showNotice('success', 'SLA refreshed', result.projectSlaStatus);
    } catch (error: any) {
      showNotice('error', 'SLA refresh failed', error.message);
    } finally {
      setRefreshingSla(false);
    }
  }

  async function handleExceptionAction(exceptionId: string, status: string) {
    try {
      const res = await apiFetch(`/api/exceptions/${exceptionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Exception update failed.');
      }

      setSelectedException((current: any) => current?.id === exceptionId ? { ...current, status } : current);
      fetchProjects();
      if (selectedProject) handleSelectProject(selectedProject);
      showNotice('success', 'Exception updated', status);
    } catch (error: any) {
      showNotice('error', 'Exception update failed', error.message);
    }
  }

  async function openExceptionProject(exception: any) {
    const matchedProject = projects.find((item) => item.id === exception.project_id);
    if (!matchedProject) {
      showNotice('error', 'Project not found', 'Refresh projects and try opening the exception again.');
      return;
    }

    setSelectedException(null);
    await handleSelectProject(matchedProject);
    if (exception.project_stage_id) setSelectedStageId(exception.project_stage_id);
  }

  async function handleSetupDriveFolder(projectOverride?: any) {
    const projectForDrive = projectOverride || selectedProject;
    if (!projectForDrive) return null;

    if (projectForDrive.google_drive_folder_id) {
      return projectForDrive.google_drive_folder_id;
    }

    setCreatingDriveFolder(true);

    try {
      const res = await apiFetch('/api/drive/setup-folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
          customerCode: projectForDrive.customer_code,
          projectId: projectForDrive.id,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Drive folder setup failed.');
      }

      const nextProject = {
        ...projectForDrive,
        google_drive_folder_id: data.rootFolderId,
        drive_metadata: data.driveMetadata,
      };

      if (!projectOverride || selectedProject?.id === projectForDrive.id) setSelectedProject(nextProject);
      fetchProjects();
      fetchFieldJobs();
      fetchBillingItems();
      fetchQaItems();
      fetchWorkflowGovernance();
      if (!projectOverride || selectedProject?.id === projectForDrive.id) handleSelectProject(nextProject);

      return data.rootFolderId;
    } catch (error: any) {
      showNotice('error', 'Drive folder setup failed', error.message);
      return null;
    } finally {
      setCreatingDriveFolder(false);
    }
  }

  async function refreshUploadRetryQueue() {
    try {
      const items = await listUploadRetryItems();
      setUploadRetryItems(items.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    } catch (error) {
      console.error('Error loading upload retry queue:', error);
    }
  }

  async function processUploadRetry(item: UploadRetryItem) {
    setProcessingUploadRetryId(item.id);
    try {
      const formData = new FormData();
      formData.append('file', item.file);
      formData.append('folderId', item.payload.folderId);
      formData.append('milestoneName', item.payload.milestoneName || 'Evidence');
      if (item.payload.projectStageId) {
        formData.append('projectStageId', item.payload.projectStageId);
      }
      if (item.payload.projectDocumentId) {
        formData.append('projectDocumentId', item.payload.projectDocumentId);
      }

      const res = await apiFetch('/api/drive/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload retry failed.');

      await removeUploadRetryItem(item.id);
      await refreshUploadRetryQueue();
      if (selectedProject) handleSelectProject(selectedProject);
      fetchFieldJobs();
      fetchBillingItems();
      fetchQaItems();
      showNotice('success', 'Queued upload completed', item.fileName);
    } catch (error: any) {
      await updateUploadRetryItem({
        ...item,
        attempts: item.attempts + 1,
        lastError: error.message || 'Retry failed.',
      });
      await refreshUploadRetryQueue();
      showNotice('error', 'Retry failed', error.message);
    } finally {
      setProcessingUploadRetryId(null);
    }
  }

  async function handleFileUpload(
    milestone: any,
    e: React.ChangeEvent<HTMLInputElement>,
    targetDocumentId?: string,
    projectOverride?: any,
  ) {
    const file = e.target.files?.[0];
    if (!file) return false;

    const projectForUpload = projectOverride || selectedProject;
    const rootFolderId = projectForUpload?.google_drive_folder_id || await handleSetupDriveFolder(projectForUpload);

    if (!rootFolderId) {
      return false;
    }

    setUploadingMilestoneId(milestone.id);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folderId', rootFolderId);
      formData.append('milestoneName', milestone.workflow_definitions?.step_name || 'Evidence');
      formData.append('projectStageId', milestone.id);
      const targetDocument = targetDocumentId
        ? milestone.documents?.find((document: any) => document.id === targetDocumentId)
        : sortProjectDocuments(milestone.documents || []).find((document: any) => canUploadDocument(document));
      if (targetDocument?.id) {
        formData.append('projectDocumentId', targetDocument.id);
      }

      const res = await apiFetch('/api/drive/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (selectedProject) {
        handleSelectProject(selectedProject);
      }
      fetchFieldJobs();
      fetchBillingItems();
      fetchQaItems();

      setChecklistReviewModal(null);
      setSelectedStageId(null);
      showNotice('success', 'File uploaded', file.name);
      return true;
      
    } catch (error: any) {
      if (rootFolderId) {
        const targetDocument = targetDocumentId
          ? milestone.documents?.find((document: any) => document.id === targetDocumentId)
          : sortProjectDocuments(milestone.documents || []).find((document: any) => canUploadDocument(document));
        await enqueueUploadRetryItem({
          file,
          lastError: error.message || 'Upload failed.',
          payload: {
            folderId: rootFolderId,
            milestoneName: milestone.workflow_definitions?.step_name || 'Evidence',
            projectId: projectForUpload?.id,
            projectStageId: milestone.id,
            projectDocumentId: targetDocument?.id,
          },
        });
        await refreshUploadRetryQueue();
      }
      showNotice('error', 'Upload failed', error.message);
      return false;
    } finally {
      setUploadingMilestoneId(null);
      e.target.value = '';
    }
  }

  const activeProjects = projects.filter((project) => project.status !== 'COMPLETED');
  const completedProjects = projects.filter((project) => project.status === 'COMPLETED');
  const normalizedProjectSearch = projectSearch.trim().toLowerCase();
  const displayedProjects = normalizedProjectSearch
    ? projects.filter((project) =>
        [project.customer_code, project.customer_name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedProjectSearch),
      )
    : projects;
  const overSlaProjects = projects.filter((project) => {
    const stage = Array.isArray(project.current_stage) ? project.current_stage[0] : project.current_stage;
    return stage?.sla_status === 'OVER_SLA' || project.sla_status === 'OVER_SLA';
  });
  const nearSlaProjects = projects.filter((project) => {
    const stage = Array.isArray(project.current_stage) ? project.current_stage[0] : project.current_stage;
    return stage?.sla_status === 'NEAR_SLA' || project.sla_status === 'NEAR_SLA';
  });
  const blockedProjects = projects.filter((project) => {
    const stage = Array.isArray(project.current_stage) ? project.current_stage[0] : project.current_stage;
    return stage?.status === 'BLOCKED';
  });
  const workflowStageSeeds = (workflowGovernance?.stages || [])
    .filter((stage: any) => stage.is_active !== false)
    .sort((a: any, b: any) => Number(a.order_index || 999) - Number(b.order_index || 999));
  const stageOrderByCode = new Map(workflowStageSeeds.map((stage: any) => [stage.code, Number(stage.order_index || 999)]));
  const seededDashboardStages = workflowStageSeeds.reduce((acc: Record<string, any>, stage: any) => {
    acc[stage.code] = {
      code: stage.code,
      name: stage.name,
      order: Number(stage.order_index || 999),
      projects: [],
      active: 0,
      completed: 0,
      blocked: 0,
      nearSla: 0,
      overSla: 0,
    };
    return acc;
  }, {});
  const dashboardStageDistribution = Object.values(projects.reduce((acc: Record<string, any>, project) => {
    const stage = Array.isArray(project.current_stage) ? project.current_stage[0] : project.current_stage;
    const code = stage?.code || (project.status === 'COMPLETED' ? 'COMPLETED' : 'NO_STAGE');
    if (!acc[code]) {
      acc[code] = {
        code,
        name: stage?.name || (project.status === 'COMPLETED' ? 'ปิดโครงการแล้ว' : 'ยังไม่มีขั้นตอน'),
        order: Number(stage?.order_index || stageOrderByCode.get(code) || 999),
        projects: [],
        active: 0,
        completed: 0,
        blocked: 0,
        nearSla: 0,
        overSla: 0,
      };
    }
    acc[code].projects.push(project);
    if (project.status === 'COMPLETED') acc[code].completed += 1;
    else acc[code].active += 1;
    if (stage?.status === 'BLOCKED') acc[code].blocked += 1;
    if (stage?.sla_status === 'NEAR_SLA' || project.sla_status === 'NEAR_SLA') acc[code].nearSla += 1;
    if (stage?.sla_status === 'OVER_SLA' || project.sla_status === 'OVER_SLA') acc[code].overSla += 1;
    return acc;
  }, seededDashboardStages))
    .sort((a: any, b: any) => a.order - b.order || a.name.localeCompare(b.name)) as any[];
  const dashboardPipelineGroupDefinitions = [
    { key: "lead", label: "รับข้อมูลลูกค้า", codes: ["LEAD"], tone: "sky" },
    { key: "survey_design", label: "สำรวจ / ออกแบบ", codes: ["SURVEY", "TSSR"], tone: "cyan" },
    { key: "quotation", label: "ใบเสนอราคา", codes: ["QUOTATION"], tone: "cyan" },
    { key: "finance", label: "การเงิน", codes: ["PAYMENT", "LOAN_DOCUMENT_COLLECTION", "LOAN_SUBMISSION", "LOAN_REVIEW", "LOAN_APPROVAL", "DOWN_PAYMENT"], tone: "amber" },
    { key: "installation", label: "จัดตาราง / ติดตั้ง", codes: ["READY_FOR_INSTALL", "SCHEDULING", "INSTALLATION"], tone: "orange" },
    { key: "quality_handover", label: "ตรวจคุณภาพ / ส่งมอบ", codes: ["QA", "HANDOVER"], tone: "teal" },
    { key: "billing", label: "ตัด MAT / วางบิล", codes: ["ตัด_MAT", "MAT_CUT", "BILLING"], tone: "rose" },
    { key: "closure", label: "ปิดโครงการ", codes: ["CLOSURE", "COMPLETED"], tone: "slate" },
  ];
  const dashboardGroupedCodeSet = new Set(dashboardPipelineGroupDefinitions.flatMap((group) => group.codes));
  const dashboardPipelineGroups = [
    ...dashboardPipelineGroupDefinitions.map((group, index) => {
      const stages = dashboardStageDistribution.filter((stage: any) => group.codes.includes(stage.code));
      const groupProjects = stages.flatMap((stage: any) => stage.projects);
      return {
        ...group,
        order: index + 1,
        stages,
        projects: groupProjects,
        active: stages.reduce((sum: number, stage: any) => sum + stage.active, 0),
        completed: stages.reduce((sum: number, stage: any) => sum + stage.completed, 0),
        blocked: stages.reduce((sum: number, stage: any) => sum + stage.blocked, 0),
        nearSla: stages.reduce((sum: number, stage: any) => sum + stage.nearSla, 0),
        overSla: stages.reduce((sum: number, stage: any) => sum + stage.overSla, 0),
      };
    }),
    {
      key: "other",
      label: "อื่น ๆ",
      codes: [],
      tone: "slate",
      order: 99,
      stages: dashboardStageDistribution.filter((stage: any) => !dashboardGroupedCodeSet.has(stage.code)),
      projects: dashboardStageDistribution.filter((stage: any) => !dashboardGroupedCodeSet.has(stage.code)).flatMap((stage: any) => stage.projects),
      active: dashboardStageDistribution.filter((stage: any) => !dashboardGroupedCodeSet.has(stage.code)).reduce((sum: number, stage: any) => sum + stage.active, 0),
      completed: dashboardStageDistribution.filter((stage: any) => !dashboardGroupedCodeSet.has(stage.code)).reduce((sum: number, stage: any) => sum + stage.completed, 0),
      blocked: dashboardStageDistribution.filter((stage: any) => !dashboardGroupedCodeSet.has(stage.code)).reduce((sum: number, stage: any) => sum + stage.blocked, 0),
      nearSla: dashboardStageDistribution.filter((stage: any) => !dashboardGroupedCodeSet.has(stage.code)).reduce((sum: number, stage: any) => sum + stage.nearSla, 0),
      overSla: dashboardStageDistribution.filter((stage: any) => !dashboardGroupedCodeSet.has(stage.code)).reduce((sum: number, stage: any) => sum + stage.overSla, 0),
    },
  ].filter((group: any) => group.key !== "other" || group.stages.length > 0);
  const dashboardStageTotal = Math.max(1, projects.length);
  const selectedDashboardGroup = dashboardStageFilter === "ALL"
    ? null
    : dashboardPipelineGroups.find((group: any) => group.key === dashboardStageFilter);
  const selectedDashboardStageCode = dashboardStageFilter.startsWith("stage:") ? dashboardStageFilter.slice(6) : null;
  const selectedDashboardStage = selectedDashboardStageCode
    ? dashboardStageDistribution.find((stage: any) => stage.code === selectedDashboardStageCode)
    : null;
  const selectedDashboardStageGroup = selectedDashboardStageCode
    ? dashboardPipelineGroups.find((group: any) => group.codes.includes(selectedDashboardStageCode) || group.stages.some((stage: any) => stage.code === selectedDashboardStageCode))
    : null;
  const dashboardStageProjects = selectedDashboardStage?.projects || selectedDashboardGroup?.projects || projects;
  const dashboardProjectPageCount = Math.max(1, Math.ceil(dashboardStageProjects.length / dashboardProjectsPerPage));
  const normalizedDashboardProjectPage = Math.min(dashboardProjectPage, dashboardProjectPageCount);
  const dashboardProjectStartIndex = dashboardStageProjects.length === 0 ? 0 : (normalizedDashboardProjectPage - 1) * dashboardProjectsPerPage;
  const dashboardProjectEndIndex = Math.min(dashboardStageProjects.length, dashboardProjectStartIndex + dashboardProjectsPerPage);
  const pagedDashboardStageProjects = dashboardStageProjects.slice(dashboardProjectStartIndex, dashboardProjectEndIndex);
  const dashboardStageRiskTotal = dashboardStageDistribution.reduce((sum: number, stage: any) => sum + stage.blocked + stage.nearSla + stage.overSla, 0);
  const openRiskCount = exceptions.length + pendingApprovals.length + riskyStages.length + documentRisks.length;
  const highRiskExceptions = exceptions.filter((exception) => exception.severity === 'HIGH' || exception.severity === 'CRITICAL').length;
  const commandQueue = [
    ...exceptions.map((exception) => {
      const project = relatedProject(exception);
      const stage = relatedStage(exception);
      const priority = exception.severity === 'CRITICAL' ? 100 : exception.severity === 'HIGH' ? 90 : exception.severity === 'WARNING' ? 70 : 50;
      return {
        id: `exception-${exception.id}`,
        project_id: exception.project_id,
        exception,
        priority,
        tone: exception.severity === 'CRITICAL' || exception.severity === 'HIGH' ? 'rose' : exception.severity === 'WARNING' ? 'amber' : 'sky',
        label: `${severityLabel(exception.severity || 'INFO')} / ${statusLabel(exception.status)}`,
        title: exception.title,
        subtitle: `${project?.customer_code || 'ไม่พบโครงการ'}${stage ? ` / ${stageDisplay(stage).title}` : ''}`,
        detail: exception.description || `ตรวจพบ${exceptionCategoryLabel(exception.category || 'Exception')} ${formatDateTime(exception.detected_at)}`,
        owner: stageOwner({ owner_role: exception.owner_role }),
        action: exception.status === 'OPEN' ? 'รับทราบและมอบหมายงาน' : exception.status === 'ACKNOWLEDGED' ? 'เริ่มแก้ไข' : 'ปิดปัญหา',
      };
    }),
    ...pendingApprovals.map((approval) => {
      const project = relatedProject(approval);
      const stage = relatedStage(approval);
      return {
        id: `approval-${approval.id}`,
        project_id: approval.project_id,
        approval,
        priority: 85,
        tone: 'amber',
        label: `อนุมัติ / ${workflowTypeLabel(approval.type)}`,
        title: approval.reason || 'คำขออนุมัติรอการตัดสินใจ',
        subtitle: `${project?.customer_code || 'ไม่พบโครงการ'}${stage ? ` / ${stageDisplay(stage).title}` : ''}`,
        detail: `รออนุมัติตั้งแต่ ${formatDateTime(approval.created_at)}`,
        owner: 'ผู้อนุมัติ',
        action: 'อนุมัติหรือปฏิเสธ override',
      };
    }),
    ...riskyStages.map((stage) => ({
      id: `stage-${stage.id}`,
      project_id: stage.project_id,
      priority: stage.sla_status === 'OVER_SLA' || stage.status === 'BLOCKED' ? 80 : 65,
      tone: stage.sla_status === 'OVER_SLA' || stage.status === 'BLOCKED' ? 'rose' : 'amber',
      label: stage.status === 'BLOCKED' ? 'ติดขัด' : statusLabel(stage.sla_status),
      title: stageDisplay(stage).title,
      subtitle: `${Array.isArray(stage.projects) ? stage.projects[0]?.customer_code : stage.projects?.customer_code || 'ไม่พบโครงการ'} / ${stage.code}`,
      detail: stage.due_at ? `ครบกำหนด ${formatDateTime(stage.due_at)}` : 'ยังไม่มีวันครบกำหนด',
      owner: stageOwner(stage),
      action: stage.status === 'BLOCKED' ? 'แก้ gate ที่ติด หรือขอ override' : 'ไปขั้นตอนถัดไปก่อนเกิน SLA',
    })),
    ...documentRisks.map((document) => ({
      id: `doc-${document.id}`,
      project_id: document.project_id,
      priority: document.status === 'REJECTED' ? 75 : document.gate_severity === 'HARD' ? 65 : 45,
      tone: document.status === 'REJECTED' ? 'rose' : 'sky',
      label: statusLabel(document.status),
      title: document.name,
      subtitle: `${Array.isArray(document.projects) ? document.projects[0]?.customer_code : document.projects?.customer_code || 'ไม่พบโครงการ'} / ${document.code}`,
      detail: `V${document.version_number || 1} / ${severityLabel(document.gate_severity)}`,
      owner: 'ผู้ดูแลเอกสาร',
      action: document.status === 'REJECTED' ? 'อัปโหลดไฟล์ที่แก้ไขแล้ว' : 'ตรวจเอกสารให้ผ่าน',
    })),
    ...fieldJobs
      .filter((job) => job.status === 'BLOCKED' || job.sla_status === 'OVER_SLA' || job.sla_status === 'NEAR_SLA')
      .map((job) => {
        const project = relatedProject(job);
        return {
          id: `field-${job.id}`,
          project_id: job.project_id,
          priority: job.status === 'BLOCKED' || job.sla_status === 'OVER_SLA' ? 70 : 55,
          tone: job.status === 'BLOCKED' || job.sla_status === 'OVER_SLA' ? 'rose' : 'amber',
          label: job.status === 'BLOCKED' ? 'งานหน้างานติดขัด' : statusLabel(job.sla_status),
          title: stageDisplay(job).title,
          subtitle: `${project?.customer_code || 'ไม่พบโครงการ'} / ${job.code}`,
          detail: `${runningStageLabel(job)} / SLA ${formatSlaDuration(job.workflow_definitions?.sla_hours)}`,
          owner: stageOwner(job),
          action: 'ทำ gate ให้ครบและอัปโหลดหลักฐาน',
        };
      }),
  ].sort((a, b) => b.priority - a.priority).slice(0, 12);
  const criticalQueueCount = commandQueue.filter((item) => item.priority >= 80).length;
  const firstCommandItem = commandQueue[0];
  const normalizedScheduleSearch = scheduleSearch.trim().toLowerCase();
  const filteredSchedulingItems = schedulingItems.filter((item) => {
    const project = relatedProject(item);
    const draft = scheduleDraftFor(item);
    const range = scheduleBookingRange(item);
    const teamId = draft.resourceTeamId || range?.resourceTeamId || item?.metadata?.resource_team_id || "";
    const statusGroup = item.status === "BLOCKED" || item.sla_status === "OVER_SLA" || item.sla_status === "NEAR_SLA"
      ? "RISK"
      : range
        ? "SCHEDULED"
        : "UNSCHEDULED";
    const searchText = [
      project?.customer_code,
      project?.customer_name,
      project?.customer_phone,
      item.code,
      stageDisplay(item).title,
      item?.metadata?.resource_team_name,
    ].filter(Boolean).join(" ").toLowerCase();

    return (scheduleTeamFilter === "ALL" || teamId === scheduleTeamFilter)
      && (scheduleStatusFilter === "ALL" || statusGroup === scheduleStatusFilter)
      && (!normalizedScheduleSearch || searchText.includes(normalizedScheduleSearch));
  });

  const scheduleDayKeys = Array.from({ length: scheduleRangeDays }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + scheduleWindowOffset + index);
    return date.toISOString().slice(0, 10);
  });
  const scheduleFirstDayKey = scheduleDayKeys[0];
  const scheduleLastDayKey = scheduleDayKeys[scheduleDayKeys.length - 1];
  const scheduleWindowLabel = scheduleFirstDayKey && scheduleLastDayKey
    ? `${formatScheduleDayLabel(scheduleFirstDayKey)} - ${formatScheduleDayLabel(scheduleLastDayKey)}`
    : "";
  const scheduleBookings = filteredSchedulingItems
    .map((item) => {
      const range = scheduleBookingRange(item);
      if (!range) return null;
      const startOffset = scheduleDayDiff(scheduleFirstDayKey, range.startKey);
      const endOffset = scheduleDayDiff(scheduleFirstDayKey, range.endKey);
      if (endOffset < 0 || startOffset >= scheduleRangeDays) return null;
      return {
        item,
        ...range,
        visibleStartIndex: Math.max(0, startOffset),
        visibleEndIndex: Math.min(scheduleRangeDays - 1, endOffset),
        totalDays: Math.max(1, scheduleDayDiff(range.startKey, range.endKey) + 1),
      };
    })
    .filter(Boolean) as any[];
  const unscheduledSchedulingItems = filteredSchedulingItems.filter((item) => !scheduleBookingRange(item));
  const editingScheduleItem = editingScheduleStageId ? schedulingItems.find((item) => item.id === editingScheduleStageId) : null;
  const scheduleTeamRows = [
    ...resourceTeams.filter((team) => team.is_active),
    ...(scheduleBookings.some((booking) => !booking.resourceTeamId) ? [{ id: "", name: "ยังไม่กำหนดทีม", territory: "", daily_capacity: 0, skills: [], is_active: true }] : []),
  ].map((team) => {
    const bookings = scheduleBookings
      .filter((booking) => (booking.resourceTeamId || "") === team.id)
      .sort((a, b) => a.visibleStartIndex - b.visibleStartIndex || a.visibleEndIndex - b.visibleEndIndex);
    const laneEnds: number[] = [];
    const laneBookings = bookings.map((booking) => {
      const laneIndex = laneEnds.findIndex((endIndex) => booking.visibleStartIndex > endIndex);
      const nextLaneIndex = laneIndex === -1 ? laneEnds.length : laneIndex;
      laneEnds[nextLaneIndex] = booking.visibleEndIndex;
      return { ...booking, laneIndex: nextLaneIndex };
    });
    return { team, laneBookings, laneCount: Math.max(1, laneEnds.length) };
  });
  const schedulingRiskCount = filteredSchedulingItems.filter((item) => item.status === 'BLOCKED' || item.sla_status === 'OVER_SLA' || item.sla_status === 'NEAR_SLA').length;
  const schedulingConflictCount = scheduleDayKeys.reduce((count, dayKey, dayIndex) => {
    const teamCounts = new Map<string, number>();
    scheduleBookings.forEach((booking) => {
      if (booking.visibleStartIndex <= dayIndex && booking.visibleEndIndex >= dayIndex) {
        const teamKey = booking.resourceTeamId || "UNASSIGNED";
        teamCounts.set(teamKey, (teamCounts.get(teamKey) || 0) + 1);
      }
    });
    return count + Array.from(teamCounts.values()).reduce((sum, teamCount) => sum + Math.max(0, teamCount - 1), 0);
  }, 0);
  const exceptionToneClass: Record<string, string> = {
    CRITICAL: 'border-rose-200 bg-rose-50 text-rose-700',
    HIGH: 'border-orange-200 bg-orange-50 text-orange-700',
    WARNING: 'border-amber-200 bg-amber-50 text-amber-700',
    INFO: 'border-slate-200 bg-slate-50 text-slate-600',
  };
  const filteredExceptions = exceptions.filter((exception) => {
    const statusMatch = exceptionFilters.status === 'ALL' || exception.status === exceptionFilters.status;
    const severityMatch = exceptionFilters.severity === 'ALL' || exception.severity === exceptionFilters.severity;
    const categoryMatch = exceptionFilters.category === 'ALL' || exception.category === exceptionFilters.category;
    return statusMatch && severityMatch && categoryMatch;
  });
  const exceptionStatusCounts = exceptions.reduce((acc: Record<string, number>, exception) => {
    acc[exception.status] = (acc[exception.status] || 0) + 1;
    return acc;
  }, {});
  const exceptionSeverityOptions = Array.from(new Set(exceptions.map((exception) => exception.severity).filter(Boolean)));
  const exceptionCategoryOptions = Array.from(new Set(exceptions.map((exception) => exception.category).filter(Boolean)));

  const completedMilestones = milestones.filter(m => m.actual_completed_at).length;
  const totalMilestones = milestones.length;
  const progressPercent = Math.round((completedMilestones / totalMilestones) * 100) || 0;
  const currentMilestone = milestones.find(m => m.dynamicStatus === 'In Progress' || m.dynamicStatus === 'Near SLA' || m.dynamicStatus === 'Overdue' || m.dynamicStatus === 'Blocked');
  const nextMilestone = findNextRuntimeStage(currentMilestone, milestones, selectedProject);
  const currentStageBlockers = stageGateBlockers(currentMilestone);
  const currentStageReady = Boolean(currentMilestone) && currentStageBlockers.length === 0;
  const canCompleteCurrentStage = canCurrentUserCompleteStage(currentMilestone, currentUserRole);
  const overdueMilestones = milestones.filter(m => m.dynamicStatus === 'Overdue' || m.dynamicStatus === 'Blocked').length;
  const nearSlaMilestones = milestones.filter(m => m.dynamicStatus === 'Near SLA').length;
  const selectedStage = selectedStageId ? milestones.find((stage) => stage.id === selectedStageId) : null;
  const selectedStageDocuments = selectedStage ? sortProjectDocuments(selectedStage.documents || []) : [];
  const selectedStageActiveDocuments = selectedStageDocuments.filter(isActiveDocumentVersion);
  const projectDocuments = sortProjectDocuments(milestones.flatMap((stage: any) => stage.documents || []));
  const projectActiveDocuments = projectDocuments.filter(isActiveDocumentVersion);
  const projectRequiredDocuments = projectActiveDocuments.filter((document: any) => document.is_required !== false);
  const projectVerifiedDocuments = projectActiveDocuments.filter((document: any) => document.status === 'VERIFIED');
  const projectReviewDocuments = projectActiveDocuments.filter((document: any) => canVerifyDocument(document));
  const projectRejectedDocuments = projectActiveDocuments.filter((document: any) => document.status === 'REJECTED');
  const projectMissingHardDocuments = projectActiveDocuments.filter((document: any) => document.gate_severity === 'HARD' && canUploadDocument(document));
  const projectDriveLinkedDocuments = projectActiveDocuments.filter((document: any) => document.google_drive_file_id || document.web_view_link);
  const currentStageActiveDocuments = currentMilestone ? sortProjectDocuments(currentMilestone.documents || []).filter(isActiveDocumentVersion) : [];
  const currentStageRequiredDocuments = currentStageActiveDocuments.filter((document: any) => document.is_required !== false);
  const currentStageVerifiedDocuments = currentStageRequiredDocuments.filter((document: any) => document.status === 'VERIFIED');
  const currentStageRejectedDocuments = currentStageRequiredDocuments.filter((document: any) => document.status === 'REJECTED');
  const currentStageMissingHardDocuments = currentStageRequiredDocuments.filter((document: any) => document.gate_severity === 'HARD' && canUploadDocument(document));
  const currentStageDocumentRiskCount = currentStageRejectedDocuments.length + currentStageMissingHardDocuments.length;
  const selectedStageVerifiedDocuments = selectedStageActiveDocuments.filter((document: any) => document.status === 'VERIFIED');
  const selectedStageReviewDocuments = selectedStageActiveDocuments.filter((document: any) => canVerifyDocument(document));
  const selectedStageRejectedDocuments = selectedStageActiveDocuments.filter((document: any) => document.status === 'REJECTED');
  const selectedStageMissingHardDocuments = selectedStageActiveDocuments.filter((document: any) => document.gate_severity === 'HARD' && canUploadDocument(document));
  const selectedStageGateItems = selectedStage ? [...(selectedStage.checklists || []), ...selectedStageActiveDocuments] : [];
  const selectedStagePassedGates = selectedStageGateItems.filter(gateItemPassed).length;
  const selectedStageBlockers = stageGateBlockers(selectedStage);
  const selectedStagePrimaryBlocker = selectedStageBlockers[0] || null;
  const selectedStageHasBlockingGates = selectedStageBlockers.length > 0;
  const selectedStageNext = findNextRuntimeStage(selectedStage, milestones, selectedProject);
  const selectedStageCanComplete = canCurrentUserCompleteStage(selectedStage, currentUserRole);
  const selectedStageCanTransitionNow = !selectedStageHasBlockingGates && selectedStageCanComplete;
  const selectedStagePassedChecklists = selectedStage ? (selectedStage.checklists || []).filter(isGatePassed).length : 0;
  const selectedStageOverrideableBlockers = selectedStage ? stageOverrideableBlockers(selectedStage) : [];
  const selectedStagePendingOverride = selectedStage ? stagePendingOverride(selectedStage) : null;
  const selectedStageApprovedOverride = selectedStage ? stageApprovedOverride(selectedStage) : null;
  const selectedStageActivities = selectedStage ? selectedStage.activities || [] : [];
  const selectedStageHistoryGroups = selectedStage
    ? [{
      key: String(selectedStage.id || selectedStage.code || 'selected-stage'),
      title: stageDisplay(selectedStage).title,
      code: selectedStage.code,
      order: Number(selectedStage.order_index || 9999),
      activities: selectedStageActivities,
    }]
    : [];
  const allStageHistoryGroups = milestones
    .map((stage: any) => ({
      key: String(stage.id || stage.code || 'unknown-stage'),
      title: stageDisplay(stage).title,
      code: stage.code,
      order: Number(stage.order_index || 9999),
      activities: [...(stage.activities || [])].sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()),
    }))
    .filter((group: any) => group.activities.length > 0)
    .sort((a: any, b: any) => {
      const currentOrder = Number(selectedStage?.order_index || currentMilestone?.order_index || 0);
      if (currentOrder) {
        const currentDistance = Math.abs(a.order - currentOrder) - Math.abs(b.order - currentOrder);
        if (currentDistance !== 0) return currentDistance;
        return b.order - a.order;
      }
      return b.order - a.order || a.title.localeCompare(b.title);
    });
  const visibleHistoryGroups = stageHistoryScope === 'all' ? allStageHistoryGroups : selectedStageHistoryGroups;
  const visibleStageActivities = visibleHistoryGroups.flatMap((group: any) => group.activities);
  const projectActivities = milestones
    .flatMap((stage: any) => (stage.activities || []).map((activity: any) => ({ ...activity, stageTitle: stageDisplay(stage).title, stageCode: stage.code })))
    .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  const projectLatestActivities = projectActivities.slice(0, 5);
  const projectPendingApprovals = milestones.flatMap((stage: any) => stage.approvals || []).filter((approval: any) => approval.status === "PENDING");
  const projectOpenExceptions = milestones.flatMap((stage: any) => stage.exceptions || []).filter((exception: any) => ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS"].includes(exception.status));
  const projectDocumentRiskCount = projectMissingHardDocuments.length + projectRejectedDocuments.length;
  const projectDocumentHealthPercent = projectRequiredDocuments.length ? Math.round((projectVerifiedDocuments.length / projectRequiredDocuments.length) * 100) : 100;
  const projectDriveLinkedPercent = projectActiveDocuments.length ? Math.round((projectDriveLinkedDocuments.length / projectActiveDocuments.length) * 100) : 0;
  const projectLeadStage = milestones.find((stage: any) => stage.code === "LEAD") || milestones[0] || null;
  const selectedProjectSystemSize = selectedProject?.system_size_kw || selectedProject?.customer_intake?.interestedSystemSizeKw || selectedProject?.customer_intake?.systemSizeKw || "-";
  const selectedProjectArea = [selectedProject?.customer_intake?.siteDistrict, selectedProject?.customer_intake?.siteProvince].filter(Boolean).join(", ") || "-";
  const workflowStageColumnWidth = showProjectStageSequence ? 184 : 132;
  const workflowStageGapPx = showProjectStageSequence ? 12 : 8;
  const workflowStageTrackWidth = Math.max(milestones.length, 1) * workflowStageColumnWidth + Math.max(milestones.length - 1, 0) * workflowStageGapPx;
  const selectedStageScheduleSource = selectedStage?.code === 'INSTALLATION'
    ? milestones.find((stage: any) => stage.code === 'SCHEDULING')
    : selectedStage;
  const selectedStageScheduleMetadata = selectedStageScheduleSource?.metadata || {};
  const selectedStageRescheduleCount = selectedStageScheduleSource
    ? rescheduleCountFromActivities(selectedStageScheduleSource.activities || [])
    : 0;
  const selectedStageLoanFallbackState = selectedStage?.metadata?.loan_fallback?.state || null;
  const selectedStageIsQuotation = selectedStage?.code === 'QUOTATION';
  const selectedProjectPaymentLabel = selectedProject?.payment_type === 'LOAN' ? 'สินเชื่อ' : 'เงินสด';
  const selectedStageIsLoanDecision = selectedProject?.payment_type === 'LOAN'
    && ['LOAN_SUBMISSION', 'LOAN_REVIEW', 'LOAN_APPROVAL'].includes(String(selectedStage?.code || ''));
  const timelineElapsed = timelineElapsedHours(milestones, selectedProject?.created_at);
  const timelineTargetStage = currentTimelineStage(milestones);
  const timelineTargetIndex = Math.max(0, milestones.findIndex((stage) => stage.id === timelineTargetStage?.id));
  const timelineProgressPercent = totalMilestones > 1 ? Math.min(100, Math.max(0, (timelineTargetIndex / (totalMilestones - 1)) * 100)) : 0;
  const timelineRailTone = overdueMilestones > 0 ? 'rose' : nearSlaMilestones > 0 ? 'amber' : 'emerald';
  const statusMiniRailVisual = currentMilestone ? stageVisual(currentMilestone) : { icon: 'check', iconClass: 'border-emerald-100 bg-emerald-50 text-emerald-700' };
  const statusMiniRailSolidClass = currentMilestone ? stageSolidIconClass(currentMilestone) : "workflow-stage-solid-emerald";
  const statusSummaryTone = timelineRailTone as "emerald" | "amber" | "rose";
  const actionSummaryTone = currentStageBlockers.length ? "rose" : "emerald";
  const approvalSummaryTone = projectPendingApprovals.length ? "amber" : "slate";
  const documentSummaryTone = currentStageDocumentRiskCount ? "rose" : projectReviewDocuments.length || projectDocumentHealthPercent > 0 ? "blue" : "slate";
  const updateStageRailOverflow = () => {
    const rail = stageRailRef.current;
    if (!rail) return;
    const maxScrollLeft = rail.scrollWidth - rail.clientWidth;
    setStageRailOverflow({
      left: rail.scrollLeft > 4,
      right: rail.scrollLeft < maxScrollLeft - 4,
    });
  };
  const scrollStageRail = (direction: 'left' | 'right') => {
    const rail = stageRailRef.current;
    if (!rail) return;
    rail.scrollBy({
      left: (direction === 'left' ? -1 : 1) * Math.max(280, Math.round(rail.clientWidth * 0.65)),
      behavior: 'smooth',
    });
  };
  const handleStageRailPointerDown = (event: any) => {
    const rail = stageRailRef.current;
    if (!rail) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    stageRailDragRef.current = {
      active: true,
      startX: event.clientX,
      scrollLeft: rail.scrollLeft,
      moved: false,
      pointerId: event.pointerId,
    };
  };
  const handleStageRailPointerMove = (event: any) => {
    const rail = stageRailRef.current;
    const drag = stageRailDragRef.current;
    if (!rail || !drag.active) return;
    const deltaX = event.clientX - drag.startX;
    if (Math.abs(deltaX) > 4 && !drag.moved) {
      drag.moved = true;
      rail.setPointerCapture?.(event.pointerId);
      setStageRailDragging(true);
    }
    if (drag.moved) {
      event.preventDefault();
      rail.scrollLeft = drag.scrollLeft - deltaX;
      updateStageRailOverflow();
    }
  };
  const endStageRailDrag = (event?: any) => {
    const rail = stageRailRef.current;
    const drag = stageRailDragRef.current;
    if (!drag.active) return;
    if (rail && drag.pointerId !== null && rail.hasPointerCapture?.(drag.pointerId)) {
      rail.releasePointerCapture?.(drag.pointerId);
    }
    suppressStageRailClickRef.current = drag.moved;
    stageRailDragRef.current = { active: false, startX: 0, scrollLeft: 0, moved: false, pointerId: null };
    setStageRailDragging(false);
    if (event && drag.moved) event.preventDefault();
    window.setTimeout(() => {
      suppressStageRailClickRef.current = false;
    }, 0);
  };
  const handleStageRailClickCapture = (event: any) => {
    if (!suppressStageRailClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
  };

  useEffect(() => {
    const rail = stageRailRef.current;
    if (!rail) return;
    const currentStageElement = timelineTargetStage?.id
      ? rail.querySelector(`[data-stage-id="${CSS.escape(String(timelineTargetStage.id))}"]`)
      : null;
    currentStageElement?.scrollIntoView({ block: 'nearest', inline: 'center' });
    requestAnimationFrame(updateStageRailOverflow);
  }, [selectedProject?.id, timelineTargetStage?.id, milestones.length, workflowStageTrackWidth]);

  useEffect(() => {
    const rail = stageRailRef.current;
    if (!rail) return;
    updateStageRailOverflow();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateStageRailOverflow) : null;
    observer?.observe(rail);
    const onResize = () => updateStageRailOverflow();
    window.addEventListener('resize', onResize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [workflowStageTrackWidth, showProjectStageSequence]);
  const nextActionAssistant = buildNextActionAssistant({
    selectedProject,
    milestones,
    currentMilestone,
    nextMilestone,
    currentStageBlockers,
    currentStageReady,
    projectReviewDocuments,
  });

  return (
    <div className="flex h-screen bg-[#FBFBFC] text-[#171717] font-sans overflow-hidden selection:bg-emerald-200">
      <NetworkProgress
        pending={networkActivity.pending + directNetworkActivity.pending}
        label={directNetworkActivity.label || networkActivity.label}
      />
      
      <AppSidebar
        activeTab={activeTab}
        isCollapsed={isSidebarCollapsed}
        hasSelectedProject={Boolean(selectedProject)}
        onHoverChange={setIsSidebarCollapsed}
        onNavigate={(tab) => {
          setActiveTab(tab);
          setSelectedProject(null);
        }}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#FBFBFC] relative">
        {!(activeTab === "projects" && selectedProject) && (
          <AppHeader
            activeTab={activeTab}
            selectedProject={selectedProject}
            milestones={milestones}
            totalMilestones={totalMilestones}
            completedMilestones={completedMilestones}
            progressPercent={progressPercent}
            overdueMilestones={overdueMilestones}
            nearSlaMilestones={nearSlaMilestones}
            timelineTargetStage={timelineTargetStage}
            timelineTargetIndex={timelineTargetIndex}
            timelineProgressPercent={timelineProgressPercent}
            timelineRailTone={timelineRailTone}
            timelineElapsed={timelineElapsed}
            refreshingSla={refreshingSla}
            stageTitle={(stage) => stageDisplay(stage).title}
            formatSlaDuration={formatSlaDuration}
            onGoProjects={() => {
              setActiveTab("projects");
              setSelectedProject(null);
            }}
            onRefreshSla={handleRefreshSla}
            onRefreshAll={() => {
              fetchProjects();
              fetchFieldJobs();
              fetchSchedulingItems();
              fetchResourceTeams();
              fetchBillingItems();
              fetchQaItems();
              fetchApprovalItems();
              fetchWorkflowGovernance();
              fetchNotifications();
            }}
            onNewProject={() => setIsModalOpen(true)}
            onBackToProjects={() => setSelectedProject(null)}
            userEmail={authEmail}
            userRoleLabel={currentUserRole ? roleLabelWithCode(currentUserRole) : null}
            onOpenAuth={() => setAuthDialogOpen(true)}
            onSignOut={handleSignOut}
          />
        )}

        <div className={`flex-1 overflow-y-auto scrollbar-thin ${activeTab === 'dashboard' ? 'bg-slate-100/80' : selectedProject ? 'bg-[#f8fafc]' : 'bg-white'} ${activeTab === 'scheduling' ? 'p-4 md:p-5' : selectedProject ? 'p-4 md:p-5' : 'p-6 md:p-8'}`}>
          
          {!authEmail ? (
            <div className="flex min-h-full items-center justify-center">
              <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Authentication Required</p>
                <h2 className="mt-2 text-[20px] font-black text-slate-950">กรุณาเข้าสู่ระบบ</h2>
                <p className="mt-2 text-[13px] font-semibold leading-6 text-slate-500">
                  ข้อมูลโครงการ, user, role, schedule และเอกสารจะแสดงเฉพาะเมื่อมี session ที่ใช้งานอยู่
                </p>
                <button
                  type="button"
                  onClick={() => setAuthDialogOpen(true)}
                  className="mt-5 h-10 rounded-md bg-slate-950 px-4 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-slate-800"
                >
                  เข้าสู่ระบบ
                </button>
              </div>
            </div>
          ) : activeTab === 'dashboard' ? (
            <div className="w-full space-y-6">
              <div className={`hidden overflow-hidden rounded-lg border bg-white shadow-sm ${criticalQueueCount ? 'border-rose-200' : openRiskCount ? 'border-amber-200' : 'border-emerald-200'}`}>
                <div className={`grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px] ${criticalQueueCount ? 'bg-rose-50/50' : openRiskCount ? 'bg-amber-50/50' : 'bg-emerald-50/50'}`}>
                  <div className="px-6 py-5">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className={`rounded border px-2 py-1 text-[10px] font-bold ${criticalQueueCount ? 'border-rose-200 bg-white text-rose-700' : openRiskCount ? 'border-amber-200 bg-white text-amber-700' : 'border-emerald-200 bg-white text-emerald-700'}`}>
                        {criticalQueueCount ? 'ต้องรีบดู' : openRiskCount ? 'มีรายการเฝ้าระวัง' : 'ปกติ'}
                      </span>
                      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">ศูนย์ควบคุมงาน</span>
                    </div>
                    <h3 className="text-[22px] font-bold tracking-tight text-slate-950">
                      {firstCommandItem ? firstCommandItem.title : 'ตอนนี้ไม่มีงานติดขัด'}
                    </h3>
                    <p className="mt-2 max-w-3xl text-[13px] leading-6 text-slate-600">
                      {firstCommandItem ? firstCommandItem.detail : 'ไม่มี exception, approval, SLA, gate หรือเอกสารที่ต้องจัดการตอนนี้'}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] font-bold">
                      {firstCommandItem ? (
                        <>
                          <span className="rounded border border-slate-200 bg-white px-2.5 py-1 text-slate-600">{firstCommandItem.subtitle}</span>
                          <span className="rounded border border-slate-200 bg-white px-2.5 py-1 text-slate-600">ผู้รับผิดชอบ: {firstCommandItem.owner}</span>
                          <span className="rounded border border-slate-200 bg-white px-2.5 py-1 text-slate-600">สิ่งที่ต้องทำ: {firstCommandItem.action}</span>
                        </>
                      ) : (
                        <span className="rounded border border-emerald-200 bg-white px-2.5 py-1 text-emerald-700">ไม่มีคิวงานค้าง</span>
                      )}
                    </div>
                  </div>
                  <div className="border-t border-white/70 bg-white/70 px-6 py-5 lg:border-l lg:border-t-0">
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        ['เร่งด่วน', criticalQueueCount, criticalQueueCount ? 'text-rose-600' : 'text-emerald-600'],
                        ['คิวงาน', openRiskCount, openRiskCount ? 'text-amber-600' : 'text-emerald-600'],
                        ['Exception', exceptions.length, exceptions.length ? 'text-rose-600' : 'text-slate-900'],
                        ['รออนุมัติ', pendingApprovals.length, pendingApprovals.length ? 'text-amber-600' : 'text-slate-900'],
                      ].map(([label, value, className]) => (
                        <div key={label as string} className="rounded-md border border-slate-200 bg-white px-3 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                          <p className={`mt-1 text-2xl font-black ${className}`}>{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="hidden grid-cols-1 gap-4 md:grid-cols-5">
                <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[13px] font-medium text-slate-500">โครงการที่กำลังทำ</p>
                  </div>
                  <p className="text-2xl font-bold text-slate-900">{activeProjects.length}</p>
                  <p className="text-[11px] text-slate-500 font-medium mt-1">เสร็จแล้ว {completedProjects.length}</p>
                </div>
                <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[13px] font-medium text-slate-500">เกิน SLA</p>
                  </div>
                  <p className={`text-2xl font-bold ${overSlaProjects.length ? 'text-rose-600' : 'text-slate-900'}`}>{overSlaProjects.length}</p>
                  <p className={`text-[11px] font-medium mt-1 ${nearSlaProjects.length ? 'text-amber-600' : 'text-slate-500'}`}>ใกล้หมด SLA {nearSlaProjects.length}</p>
                </div>
                <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[13px] font-medium text-slate-500">ขั้นตอนติดขัด</p>
                  </div>
                  <p className={`text-2xl font-bold ${blockedProjects.length ? 'text-rose-600' : 'text-slate-900'}`}>{blockedProjects.length}</p>
                  <p className="text-[11px] text-slate-500 font-medium mt-1">ความเสี่ยงใน workflow {riskyStages.length}</p>
                </div>
	                <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between">
	                  <div className="flex items-center justify-between mb-2">
	                    <p className="text-[13px] font-medium text-slate-500">ปัญหาที่ยังเปิดอยู่</p>
	                  </div>
	                  <p className="text-2xl font-bold text-slate-900">{exceptions.length}</p>
	                  <p className={`text-[11px] font-medium mt-1 ${highRiskExceptions > 0 ? 'text-rose-500' : 'text-slate-500'}`}>{highRiskExceptions > 0 ? `ความเสี่ยงสูง ${highRiskExceptions}` : 'ไม่มีความเสี่ยงสูง'}</p>
	                </div>
                <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[13px] font-medium text-slate-500">คิวที่ต้องทำ</p>
                  </div>
                  <p className={`text-2xl font-bold ${openRiskCount ? 'text-amber-600' : 'text-slate-900'}`}>{openRiskCount}</p>
                  <p className={`text-[11px] font-medium mt-1 ${pendingApprovals.length ? 'text-amber-600' : 'text-slate-500'}`}>รออนุมัติ {pendingApprovals.length}</p>
                </div>
	              </div>

              <div className="overflow-hidden rounded-xl border border-slate-300/80 bg-slate-50 shadow-sm shadow-slate-300/40">
                <div className="border-b border-slate-200 bg-slate-100/70 px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-extrabold text-emerald-700">{projects.length} projects</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={dashboardStageFilter}
                        onChange={(event) => {
                          setDashboardStageFilter(event.target.value);
                          setDashboardProjectPage(1);
                        }}
                        className="h-10 min-w-[180px] rounded-md border border-slate-300 bg-slate-50 px-3 text-[12px] font-semibold text-slate-700 outline-none focus:border-emerald-400"
                      >
                        <option value="ALL">ทุกกลุ่มงาน</option>
                        {dashboardPipelineGroups.map((group: any) => (
                          <optgroup key={group.key} label={group.label}>
                            <option value={group.key}>{group.label} ({group.projects.length})</option>
                            {group.stages.map((stage: any) => (
                              <option key={stage.code} value={`stage:${stage.code}`}>- {stage.name} ({stage.projects.length})</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <span className={`rounded-md border px-2.5 py-2 text-[11px] font-bold ${dashboardStageRiskTotal ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-100 bg-emerald-50 text-emerald-700'}`}>
                        {dashboardStageRiskTotal ? `มี risk ${dashboardStageRiskTotal}` : 'Stage ปกติ'}
                      </span>
                      <span className="rounded-md border border-slate-300 bg-slate-200/60 px-2.5 py-2 text-[11px] font-bold text-slate-700">Active {activeProjects.length}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="border-b border-slate-200 bg-slate-100/40 p-5">
                    {dashboardPipelineGroups.length === 0 ? (
                      <div className="rounded-md border border-dashed border-slate-200 px-4 py-10 text-center text-[13px] font-medium text-slate-400">ยังไม่มี project สำหรับสรุป stage</div>
                    ) : (
                      <div className="grid gap-3 lg:grid-cols-4 2xl:grid-cols-8">
                        {dashboardPipelineGroups.map((group: any, groupIndex: number) => {
                          const count = group.projects.length;
                          const percent = Math.round((count / dashboardStageTotal) * 100);
                          const isSelected = dashboardStageFilter === group.key;
                          const isInSelectedFlow = isSelected || selectedDashboardStageGroup?.key === group.key;
                          const riskCount = group.blocked + group.nearSla + group.overSla;
                          const stageNames = group.stages.map((stage: any) => stage.name).filter(Boolean).join(" / ");
                          const toneClass = group.tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-700" : group.tone === "orange" ? "border-orange-200 bg-orange-50 text-orange-700" : group.tone === "rose" ? "border-rose-200 bg-rose-50 text-rose-700" : group.tone === "teal" ? "border-teal-200 bg-teal-50 text-teal-700" : group.tone === "cyan" ? "border-cyan-200 bg-cyan-50 text-cyan-700" : group.tone === "lime" ? "border-lime-200 bg-lime-50 text-lime-700" : group.tone === "sky" ? "border-sky-200 bg-sky-50 text-sky-700" : "border-slate-200 bg-slate-50 text-slate-700";
                          const gradientClass = group.tone === "amber" ? "from-amber-400 to-orange-500" : group.tone === "orange" ? "from-orange-400 to-rose-500" : group.tone === "rose" ? "from-rose-400 to-pink-500" : group.tone === "teal" ? "from-teal-400 to-emerald-500" : group.tone === "cyan" ? "from-cyan-400 to-sky-500" : group.tone === "lime" ? "from-lime-400 to-emerald-500" : group.tone === "sky" ? "from-sky-400 to-cyan-500" : "from-slate-400 to-slate-600";
                          const surfaceGradientClass = group.tone === "amber" ? "from-amber-100 via-orange-50 to-orange-100/70" : group.tone === "orange" ? "from-orange-100 via-rose-50 to-rose-100/70" : group.tone === "rose" ? "from-rose-100 via-pink-50 to-pink-100/70" : group.tone === "teal" ? "from-teal-100 via-emerald-50 to-emerald-100/70" : group.tone === "cyan" ? "from-cyan-100 via-sky-50 to-sky-100/70" : group.tone === "lime" ? "from-lime-100 via-emerald-50 to-emerald-100/70" : group.tone === "sky" ? "from-sky-100 via-cyan-50 to-cyan-100/70" : "from-slate-100 via-slate-50 to-slate-200/70";
                          const visual = stageVisual(group.stages[0] || { code: group.key });
                          return (
                            <div key={group.key} className="relative h-full">
                            <button
                              type="button"
                              onClick={() => {
                                setDashboardStageFilter(isSelected ? "ALL" : group.key);
                                setDashboardProjectPage(1);
                              }}
                              className={`relative h-[220px] w-full overflow-hidden rounded-xl border px-3 py-3 text-left shadow-sm shadow-slate-300/30 transition-all ${isInSelectedFlow ? 'border-slate-950 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white shadow-md ring-2 ring-slate-950/20' : count === 0 ? `border-slate-300/80 bg-gradient-to-br ${surfaceGradientClass} text-slate-500 hover:border-slate-400` : `border-slate-300/80 bg-gradient-to-br ${surfaceGradientClass} hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-md hover:shadow-slate-300/40`}`}
                            >
                              <div className={`pointer-events-none absolute -bottom-16 -right-14 h-44 w-44 rounded-full bg-gradient-to-br ${isInSelectedFlow ? 'from-white/25 via-white/10 to-transparent' : gradientClass} ${isInSelectedFlow ? 'opacity-30' : 'opacity-[0.16]'} blur-[2px]`}></div>
                              <div className={`pointer-events-none absolute -bottom-10 -right-8 ${isInSelectedFlow ? 'text-white/10' : 'text-white/55'} [&_svg]:h-36 [&_svg]:w-36`}>
                                <StageIcon name={visual.icon} />
                              </div>
                              <div className="absolute inset-x-0 top-0 h-px bg-white/80"></div>
                              <div className="relative z-10 flex items-start justify-between gap-3 pt-1">
                                <div className="min-w-0 flex-1">
                                  <span className={`mb-2 flex h-9 w-9 items-center justify-center rounded-lg border ${isInSelectedFlow ? 'border-white/20 bg-white/10 text-white' : toneClass}`}>
                                    <StageIcon name={visual.icon} />
                                  </span>
                                  <p className={`line-clamp-2 min-h-[34px] text-[13px] font-extrabold leading-4 ${isInSelectedFlow ? 'text-white' : 'text-slate-950'}`}>{group.label}</p>
                                  <p className={`mt-1 line-clamp-1 text-[10px] font-bold ${isSelected ? 'text-white/50' : 'text-slate-400'}`}>{stageNames || 'ไม่มี stage ย่อย'}</p>
                                </div>
                                <div className="shrink-0 text-right">
                                  <p className={`text-2xl font-black ${isInSelectedFlow ? 'text-white' : count ? 'text-slate-950' : 'text-slate-300'}`}>{count}</p>
                                  <p className={`text-[10px] font-bold ${isInSelectedFlow ? 'text-white/55' : 'text-slate-500'}`}>{percent}%</p>
                                </div>
                              </div>
                              <div className={`relative z-10 mt-3 h-2 overflow-hidden rounded-full ${isInSelectedFlow ? 'bg-white/15' : 'bg-slate-200/80'}`}>
                                <div
                                  className={`${riskCount ? 'bg-blue-950' : count ? 'bg-emerald-500' : 'bg-slate-300'} h-full rounded-full`}
                                  style={{ width: count ? `${Math.max(5, percent)}%` : '5%' }}
                                ></div>
                              </div>
                              <div className={`relative z-10 mt-3 flex min-h-[48px] flex-wrap content-start gap-1.5 text-[10px] font-bold ${isInSelectedFlow ? 'text-white/75' : 'text-slate-500'}`}>
                                <span className={`rounded border px-1.5 py-0.5 ${isInSelectedFlow ? 'border-white/15 bg-white/10' : 'border-slate-200 bg-white/70'}`}>Active {group.active}</span>
                                {group.completed > 0 && <span className={`rounded border px-1.5 py-0.5 ${isInSelectedFlow ? 'border-white/15 bg-white/10' : 'border-emerald-200 bg-white/70 text-emerald-700'}`}>Done {group.completed}</span>}
                                {group.blocked > 0 && <span className={`rounded border px-1.5 py-0.5 ${isInSelectedFlow ? 'border-white/15 bg-white/10' : 'border-rose-200 bg-white/70 text-rose-700'}`}>Blocked {group.blocked}</span>}
                                {group.overSla > 0 && <span className={`rounded border px-1.5 py-0.5 ${isInSelectedFlow ? 'border-white/15 bg-white/10' : 'border-rose-200 bg-white/70 text-rose-700'}`}>Over {group.overSla}</span>}
                                {group.nearSla > 0 && <span className={`rounded border px-1.5 py-0.5 ${isInSelectedFlow ? 'border-white/15 bg-white/10' : 'border-amber-200 bg-white/70 text-amber-700'}`}>Near {group.nearSla}</span>}
                              </div>
                              <div className="relative z-10 mt-2 flex items-center justify-between gap-2">
                                <p className={`text-[10px] font-bold ${isInSelectedFlow ? 'text-white/50' : 'text-slate-500'}`}>{count ? 'click to filter' : 'empty group'}</p>
                                {isInSelectedFlow && <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[9px] font-black text-white/80">FILTER</span>}
                              </div>
                            </button>
                            {false && groupIndex < dashboardPipelineGroups.length - 1 && (
                              <div className="hidden items-center justify-center gap-1 text-[10px] font-black text-slate-300 2xl:flex">
                                <span>→</span>
                              </div>
                            )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {(selectedDashboardGroup || selectedDashboardStageGroup) && (() => {
                      const expandedGroup = selectedDashboardGroup || selectedDashboardStageGroup;
                      if (!expandedGroup) return null;
                      return (
                      <div className="mt-4 rounded-xl border border-slate-300/80 bg-slate-200/50 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[13px] font-black text-slate-950">{expandedGroup.label}</p>
                            <p className="mt-1 text-[11px] font-medium text-slate-500">Stage ย่อยทั้งหมดในกลุ่มนี้</p>
                          </div>
                          <span className="rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700">{expandedGroup.stages.length} steps</span>
                        </div>
                        <div className="flex flex-wrap items-stretch gap-2">
                          {expandedGroup.stages.map((stage: any, index: number) => {
                            const visual = stageVisual(stage);
                            const isStageSelected = selectedDashboardStageCode === stage.code;
                            const stageCount = stage.projects.length;
                            const stagePercent = Math.round((stageCount / dashboardStageTotal) * 100);
                            const stageRiskCount = stage.blocked + stage.nearSla + stage.overSla;
                            return (
                              <div key={stage.code} className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setDashboardStageFilter(isStageSelected ? expandedGroup.key : `stage:${stage.code}`);
                                  setDashboardProjectPage(1);
                                }}
                                className={`relative h-[150px] w-[300px] overflow-hidden rounded-lg border px-3 py-3 text-left shadow-sm shadow-slate-300/30 transition-all ${isStageSelected ? 'border-slate-950 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white shadow-md' : `border-slate-300/80 bg-gradient-to-br ${visual.gradient.replace("via-white", "via-slate-50").replace("to-white", "to-slate-100")} hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-md hover:shadow-slate-300/40`}`}
                              >
                                <div className={`pointer-events-none absolute -bottom-12 -right-10 h-32 w-32 rounded-full bg-gradient-to-br ${visual.gradient} ${isStageSelected ? 'opacity-30' : 'opacity-[0.18]'}`}></div>
                                <div className={`pointer-events-none absolute -bottom-8 -right-6 ${isStageSelected ? 'text-white/10' : 'text-white/60'} [&_svg]:h-28 [&_svg]:w-28`}>
                                  <StageIcon name={visual.icon} />
                                </div>
                                <div className="relative z-10 flex items-start justify-between gap-3">
                                  <div className="flex min-w-0 gap-2">
                                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${isStageSelected ? 'border-white/20 bg-white/10 text-white' : visual.iconClass}`}>
                                    <StageIcon name={visual.icon} />
                                  </span>
                                  <div className="min-w-0">
                                    <p className={`truncate text-[12px] font-extrabold ${isStageSelected ? 'text-white' : 'text-slate-950'}`}>{stage.name}</p>
                                    <p className={`mt-1 font-mono text-[9px] font-bold uppercase ${isStageSelected ? 'text-white/50' : 'text-slate-400'}`}>{index + 1}. {stage.code}</p>
                                  </div>
                                  </div>
                                  <div className="shrink-0 text-right">
                                    <p className={`text-xl font-black ${isStageSelected ? 'text-white' : stageCount ? 'text-slate-950' : 'text-slate-300'}`}>{stageCount}</p>
                                    <p className={`text-[10px] font-bold ${isStageSelected ? 'text-white/55' : 'text-slate-400'}`}>{stagePercent}%</p>
                                  </div>
                                </div>
                                <div className={`relative z-10 mt-3 h-2 overflow-hidden rounded-full ${isStageSelected ? 'bg-white/15' : 'bg-slate-200/80'}`}>
                                  <div
                                    className={`${stageRiskCount ? 'bg-blue-950' : stageCount ? 'bg-emerald-500' : 'bg-slate-300'} h-full rounded-full`}
                                    style={{ width: stageCount ? `${Math.max(5, stagePercent)}%` : '5%' }}
                                  ></div>
                                </div>
                                <div className={`relative z-10 mt-3 flex min-h-[24px] flex-wrap content-start gap-1.5 text-[10px] font-bold ${isStageSelected ? 'text-white/75' : 'text-slate-500'}`}>
                                  <span className={`rounded border px-1.5 py-0.5 ${isStageSelected ? 'border-white/15 bg-white/10' : 'border-slate-200 bg-slate-50'}`}>Active {stage.active}</span>
                                  {stage.completed > 0 && <span className={`rounded border px-1.5 py-0.5 ${isStageSelected ? 'border-white/15 bg-white/10' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>Done {stage.completed}</span>}
                                  {stage.blocked > 0 && <span className={`rounded border px-1.5 py-0.5 ${isStageSelected ? 'border-white/15 bg-white/10' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>Blocked {stage.blocked}</span>}
                                  {stage.overSla > 0 && <span className={`rounded border px-1.5 py-0.5 ${isStageSelected ? 'border-white/15 bg-white/10' : 'border-rose-200 bg-white text-rose-700'}`}>Over {stage.overSla}</span>}
                                  {stage.nearSla > 0 && <span className={`rounded border px-1.5 py-0.5 ${isStageSelected ? 'border-white/15 bg-white/10' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>Near {stage.nearSla}</span>}
                                </div>
                              </button>
                              {false && (
                                <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-[15px] font-black text-slate-400 md:flex">
                                  →
                                </div>
                              )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      );
                    })()}
                  </div>

                  <div className="bg-slate-50 p-5">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[16px] font-black text-slate-950">
                          {selectedDashboardStage ? `Project ที่อยู่ใน ${selectedDashboardStage.name}` : selectedDashboardGroup ? `Project ที่อยู่ใน ${selectedDashboardGroup.label}` : 'Project list'}
                        </p>
                        <p className="mt-1 text-[11px] font-medium text-slate-500">Customer, พื้นที่ และตำแหน่งบน workflow ในบรรทัดเดียว</p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <select
                          value={dashboardProjectsPerPage}
                          onChange={(event) => {
                            setDashboardProjectsPerPage(Number(event.target.value));
                            setDashboardProjectPage(1);
                          }}
                          className="h-9 rounded-md border border-slate-300 bg-slate-50 px-2.5 text-[11px] font-bold text-slate-700 outline-none focus:border-emerald-400"
                        >
                          {[10, 12, 20, 50].map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
                        </select>
                        {dashboardStageFilter !== "ALL" && (
                          <button
                            type="button"
                            onClick={() => {
                              setDashboardStageFilter("ALL");
                              setDashboardProjectPage(1);
                            }}
                            className="rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
                          >
                            ล้าง filter
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-slate-300/80 bg-slate-50">
                      <div className="hidden grid-cols-[150px_minmax(180px,1fr)_170px_150px_minmax(280px,1.2fr)_92px] gap-4 border-b border-slate-200 bg-slate-200/70 px-4 py-2.5 text-[10px] font-black uppercase tracking-wide text-slate-500 xl:grid">
                        <span>Customer code</span>
                        <span>ชื่อลูกค้า</span>
                        <span>พื้นที่</span>
                        <span>Stage</span>
                        <span>Mini rail</span>
                        <span className="text-right">SLA</span>
                      </div>
                      <div className="divide-y divide-slate-200">
                      {dashboardStageProjects.length === 0 ? (
                        <div className="px-4 py-10 text-center text-[12px] font-medium text-slate-400">ไม่มี project ใน filter นี้</div>
                      ) : pagedDashboardStageProjects.map((project: any) => {
                        const stage = Array.isArray(project.current_stage) ? project.current_stage[0] : project.current_stage;
                        const isRisk = stage?.status === 'BLOCKED' || stage?.sla_status === 'OVER_SLA' || project.sla_status === 'OVER_SLA';
                        const isNear = stage?.sla_status === 'NEAR_SLA' || project.sla_status === 'NEAR_SLA';
                        const customerIntake = project.customer_intake || {};
                        const district = customerIntake.siteDistrict || "-";
                        const province = customerIntake.siteProvince || "-";
                        const currentGroup = dashboardPipelineGroups.find((group: any) => group.codes.includes(stage?.code) || group.stages.some((groupStage: any) => groupStage.code === stage?.code));
                        const currentGroupOrder = Number(currentGroup?.order || 0);
                        return (
                          <button
                            key={project.id}
                            type="button"
                            onClick={() => handleSelectProject(project)}
                            className={`grid w-full gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-100 xl:grid-cols-[150px_minmax(180px,1fr)_170px_150px_minmax(280px,1.2fr)_92px] xl:items-center ${isRisk ? 'bg-rose-50/55' : isNear ? 'bg-amber-50/45' : 'bg-slate-50'}`}
                          >
                            <div className="min-w-0">
                              <p className="truncate text-[12px] font-extrabold text-slate-950">{project.customer_code}</p>
                              <p className="mt-1 text-[10px] font-bold uppercase text-slate-400 xl:hidden">{stage ? stageDisplay(stage).title : 'ยังไม่มี stage'}</p>
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-extrabold text-slate-900">{project.customer_name || 'ยังไม่มีชื่อลูกค้า'}</p>
                              <p className="mt-1 text-[10px] font-semibold text-slate-400 xl:hidden">อ.{district} จ.{province}</p>
                            </div>
                            <div className="hidden min-w-0 xl:block">
                              <p className="truncate text-[11px] font-bold text-slate-700">อ.{district}</p>
                              <p className="mt-1 truncate text-[10px] font-semibold text-slate-400">จ.{province}</p>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-extrabold text-slate-600">{stage ? stageDisplay(stage).title : 'ยังไม่มี stage'}</span>
                              {isRisk && <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">Risk</span>}
                              {!isRisk && isNear && <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">Near SLA</span>}
                            </div>
                            <CompactWorkflowMiniRail groups={dashboardPipelineGroups} currentGroup={currentGroup} currentGroupOrder={currentGroupOrder} />
                            <div className="shrink-0 text-right">
                              <p className={`text-[11px] font-bold ${isRisk ? 'text-rose-600' : isNear ? 'text-amber-600' : 'text-emerald-600'}`}>{statusLabel(stage?.sla_status || project.sla_status || 'ON_TRACK')}</p>
                              <p className="mt-1 text-[10px] font-semibold text-slate-400">{stage?.due_at ? formatDateTime(stage.due_at) : 'ไม่มี deadline'}</p>
                            </div>
                          </button>
                        );
                      })}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-col gap-2 text-[11px] font-semibold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                      <span>
                        แสดง {dashboardProjectStartIndex + (dashboardStageProjects.length ? 1 : 0)}-{dashboardProjectEndIndex} จาก {dashboardStageProjects.length} project
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setDashboardProjectPage((page) => Math.max(1, page - 1))}
                          disabled={normalizedDashboardProjectPage <= 1}
                          className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                        >
                          ก่อนหน้า
                        </button>
                        <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-600">
                          หน้า {normalizedDashboardProjectPage} / {dashboardProjectPageCount}
                        </span>
                        <button
                          type="button"
                          onClick={() => setDashboardProjectPage((page) => Math.min(dashboardProjectPageCount, page + 1))}
                          disabled={normalizedDashboardProjectPage >= dashboardProjectPageCount}
                          className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                        >
                          ถัดไป
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/*
              <div>
	              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
	                <div className="border-b border-slate-100 px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
  	                  <div>
  	                    <h3 className="text-[14px] font-bold text-slate-950">รายการปัญหาที่ต้องจัดการ</h3>
  	                    <p className="text-[12px] text-slate-500">ปัญหาที่ยังเปิดอยู่ พร้อมผู้รับผิดชอบและสถานะการแก้ไข</p>
  	                  </div>
  	                  <span className={`rounded-md border px-2.5 py-1 text-[11px] font-bold ${exceptions.length ? 'border-rose-100 bg-rose-50 text-rose-700' : 'border-emerald-100 bg-emerald-50 text-emerald-700'}`}>
  	                    {exceptions.length ? `${filteredExceptions.length}/${exceptions.length} รายการ` : 'ไม่มีค้าง'}
  	                  </span>
                    </div>
                    <div className="mt-4 grid gap-2 md:grid-cols-[repeat(3,minmax(0,160px))_1fr]">
                      {[
                        { label: 'เปิดอยู่', value: exceptionStatusCounts.OPEN || 0, className: 'text-rose-600' },
                        { label: 'รับทราบแล้ว', value: exceptionStatusCounts.ACKNOWLEDGED || 0, className: 'text-amber-600' },
                        { label: 'กำลังแก้', value: exceptionStatusCounts.IN_PROGRESS || 0, className: 'text-sky-600' },
                      ].map((item) => (
                        <div key={item.label} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{item.label}</p>
                          <p className={`mt-1 text-lg font-bold ${item.className}`}>{item.value}</p>
                        </div>
                      ))}
                      <div className="grid gap-2 sm:grid-cols-3">
                        <select
                          value={exceptionFilters.status}
                          onChange={(event) => setExceptionFilters((current) => ({ ...current, status: event.target.value }))}
                          className="h-10 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 outline-none focus:border-emerald-400"
                        >
                          <option value="ALL">ทุกสถานะ</option>
                          <option value="OPEN">เปิดอยู่</option>
                          <option value="ACKNOWLEDGED">รับทราบแล้ว</option>
                          <option value="IN_PROGRESS">กำลังแก้</option>
                        </select>
                        <select
                          value={exceptionFilters.severity}
                          onChange={(event) => setExceptionFilters((current) => ({ ...current, severity: event.target.value }))}
                          className="h-10 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 outline-none focus:border-emerald-400"
                        >
                          <option value="ALL">ทุกระดับ</option>
                          {exceptionSeverityOptions.map((severity) => <option key={severity} value={severity}>{severityLabel(severity)}</option>)}
                        </select>
                        <select
                          value={exceptionFilters.category}
                          onChange={(event) => setExceptionFilters((current) => ({ ...current, category: event.target.value }))}
                          className="h-10 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 outline-none focus:border-emerald-400"
                        >
                          <option value="ALL">ทุกประเภท</option>
                          {exceptionCategoryOptions.map((category) => <option key={category} value={category}>{exceptionCategoryLabel(category)}</option>)}
                        </select>
                      </div>
                    </div>
	                </div>
	                {exceptions.length === 0 ? (
	                  <div className="px-5 py-8 text-center text-[13px] font-medium text-slate-400">ไม่มีปัญหาที่เปิดอยู่</div>
	                ) : filteredExceptions.length === 0 ? (
	                  <div className="px-5 py-8 text-center text-[13px] font-medium text-slate-400">ไม่มีปัญหาตามตัวกรองนี้</div>
	                ) : (
	                  <div className="divide-y divide-slate-100">
	                    {filteredExceptions.map((exception) => {
	                      const project = relatedProject(exception);
                        const stage = relatedStage(exception);
	                      return (
	                        <button
	                          key={exception.id}
                            type="button"
                            onClick={() => setSelectedException(exception)}
	                          className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50"
	                        >
	                          <div className="min-w-0">
	                            <div className="mb-2 flex flex-wrap items-center gap-2">
	                              <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${exceptionToneClass[exception.severity] || exceptionToneClass.INFO}`}>{severityLabel(exception.severity)}</span>
	                              <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{exceptionCategoryLabel(exception.category)}</span>
	                              <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{statusLabel(exception.status)}</span>
	                              <span className="text-[11px] font-semibold text-slate-400">{project?.customer_code || 'ไม่พบโครงการ'}{stage ? ` / ${stageDisplay(stage).title}` : ''}</span>
	                            </div>
	                            <p className="truncate text-[13px] font-bold text-slate-950">{exception.title}</p>
	                            {exception.description && <p className="mt-1 line-clamp-2 text-[12px] text-slate-500">{exception.description}</p>}
	                            <div className="mt-3 flex flex-wrap gap-2">
	                              <span className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600">เปิดรายละเอียด</span>
	                              {exception.status === 'OPEN' && (
	                                <span className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700">รอรับทราบ</span>
	                              )}
	                              {exception.status === 'IN_PROGRESS' && (
	                                <span className="rounded border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-700">กำลังแก้</span>
	                              )}
	                            </div>
	                          </div>
	                          <div className="shrink-0 text-right">
	                            <p className="text-[11px] font-bold text-slate-700">{stageOwner({ owner_role: exception.owner_role })}</p>
	                            <p className="mt-1 text-[11px] text-slate-400">{formatDateTime(exception.detected_at)}</p>
	                          </div>
	                        </button>
	                      );
	                    })}
	                  </div>
	                )}
	              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <div>
                    <h3 className="text-[14px] font-bold text-slate-950">คิวอนุมัติ</h3>
                    <p className="text-[12px] text-slate-500">คำขอ override ที่รอผู้มีสิทธิ์ตัดสินใจ</p>
                  </div>
                  <span className={`rounded-md border px-2.5 py-1 text-[11px] font-bold ${pendingApprovals.length ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-100 bg-emerald-50 text-emerald-700'}`}>
                    {pendingApprovals.length ? `${pendingApprovals.length} รออนุมัติ` : 'ไม่มีค้าง'}
                  </span>
                </div>
                {pendingApprovals.length === 0 ? (
                  <div className="px-5 py-8 text-center text-[13px] font-medium text-slate-400">ไม่มีคำขออนุมัติค้างอยู่</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {pendingApprovals.map((approval) => {
                      const project = Array.isArray(approval.projects) ? approval.projects[0] : approval.projects;
                      const stage = Array.isArray(approval.project_stages) ? approval.project_stages[0] : approval.project_stages;
                      const matchedProject = projects.find((item) => item.id === approval.project_id);
                      return (
                        <div key={approval.id} className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-4 px-5 py-3 text-left transition-colors hover:bg-slate-50">
                          <div className="min-w-0">
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">{workflowTypeLabel(approval.type)}</span>
                              <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{statusLabel(approval.status)}</span>
                              <span className="text-[11px] font-semibold text-slate-400">{project?.customer_code || 'ไม่พบโครงการ'}</span>
                              <span className="text-[11px] font-semibold text-slate-400">{stage ? stageDisplay(stage).title : 'ไม่พบ Stage'}</span>
                            </div>
                            <p className="line-clamp-2 text-[13px] font-bold text-slate-950">{approval.reason}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                onClick={() => matchedProject && handleSelectProject(matchedProject)}
                                disabled={!matchedProject}
                                className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                              >
                                เปิดโครงการ
                              </button>
                              <button
                                onClick={() => handleApprovalDecision(approval.id, 'APPROVED')}
                                disabled={Boolean(approvalLoading)}
                                className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {approvalLoading === `APPROVED:${approval.id}` ? 'กำลังอนุมัติ...' : 'อนุมัติ'}
                              </button>
                              <button
                                onClick={() => handleApprovalDecision(approval.id, 'REJECTED')}
                                disabled={Boolean(approvalLoading)}
                                className="rounded border border-rose-200 bg-white px-2 py-1 text-[11px] font-bold text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {approvalLoading === `REJECTED:${approval.id}` ? 'กำลังปฏิเสธ...' : 'ปฏิเสธ'}
                              </button>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[11px] font-bold text-slate-700">{project?.customer_name || 'ยังไม่กำหนด'}</p>
                            <p className="mt-1 text-[11px] text-slate-400">{approval.created_at ? new Date(approval.created_at).toLocaleDateString() : 'N/A'}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <NotificationPanel
                    notifications={notifications}
                    projects={projects}
                    filters={notificationFilters}
                    loadingId={notificationLoadingId}
                    refreshing={notificationRefreshing}
                    onFilterChange={(filters) => {
                      setNotificationFilters(filters);
                      fetchNotifications(filters);
                    }}
                    onRefresh={() => fetchNotifications()}
                    onMarkRead={handleMarkNotificationRead}
                    onOpenProject={async (notification) => {
                      const project = projects.find((item) => item.id === notification.project_id);
                      if (!project) {
                        showNotice('error', 'Project not found', 'Refresh projects and try again.');
                        return;
                      }
                      setActiveTab('projects');
                      await handleSelectProject(project);
                      if (notification.project_stage_id) setSelectedStageId(notification.project_stage_id);
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                    <div>
                      <h3 className="text-[14px] font-bold text-slate-950">คิวงานเสี่ยงที่ต้องจัดการ</h3>
                      <p className="text-[12px] text-slate-500">เรียงจาก SLA, Gate, เอกสาร, การอนุมัติ และงานภาคสนามที่กระทบงานมากที่สุด</p>
                    </div>
                    <span className={`rounded-md border px-2.5 py-1 text-[11px] font-bold ${commandQueue.length ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-100 bg-emerald-50 text-emerald-700'}`}>
                      {commandQueue.length ? `${commandQueue.length} รายการ` : 'ปกติ'}
                    </span>
                  </div>
                  {commandQueue.length === 0 ? (
                    <div className="px-5 py-8 text-center text-[13px] font-medium text-slate-400">ไม่มีงานเสี่ยงค้างในคิว</div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {commandQueue.map((item) => {
                        const matchedProject = projects.find((project) => project.id === item.project_id);
                        const toneClass = item.tone === 'rose'
                          ? 'border-rose-200 bg-rose-50 text-rose-700'
                          : item.tone === 'sky'
                            ? 'border-sky-200 bg-sky-50 text-sky-700'
                            : 'border-amber-200 bg-amber-50 text-amber-700';

                        return (
                          <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 px-5 py-3 transition-colors hover:bg-slate-50">
                            <div className="min-w-0">
                              <div className="mb-1 flex flex-wrap items-center gap-2">
                                <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${toneClass}`}>{item.label}</span>
                                {item.priority >= 80 && <span className="rounded border border-rose-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-rose-600">P{item.priority}</span>}
                                <span className="text-[11px] font-semibold text-slate-400">{item.subtitle}</span>
                              </div>
                              <p className="truncate text-[13px] font-bold text-slate-950">{item.title}</p>
                              <p className="mt-1 text-[12px] font-medium text-slate-500">{item.detail}</p>
                              <div className="mt-2 grid grid-cols-1 gap-1 text-[11px] font-semibold text-slate-500 sm:grid-cols-2">
                                <span>ผู้รับผิดชอบ: <b className="text-slate-800">{item.owner}</b></span>
                                <span>สิ่งที่ต้องทำ: <b className="text-slate-800">{item.action}</b></span>
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                if ('exception' in item && item.exception) {
                                  setSelectedException(item.exception);
                                  return;
                                }
                                if (matchedProject) handleSelectProject(matchedProject);
                              }}
                              disabled={!matchedProject && !('exception' in item && item.exception)}
                              className="self-center rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                            >
                              {'exception' in item && item.exception ? 'รายละเอียด' : 'เปิดดู'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="mb-5 text-[14px] font-bold text-slate-950">Portfolio Health</h3>
                  <div className="space-y-3">
                    {[
                      ['Active projects', activeProjects.length, 'bg-slate-500'],
                      ['Completed', completedProjects.length, 'bg-emerald-500'],
                      ['Over SLA', overSlaProjects.length, 'bg-rose-500'],
                      ['Near SLA', nearSlaProjects.length, 'bg-amber-500'],
                      ['Document risks', documentRisks.length, 'bg-sky-500'],
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
              */}
              </div>
          ) : activeTab === 'approvals' ? (
            <ApprovalCenter
              approvalItems={approvalItems}
              projects={projects}
              approvalLoading={approvalLoading}
              onOpenProject={handleSelectProject}
              onDecision={handleApprovalDecision}
            />
          ) : activeTab === 'field' ? (
            <div className="mx-auto max-w-[1200px] space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-[17px] font-bold text-slate-950">งานหน้างานสำหรับช่าง</h3>
                  <p className="text-[12px] text-slate-500">Field jobs, check-in, gate completion, and evidence upload.</p>
                </div>
                <button
                  onClick={() => fetchFieldJobs()}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                >
                  <svg className="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  รีเฟรช
                </button>
              </div>

              <UploadRetryQueue
                items={uploadRetryItems}
                processingId={processingUploadRetryId}
                onRetry={processUploadRetry}
                onRemove={async (item) => {
                  await removeUploadRetryItem(item.id);
                  await refreshUploadRetryQueue();
                }}
              />

              {fieldJobs.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-white p-10 text-center shadow-sm">
                  <p className="text-[14px] font-bold text-slate-950">ยังไม่มีงานภาคสนามพร้อมทำ</p>
                  <p className="mt-2 text-[12px] text-slate-500">งานติดตั้งหรือขั้นตอนภาคสนามจะแสดงที่นี่เมื่อมีการมอบหมาย</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {fieldJobs.map((job) => {
                    const project = relatedProject(job);
                    const checklists = job.checklists || [];
                    const documents = sortProjectDocuments(job.documents || []).filter(isActiveDocumentVersion);
                    const uploadableDocuments = documents.filter(canUploadDocument);
                    const gateItems = [...checklists, ...documents];
                    const passedGates = gateItems.filter(gateItemPassed).length;
                    const checkedIn = fieldJobCheckIn(job);
                    const display = stageDisplay(job);
                    const visual = stageVisual(job);
                    const isBlocked = job.status === 'BLOCKED';
                    const isOverSla = job.sla_status === 'OVER_SLA';
                    const readyToSubmit = (gateItems.length === 0 || passedGates === gateItems.length) && Boolean(checkedIn);

                    return (
                      <div key={job.id} className={`overflow-hidden rounded-lg border bg-white shadow-sm ${isBlocked || isOverSla ? 'border-rose-200' : 'border-slate-200'}`}>
                        <div className={`border-b px-4 py-3 ${isBlocked || isOverSla ? 'border-rose-100 bg-rose-50/60' : 'border-slate-100 bg-slate-50/70'}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${visual.iconClass}`}>
                                  <StageIcon name={visual.icon} />
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate text-[14px] font-bold text-slate-950">{display.title}</p>
                                  <p className="truncate text-[11px] font-semibold text-slate-500">{project?.customer_code || 'N/A'} / {project?.customer_name || 'ไม่พบโครงการ'}</p>
                                </div>
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                              <span className={`rounded border px-2 py-1 text-[10px] font-bold ${projectStageToneClass(job)}`}>{job.sla_status || 'ON_TRACK'}</span>
                              {isBlocked && <span className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700">BLOCKED</span>}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-px border-b border-slate-100 bg-slate-100 text-[12px]">
                          <div className="bg-white px-4 py-3">
                            <p className="text-[11px] font-medium text-slate-500">Owner</p>
                            <p className="mt-1 font-bold text-slate-950">{stageOwner(job)}</p>
                          </div>
                          <div className="bg-white px-4 py-3">
                            <p className="text-[11px] font-medium text-slate-500">Elapsed</p>
                            <p className={`mt-1 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold ${runningStageTextClass(job)}`}>
                              <StageIcon name="wait" />
                              {runningStageLabel(job)}
                            </p>
                          </div>
                          <div className="bg-white px-4 py-3">
                            <p className="text-[11px] font-medium text-slate-500">SLA</p>
                            <p className="mt-1 font-bold text-slate-950">{formatSlaDuration(job.workflow_definitions?.sla_hours)}</p>
                          </div>
                          <div className="bg-white px-4 py-3">
                            <p className="text-[11px] font-medium text-slate-500">Deadline</p>
                            <p className="mt-1 font-bold text-slate-950">{job.due_at ? new Date(job.due_at).toLocaleDateString() : 'N/A'}</p>
                          </div>
                        </div>

                        <div className="space-y-4 px-4 py-4">
                          <div className="grid grid-cols-3 gap-2">
                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Check-in</p>
                              <p className={`mt-1 text-[12px] font-bold ${checkedIn ? 'text-emerald-700' : 'text-slate-500'}`}>{checkedIn ? 'DONE' : 'WAITING'}</p>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Gates</p>
                              <p className={`mt-1 text-[12px] font-bold ${passedGates === gateItems.length && gateItems.length ? 'text-emerald-700' : 'text-amber-700'}`}>{passedGates}/{gateItems.length}</p>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">อัปโหลด</p>
                              <p className={`mt-1 text-[12px] font-bold ${uploadableDocuments.length ? 'text-amber-700' : 'text-emerald-700'}`}>{uploadableDocuments.length} left</p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleFieldCheckIn(job)}
                            disabled={Boolean(checkedIn) || checkingInStageId === job.id}
                            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                          >
                            <StageIcon name="pin" />
                              {checkingInStageId === job.id ? 'กำลัง Check-in...' : checkedIn ? `Check-in แล้ว ${formatDateTime(checkedIn.checked_in_at)}` : 'Check-in หน้างาน'}
                          </button>

                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[12px] font-bold text-slate-950">Checklist gates</p>
                            <span className="text-[11px] font-semibold text-slate-500">{checklists.filter(isGatePassed).length}/{checklists.length}</span>
                          </div>

                          {checklists.length > 0 && (
                            <div className="space-y-2">
                              {checklists.slice(0, 4).map((checklist: any) => (
                                <div key={checklist.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-slate-100 bg-slate-50/60 px-3 py-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-[12px] font-bold text-slate-900">{checklist.label}</p>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${gateSeverityClass(checklist.gate_severity)}`}>{checklist.gate_severity || 'INFO'}</span>
                                      <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${gateStatusClass(checklist.status)}`}>{checklist.status}</span>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handlePassChecklist(checklist.id)}
                                    disabled={checklist.status === 'PASSED'}
                                    className={`min-h-10 rounded-md px-3 py-2 text-[11px] font-bold shadow-sm ${checklist.status === 'PASSED' ? 'border border-emerald-100 bg-emerald-50 text-emerald-700' : 'bg-emerald-500 text-white hover:bg-emerald-600'}`}
                                  >
                                    {checklist.status === 'PASSED' ? 'Passed' : 'Mark passed'}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[12px] font-bold text-slate-950">Required documents</p>
                            <span className="text-[11px] font-semibold text-slate-500">{uploadableDocuments.length}/{documents.length} pending</span>
                          </div>

                          {documents.length === 0 ? (
                            <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-3 text-[12px] font-medium text-slate-500">
                              This stage has no required documents.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {documents.slice(0, 4).map((document) => (
                                <div key={document.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-slate-100 bg-slate-50/60 px-3 py-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-[12px] font-bold text-slate-900">{document.name}</p>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${gateSeverityClass(document.gate_severity)}`}>{document.gate_severity || 'INFO'}</span>
                                      <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${documentStatusClass(document.status)}`}>{document.status}</span>
                                      <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-bold text-slate-500">V{document.version_number || 1}</span>
                                    </div>
                                  </div>
                                  {canUploadDocument(document) ? (
                                    <label className="cursor-pointer rounded-md bg-emerald-500 px-3 py-2 text-[11px] font-bold text-white shadow-sm transition-colors hover:bg-emerald-600">
                                      อัปโหลด
                                      <input
                                        type="file"
                                        className="hidden"
                                        onChange={(e) => handleFileUpload(job, e, document.id, project)}
                                        disabled={uploadingMilestoneId === job.id}
                                      />
                                    </label>
                                  ) : (
                                    <span className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-500">เรียบร้อย</span>
                                  )}
                                </div>
                              ))}
                              {documents.length > 4 && (
                                <p className="text-[11px] font-medium text-slate-500">+{documents.length - 4} more documents in this stage</p>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="grid gap-2 border-t border-slate-100 px-4 py-3 sm:grid-cols-[1fr_auto]">
                          <button
                            type="button"
                            onClick={() => handleCompleteFieldJob(job)}
                            disabled={!readyToSubmit || completingStageId === job.id}
                            className="min-h-12 rounded-lg bg-emerald-600 px-4 py-3 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                          >
                            {completingStageId === job.id ? 'กำลังส่งงาน...' : readyToSubmit ? 'ส่งงานขั้นตอนนี้' : 'ต้อง Check-in และทำ gate ให้ครบ'}
                          </button>
                          <button
                            onClick={async () => {
                              if (!project) return;
                              setActiveTab('projects');
                              await handleSelectProject(project);
                              setSelectedStageId(job.id);
                            }}
                            className="min-h-12 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                          >
                            เปิดรายละเอียด
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : activeTab === 'scheduling' ? (
            <div className="mx-auto max-w-[1680px] space-y-3">
              <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[16px] font-extrabold text-slate-950">Team Monitor</h3>
                      <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">ติดตั้งรายวัน</span>
                    </div>
                    <p className="mt-1 text-[12px] text-slate-500">เลือกทีม ตรวจวันว่าง และลากงานไปลงวันที่ต้องติดตั้ง</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600">
                      งาน {filteredSchedulingItems.length}
                    </span>
                    <span className={`rounded-md border px-3 py-2 text-[11px] font-bold ${schedulingRiskCount ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                      SLA {schedulingRiskCount}
                    </span>
                    <span className={`rounded-md border px-3 py-2 text-[11px] font-bold ${schedulingConflictCount ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                      ชนทีม {schedulingConflictCount}
                    </span>
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600">
                      รอจอง {unscheduledSchedulingItems.length}
                    </span>
                    <button
                      onClick={() => {
                        fetchSchedulingItems();
                        fetchResourceTeams();
                      }}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                    >
                      <svg className="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      รีเฟรช
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 px-4 py-3 lg:grid-cols-[200px_200px_minmax(280px,1fr)_84px]">
                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-bold text-slate-500">ทีม</span>
                    <select
                      value={scheduleTeamFilter}
                      onChange={(event) => setScheduleTeamFilter(event.target.value)}
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 outline-none focus:border-emerald-400"
                    >
                      <option value="ALL">ทุกทีม</option>
                      {resourceTeams.filter((team) => team.is_active).map((team) => (
                        <option key={team.id} value={team.id}>{team.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-bold text-slate-500">สถานะ</span>
                    <select
                      value={scheduleStatusFilter}
                      onChange={(event) => setScheduleStatusFilter(event.target.value)}
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 outline-none focus:border-emerald-400"
                    >
                      <option value="ALL">ทั้งหมด</option>
                      <option value="SCHEDULED">จองวันแล้ว</option>
                      <option value="UNSCHEDULED">ยังไม่จองวัน</option>
                      <option value="RISK">เสี่ยง / ชนทีม</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-bold text-slate-500">ค้นหา</span>
                    <input
                      value={scheduleSearch}
                      onChange={(event) => setScheduleSearch(event.target.value)}
                      placeholder="รหัสลูกค้า ชื่อลูกค้า เบอร์โทร หรือ stage"
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 outline-none placeholder:text-slate-400 focus:border-emerald-400"
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => {
                        setScheduleTeamFilter("ALL");
                        setScheduleStatusFilter("ALL");
                        setScheduleSearch("");
                      }}
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-600 shadow-sm hover:bg-slate-50"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </div>

              {focusedScheduleStageId && (
                <div className="flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[13px] font-bold text-emerald-900">กำลังเลือกวันสำหรับงานที่เปิดมาจาก Project</p>
                    <p className="mt-1 text-[11px] font-semibold text-emerald-700">ดูช่องว่างใน Resource Calendar ก่อนเลือกวันและทีม งานนี้จะถูกไฮไลต์ไว้ในตารางหรือรายการด้านล่าง</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFocusedScheduleStageId(null)}
                    className="h-9 rounded-md border border-emerald-200 bg-white px-3 text-[11px] font-bold text-emerald-700 shadow-sm hover:bg-emerald-100"
                  >
                    เลิกไฮไลต์
                  </button>
                </div>
              )}

              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className="text-[15px] font-extrabold text-slate-950">ตารางทีมติดตั้ง {scheduleRangeDays} วัน</h3>
                    <p className="text-[12px] text-slate-500">แสดงช่วง {scheduleWindowLabel} · นับจากวันเริ่มของช่วงนี้ไปอีก {scheduleRangeDays} วัน · 1 ช่อง = 1 วัน</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex overflow-hidden rounded-md border border-slate-200 bg-white">
                      <button
                        type="button"
                        onClick={() => setScheduleWindowOffset((current) => current - scheduleRangeDays)}
                        className="h-8 border-r border-slate-200 px-3 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                      >
                        ก่อนหน้า
                      </button>
                      <button
                        type="button"
                        onClick={() => setScheduleWindowOffset(0)}
                        className="h-8 border-r border-slate-200 px-3 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                      >
                        วันนี้
                      </button>
                      <button
                        type="button"
                        onClick={() => setScheduleWindowOffset((current) => current + scheduleRangeDays)}
                        className="h-8 px-3 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                      >
                        ถัดไป
                      </button>
                    </div>
                    <div className="inline-flex overflow-hidden rounded-md border border-slate-200 bg-slate-50 p-0.5">
                      {[7, 15, 30].map((days) => (
                        <button
                          key={days}
                          type="button"
                          onClick={() => {
                            setScheduleRangeDays(days as 7 | 15 | 30);
                            setScheduleWindowOffset(0);
                          }}
                          className={`h-8 px-3 text-[11px] font-bold transition-colors ${scheduleRangeDays === days ? 'rounded bg-slate-950 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                        >
                          {days} วัน
                        </button>
                      ))}
                    </div>
                    <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">หน่วยงานติดตั้ง: รายวัน</span>
                  </div>
                </div>
                <div className="grid gap-0 lg:grid-cols-[280px_minmax(0,1fr)]">
                  <div className="border-b border-slate-100 bg-slate-50/60 lg:border-b-0 lg:border-r">
                    <div className="flex h-12 items-center justify-between border-b border-slate-200 bg-white px-4">
                      <div>
                        <p className="text-[12px] font-extrabold text-slate-950">งานติดตั้ง</p>
                        <p className="text-[10px] font-semibold text-slate-400">{filteredSchedulingItems.length} รายการ</p>
                      </div>
                      <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-500">{unscheduledSchedulingItems.length} รอจอง</span>
                    </div>
                    <div className="max-h-[590px] overflow-y-auto">
                      {filteredSchedulingItems.length === 0 ? (
                        <div className="px-5 py-12 text-center">
                          <p className="text-[13px] font-bold text-slate-500">ไม่พบงาน</p>
                          <p className="mt-1 text-[11px] font-semibold text-slate-400">ลองเปลี่ยนทีม สถานะ หรือคำค้นหา</p>
                        </div>
                      ) : filteredSchedulingItems.map((item, index) => {
                        const project = relatedProject(item);
                        const range = scheduleBookingRange(item);
                        const draft = scheduleDraftFor(item);
                        const isFocused = focusedScheduleStageId === item.id;
                        const isRisk = item.status === "BLOCKED" || item.sla_status === "OVER_SLA" || item.sla_status === "NEAR_SLA";
                        return (
                          <button
                            key={item.id}
                            type="button"
                            draggable
                            onDragStart={(event) => {
                              setDraggedScheduleId(item.id);
                              event.dataTransfer.setData("text/plain", item.id);
                              event.dataTransfer.effectAllowed = "move";
                            }}
                            onDragEnd={() => setDraggedScheduleId(null)}
                            onClick={() => {
                              setFocusedScheduleStageId(item.id);
                              setEditingScheduleStageId(item.id);
                              setScheduleDrafts((current) => ({
                                ...current,
                                [item.id]: current[item.id] || {
                                  scheduledStart: draft.scheduledStart,
                                  scheduledEnd: draft.scheduledEnd || draft.scheduledStart,
                                  resourceTeamId: draft.resourceTeamId,
                                },
                              }));
                            }}
                            className={`block w-full border-b border-slate-200 bg-white px-3 py-3 text-left transition hover:bg-emerald-50/50 ${isFocused ? "bg-emerald-50 ring-1 ring-inset ring-emerald-300" : ""}`}
                          >
                            <div className="flex items-start gap-3">
                              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border text-[11px] font-black ${isRisk ? "border-rose-200 bg-rose-50 text-rose-600" : "border-emerald-200 bg-emerald-50 text-emerald-600"}`}>{index + 1}</span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="truncate text-[12px] font-extrabold text-slate-950">{project?.customer_code || "N/A"}</p>
                                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${range ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{range ? "จองแล้ว" : "รอจอง"}</span>
                                </div>
                                <p className="mt-1 truncate text-[11px] font-semibold text-slate-700">{project?.customer_name || "ไม่ระบุชื่อลูกค้า"}</p>
                                <p className="mt-1 truncate text-[10px] text-slate-500">{stageDisplay(item).title} · {range ? `${range.startKey} - ${range.endKey}` : "ยังไม่จองวัน"}</p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="p-3">
                    <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-semibold text-slate-500">
                      <span>เลื่อนซ้าย-ขวาเพื่อดูทุกวันในช่วง {scheduleRangeDays} วัน</span>
                      <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-500">{scheduleWindowLabel}</span>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-slate-200 pb-2">
                      <div className="min-w-max">
                    <div
                      className="grid border-b border-slate-200 bg-slate-50"
                      style={{ gridTemplateColumns: `160px repeat(${scheduleRangeDays}, minmax(${scheduleRangeDays === 30 ? 72 : scheduleRangeDays === 15 ? 92 : 118}px, 1fr))` }}
                    >
                      <div className="sticky left-0 z-20 border-r border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-bold text-slate-500">ทีม</div>
                      {scheduleDayKeys.map((dayKey, index) => (
                        <div key={dayKey} className={`border-r border-slate-200 px-2 py-2.5 text-center ${index === 0 ? 'bg-emerald-50/70' : ''}`}>
                          <p className="text-[11px] font-extrabold text-slate-900">{formatScheduleDayLabel(dayKey)}</p>
                          <p className="mt-0.5 text-[9px] font-bold uppercase text-slate-400">{index === 0 ? 'วันนี้' : scheduleRangeDays === 30 ? '' : scheduleDateKeyOffset(dayKey, 0).slice(5)}</p>
                        </div>
                      ))}
                    </div>
                    {scheduleTeamRows.length === 0 ? (
                      <div className="px-4 py-10 text-center text-[12px] font-medium text-slate-400">ยังไม่มีทีมสำหรับแสดงตาราง</div>
                    ) : scheduleTeamRows.map((row) => (
                      <div
                        key={row.team.id || "unassigned"}
                        className="grid border-b border-slate-100 last:border-b-0"
                        style={{
                          gridTemplateColumns: `160px repeat(${scheduleRangeDays}, minmax(${scheduleRangeDays === 30 ? 72 : scheduleRangeDays === 15 ? 92 : 118}px, 1fr))`,
                          minHeight: `${Math.max(64, row.laneCount * 40 + 22)}px`,
                        }}
                      >
                        <div className="sticky left-0 z-20 border-r border-slate-200 bg-white px-3 py-3">
                          <p className="truncate text-[12px] font-extrabold text-slate-950">{row.team.name}</p>
                          <p className="mt-1 truncate text-[10px] font-semibold text-slate-400">{row.team.territory || 'ทุกพื้นที่'}</p>
                          <p className="mt-2 w-fit rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-bold text-slate-500">{row.laneBookings.length} งาน · รับได้ {row.team.daily_capacity || 1}/วัน</p>
                        </div>
                        {scheduleDayKeys.map((dayKey, index) => (
                          <div
                            key={`${row.team.id || "unassigned"}-${dayKey}`}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => { event.preventDefault(); handleScheduleBookingDrop(dayKey, row.team.id || "", event.dataTransfer.getData('text/plain') || draggedScheduleId); }}
                            className={`border-r border-slate-100 transition-colors ${draggedScheduleId ? 'bg-emerald-50/60' : index === 0 ? 'bg-emerald-50/30' : 'bg-white'}`}
                          />
                        ))}
                        {row.laneBookings.map((booking) => {
                          const project = relatedProject(booking.item);
                          const draft = scheduleDraftFor(booking.item);
                          const risk = booking.item.status === 'BLOCKED' || booking.item.sla_status === 'OVER_SLA';
                          const isFocused = focusedScheduleStageId === booking.item.id;
                          const isEditing = editingScheduleStageId === booking.item.id;
                          const hasConflict = scheduleBookings.some((other) => other.item.id !== booking.item.id && (other.resourceTeamId || "") === (booking.resourceTeamId || "") && other.visibleStartIndex <= booking.visibleEndIndex && other.visibleEndIndex >= booking.visibleStartIndex);
                          const startsBefore = booking.startKey < scheduleFirstDayKey;
                          const endsAfter = booking.endKey > scheduleLastDayKey;
                          return (
                            <div
                              key={booking.item.id}
                              draggable
                              onDragStart={(event) => { setDraggedScheduleId(booking.item.id); event.dataTransfer.setData('text/plain', booking.item.id); event.dataTransfer.effectAllowed = 'move'; }}
                              onDragEnd={() => setDraggedScheduleId(null)}
                              className={`z-10 mx-1 h-8 cursor-grab overflow-hidden rounded-md border px-2 py-1 shadow-sm transition active:cursor-grabbing ${hasConflict ? 'border-rose-300 bg-rose-50 text-rose-800' : risk ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-emerald-300 bg-emerald-50 text-emerald-800'} ${isFocused || isEditing ? 'ring-2 ring-emerald-400 ring-offset-1' : ''} ${draggedScheduleId === booking.item.id ? 'opacity-60' : 'hover:shadow-md'}`}
                              style={{
                                gridColumn: `${booking.visibleStartIndex + 2} / span ${booking.visibleEndIndex - booking.visibleStartIndex + 1}`,
                                gridRow: 1,
                                marginTop: `${10 + booking.laneIndex * 40}px`,
                              }}
                              title={`${project?.customer_code || 'N/A'} ${project?.customer_name || 'ไม่ระบุชื่อลูกค้า'} ${booking.startKey} - ${booking.endKey}`}
                            >
                              <div className="flex h-full min-w-0 items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-[11px] font-extrabold">{startsBefore ? '← ' : ''}{project?.customer_code || 'N/A'} · {project?.customer_name || 'ไม่ระบุชื่อลูกค้า'}{endsAfter ? ' →' : ''}</p>
                                  <p className="truncate text-[9px] font-bold opacity-75">{booking.totalDays} วัน · {draft.resourceTeamId ? resourceTeams.find((team) => team.id === draft.resourceTeamId)?.name || '-' : 'ยังไม่กำหนดทีม'}</p>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                  {hasConflict && <span className="rounded bg-white/70 px-1.5 py-0.5 text-[9px] font-extrabold">ชน</span>}
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setEditingScheduleStageId(booking.item.id);
                                      setFocusedScheduleStageId(booking.item.id);
                                      setScheduleDrafts((current) => ({
                                        ...current,
                                        [booking.item.id]: current[booking.item.id] || {
                                          scheduledStart: booking.startKey,
                                          scheduledEnd: booking.endKey,
                                          resourceTeamId: booking.resourceTeamId || "",
                                        },
                                      }));
                                    }}
                                    onDragStart={(event) => event.stopPropagation()}
                                    className="rounded bg-white/80 px-1.5 py-0.5 text-[9px] font-extrabold shadow-sm hover:bg-white"
                                  >
                                    Edit
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                      </div>
                    </div>
                  </div>
                </div>
                {editingScheduleItem && (() => {
                  const project = relatedProject(editingScheduleItem);
                  const draft = scheduleDraftFor(editingScheduleItem);
                  const isReschedule = scheduleDatesChanged(editingScheduleItem, draft);
                  return (
                    <div className="border-t border-emerald-100 bg-emerald-50/50 px-4 py-4">
                      <div className="rounded-lg border border-emerald-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0">
                            <p className="text-[13px] font-extrabold text-slate-950">Edit schedule: {project?.customer_code || 'N/A'} · {project?.customer_name || 'ไม่ระบุชื่อลูกค้า'}</p>
                            <p className="mt-1 text-[11px] font-semibold text-emerald-700">เปลี่ยนวันเริ่ม วันสิ้นสุด และทีม แล้วกดบันทึกเพื่ออัปเดต bar บน calendar</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setEditingScheduleStageId(null)}
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-600 shadow-sm hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                        <div className="mt-4 grid gap-2 lg:grid-cols-[1fr_1fr_minmax(180px,1fr)_110px]">
                          <label className="block">
                            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">วันเริ่ม</span>
                            <input
                              type="date"
                              value={draft.scheduledStart}
                              onChange={(event) => setScheduleDrafts((current) => ({
                                ...current,
                                [editingScheduleItem.id]: { ...scheduleDraftFor(editingScheduleItem), scheduledStart: event.target.value, scheduledEnd: scheduleDraftFor(editingScheduleItem).scheduledEnd || event.target.value },
                              }))}
                              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 outline-none focus:border-emerald-400"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">วันสิ้นสุด</span>
                            <input
                              type="date"
                              value={draft.scheduledEnd}
                              min={draft.scheduledStart || undefined}
                              onChange={(event) => setScheduleDrafts((current) => ({
                                ...current,
                                [editingScheduleItem.id]: { ...scheduleDraftFor(editingScheduleItem), scheduledEnd: event.target.value },
                              }))}
                              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 outline-none focus:border-emerald-400"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">ทีมติดตั้ง</span>
                            <select
                              value={draft.resourceTeamId}
                              onChange={(event) => setScheduleDrafts((current) => ({
                                ...current,
                                [editingScheduleItem.id]: { ...scheduleDraftFor(editingScheduleItem), resourceTeamId: event.target.value },
                              }))}
                              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 outline-none focus:border-emerald-400"
                            >
                              <option value="">ยังไม่กำหนดทีม</option>
                              {resourceTeams.filter((team) => team.is_active).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                            </select>
                          </label>
                          <button
                            type="button"
                            onClick={() => handleScheduleStage(editingScheduleItem)}
                            disabled={schedulingStageId === editingScheduleItem.id}
                            className="mt-5 h-10 rounded-md bg-emerald-600 px-3 text-[12px] font-bold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 lg:mt-5"
                          >
                            {schedulingStageId === editingScheduleItem.id ? 'บันทึก...' : 'Save'}
                          </button>
                        </div>
                        {isReschedule && (
                          <label className="mt-3 block">
                            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-amber-600">เหตุผล Re Schedule</span>
                            <textarea
                              value={scheduleRescheduleReasons[editingScheduleItem.id] || ''}
                              onChange={(event) => setScheduleRescheduleReasons((current) => ({
                                ...current,
                                [editingScheduleItem.id]: event.target.value,
                              }))}
                              placeholder="ระบุเหตุผล เช่น ลูกค้าเลื่อนนัด, ทีมติดงาน, ฝนตก, วัสดุยังไม่พร้อม"
                              className="min-h-20 w-full resize-none rounded-md border border-amber-200 bg-amber-50/40 px-3 py-2 text-[12px] font-semibold text-slate-700 outline-none focus:border-amber-400 focus:bg-white"
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })()}
                {unscheduledSchedulingItems.length > 0 && (
                  <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-[13px] font-bold text-slate-950">งานที่ยังไม่จองวัน</h4>
                        <p className="text-[11px] text-slate-500">เลือกวันเริ่ม วันจบ และทีม แล้วกดบันทึกเพื่อให้ขึ้นบน Resource Calendar</p>
                      </div>
                      <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-500">{unscheduledSchedulingItems.length} งาน</span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {unscheduledSchedulingItems.map((item) => {
                        const project = relatedProject(item);
                        const draft = scheduleDraftFor(item);
                        const isFocused = focusedScheduleStageId === item.id;
                        return (
                          <div key={item.id} className={`rounded-lg border bg-white p-3 shadow-sm ${isFocused ? 'border-emerald-300 ring-2 ring-emerald-200' : 'border-slate-200'}`}>
                            <div className="flex items-start gap-2">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-slate-50 text-slate-600"><StageIcon name={item.icon || item.code} /></span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[13px] font-extrabold text-slate-950">{project?.customer_name || 'ไม่ระบุชื่อลูกค้า'}</p>
                                <p className="mt-1 text-[10px] font-bold text-slate-400">{project?.customer_code || 'N/A'} ยท SLA {item.sla_status || 'ON_TRACK'}</p>
                              </div>
                            </div>
                            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_minmax(120px,1fr)_92px]">
                              <input type="date" value={draft.scheduledStart} onChange={(event) => setScheduleDrafts((current) => ({ ...current, [item.id]: { ...scheduleDraftFor(item), scheduledStart: event.target.value, scheduledEnd: scheduleDraftFor(item).scheduledEnd || event.target.value } }))} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-700 outline-none focus:border-emerald-400" />
                              <input type="date" value={draft.scheduledEnd} min={draft.scheduledStart || undefined} onChange={(event) => setScheduleDrafts((current) => ({ ...current, [item.id]: { ...scheduleDraftFor(item), scheduledEnd: event.target.value } }))} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-700 outline-none focus:border-emerald-400" />
                              <select value={draft.resourceTeamId} onChange={(event) => setScheduleDrafts((current) => ({ ...current, [item.id]: { ...scheduleDraftFor(item), resourceTeamId: event.target.value } }))} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-700 outline-none focus:border-emerald-400"><option value="">เลือกทีม</option>{resourceTeams.filter((team) => team.is_active).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select>
                              <button type="button" onClick={() => handleScheduleStage(item)} disabled={schedulingStageId === item.id} className="h-9 rounded-md bg-emerald-600 px-3 text-[12px] font-bold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">{schedulingStageId === item.id ? 'บันทึก...' : 'บันทึก'}</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>          ) : activeTab === 'settings' ? (
            <div className="mx-auto max-w-[1200px] space-y-6">
              {!workflowGovernance ? (
                <div className="rounded-lg border border-slate-200 bg-white p-10 text-center shadow-sm"><p className="text-[14px] font-bold text-slate-950">No published workflow</p><p className="mt-2 text-[12px] text-slate-500">Publish a workflow version before creating real projects.</p></div>
              ) : (
                <>
                  {(() => {
                    const template = Array.isArray(workflowGovernance.version.workflow_templates) ? workflowGovernance.version.workflow_templates[0] : workflowGovernance.version.workflow_templates;
                    const stages = workflowGovernance.stages || [];
                    const draftVersion = workflowGovernance.draftVersion;
                    const builderVersion = workflowGovernance.builderVersion || workflowGovernance.version;
                    const builderIsDraft = builderVersion?.status === 'DRAFT';
                    const hardGateCount = stages.reduce((count: number, stage: any) => count + (stage.checklists || []).filter((item: any) => item.gate_severity === 'HARD').length + (stage.documents || []).filter((item: any) => item.gate_severity === 'HARD').length, 0);
                    const requiredDocCount = stages.reduce((count: number, stage: any) => count + (stage.documents || []).filter((item: any) => item.is_required).length, 0);
                    const requiredChecklistCount = stages.reduce((count: number, stage: any) => count + (stage.checklists || []).filter((item: any) => item.is_required).length, 0);
                    const totalSlaHours = stages.reduce((sum: number, stage: any) => sum + Number(stage.sla_hours || 0), 0);
                    const selectedBuilderStage = stages.find((stage: any) => stage.id === selectedWorkflowStageId) || stages[0];
                    const governanceScore = Math.round((workflowGovernance.version?.status === 'PUBLISHED' ? 25 : 0) + (workflowGovernance.version?.is_active ? 25 : 0) + (workflowGovernance.standard ? 20 : 0) + (stages.length >= 12 ? 15 : 0) + (hardGateCount > 0 ? 15 : 0));
                    return (
                      <>
                        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                              <h3 className="text-[15px] font-bold text-slate-950">System Admin</h3>
                              <p className="text-[12px] text-slate-500">แยกส่วนจัดการให้ชัดเจน เพื่อเพิ่ม feature ใหม่เป็น tab ได้ต่อเนื่อง</p>
                            </div>
                            <div className="inline-flex w-fit overflow-hidden rounded-md border border-slate-200 bg-slate-50 p-0.5">
                              {[
                                { id: 'workflow', label: 'Workflow' },
                                { id: 'team', label: 'Team' },
                                { id: 'user', label: 'User' },
                                { id: 'role', label: 'Role' },
                                { id: 'audit', label: 'Audit Log' },
                              ].map((tab) => (
                                <button
                                  key={tab.id}
                                  type="button"
                                  onClick={() => setAdminSettingsTab(tab.id as 'workflow' | 'team' | 'user' | 'role' | 'audit')}
                                  className={`h-9 px-4 text-[12px] font-bold transition-colors ${adminSettingsTab === tab.id ? 'rounded bg-slate-950 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                                >
                                  {tab.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className={`overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm ${adminSettingsTab === 'team' ? '' : 'hidden'}`}>
                          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between"><div><h3 className="text-[15px] font-bold text-slate-950">Admin: Resource Teams</h3><p className="text-[12px] text-slate-500">Add and edit installation teams, territory, daily capacity, and skill used by Schedule.</p></div><div className="flex gap-2"><span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">Active {resourceTeams.filter((team) => team.is_active).length}</span><span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-500">Total {resourceTeams.length}</span></div></div>
                          <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_340px]"><div className="grid gap-3 md:grid-cols-2">{resourceTeams.length === 0 ? <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-[12px] font-medium text-slate-400 md:col-span-2">No teams yet</div> : resourceTeams.map((team) => { const editDraft = resourceTeamEditFor(team); const isEditing = editingResourceTeamId === team.id; const isUpdating = resourceTeamUpdatingId === team.id; return <div key={team.id} className={`rounded-lg border bg-white p-3 shadow-sm transition-colors ${team.is_active ? 'border-slate-200' : 'border-slate-200 bg-slate-50 opacity-80'}`}><div className="flex items-start justify-between gap-2"><div className="min-w-0 flex-1">{isEditing ? <input value={editDraft.name} onChange={(event) => setResourceTeamEdits((current) => ({ ...current, [team.id]: { ...editDraft, name: event.target.value } }))} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px] font-bold text-slate-900 outline-none focus:border-emerald-400" /> : <p className="truncate text-[13px] font-bold text-slate-950">{team.name}</p>}<p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{team.owner_role || 'contractor'}</p></div><span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold ${team.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-400'}`}>{team.is_active ? 'Active' : 'Inactive'}</span></div>{isEditing ? <div className="mt-3 space-y-2"><div className="grid grid-cols-[minmax(0,1fr)_76px] gap-2"><input value={editDraft.territory} onChange={(event) => setResourceTeamEdits((current) => ({ ...current, [team.id]: { ...editDraft, territory: event.target.value } }))} placeholder="Territory" className="h-9 rounded-md border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-700 outline-none focus:border-emerald-400" /><input type="number" min="1" value={editDraft.dailyCapacity} onChange={(event) => setResourceTeamEdits((current) => ({ ...current, [team.id]: { ...editDraft, dailyCapacity: event.target.value } }))} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-700 outline-none focus:border-emerald-400" /></div><select value={editDraft.skills.split(',')[0]?.trim() || 'installation'} onChange={(event) => setResourceTeamEdits((current) => ({ ...current, [team.id]: { ...editDraft, skills: event.target.value } }))} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-700 outline-none focus:border-emerald-400">{resourceSkillOptions.map((skill) => <option key={skill.value} value={skill.value}>{skill.label}</option>)}</select><label className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-[11px] font-bold text-slate-600">Active<input type="checkbox" checked={editDraft.isActive} onChange={(event) => setResourceTeamEdits((current) => ({ ...current, [team.id]: { ...editDraft, isActive: event.target.checked } }))} className="h-4 w-4 accent-emerald-600" /></label><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => handleUpdateResourceTeam(team)} disabled={isUpdating} className="h-9 rounded-md bg-emerald-600 text-[11px] font-bold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">{isUpdating ? 'Saving...' : 'Save'}</button><button type="button" onClick={() => setEditingResourceTeamId(null)} className="h-9 rounded-md border border-slate-200 bg-white text-[11px] font-bold text-slate-600 shadow-sm hover:bg-slate-50">Cancel</button></div></div> : <><div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-md bg-slate-50 px-2 py-2"><p className="text-[10px] font-semibold text-slate-400">Territory</p><p className="mt-1 truncate text-[12px] font-bold text-slate-800">{team.territory || 'All areas'}</p></div><div className="rounded-md bg-slate-50 px-2 py-2"><p className="text-[10px] font-semibold text-slate-400">Capacity</p><p className="mt-1 text-[12px] font-bold text-slate-800">{team.daily_capacity || 1} / day</p></div></div><div className="mt-2 flex min-h-[30px] flex-wrap gap-1">{Array.isArray(team.skills) && team.skills.length ? team.skills.map((skill: string) => <span key={skill} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{skill}</span>) : <span className="text-[10px] font-semibold text-slate-400">No skill</span>}</div><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => beginEditResourceTeam(team)} className="h-9 rounded-md border border-slate-200 bg-white text-[11px] font-bold text-slate-700 shadow-sm hover:bg-slate-50">Edit</button><button type="button" onClick={() => handleToggleResourceTeam(team)} disabled={isUpdating} className={`h-9 rounded-md border text-[11px] font-bold shadow-sm disabled:cursor-not-allowed disabled:opacity-60 ${team.is_active ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>{isUpdating ? 'Updating...' : team.is_active ? 'Disable' : 'Enable'}</button></div></>}</div>; })}</div><div className="rounded-lg border border-slate-200 bg-slate-50 p-4"><h4 className="text-[14px] font-bold text-slate-950">Add team</h4><div className="mt-4 space-y-2"><input value={resourceTeamDraft.name} onChange={(event) => setResourceTeamDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Team name" className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 outline-none focus:border-emerald-400" /><div className="grid grid-cols-[minmax(0,1fr)_92px] gap-2"><input value={resourceTeamDraft.territory} onChange={(event) => setResourceTeamDraft((current) => ({ ...current, territory: event.target.value }))} placeholder="Territory" className="h-10 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 outline-none focus:border-emerald-400" /><input type="number" min="1" value={resourceTeamDraft.dailyCapacity} onChange={(event) => setResourceTeamDraft((current) => ({ ...current, dailyCapacity: event.target.value }))} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 outline-none focus:border-emerald-400" /></div><select value={resourceTeamDraft.skills || 'installation'} onChange={(event) => setResourceTeamDraft((current) => ({ ...current, skills: event.target.value }))} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 outline-none focus:border-emerald-400">{resourceSkillOptions.map((skill) => <option key={skill.value} value={skill.value}>{skill.label}</option>)}</select><button type="button" onClick={handleCreateResourceTeam} disabled={creatingResourceTeam} className="h-10 w-full rounded-md bg-slate-950 px-3 text-[12px] font-bold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">{creatingResourceTeam ? 'Creating...' : 'Create team'}</button></div></div></div>
                        </div>
                        {adminSettingsTab === 'user' && (
                          <div className="space-y-4">
                            <div className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
                              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <div>
                                  <h3 className="text-[15px] font-bold text-slate-950">Users & Roles Admin</h3>
                                  <p className="text-[12px] text-slate-500">จัดการผู้ใช้งาน บทบาทหลัก และบทบาทเสริมในหน้า canonical เดียว</p>
                                </div>
                                <a
                                  href="/admin/users"
                                  className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-[12px] font-bold text-white shadow-sm transition-colors hover:bg-slate-800"
                                >
                                  เปิดหน้า Users & Roles
                                </a>
                              </div>
                            </div>
                          </div>
                        )}
                        {adminSettingsTab === 'audit' && (
                          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                            <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                              <div>
                                <h3 className="text-[15px] font-bold text-slate-950">Audit Log</h3>
                                <p className="text-[12px] text-slate-500">Track system-wide actions, actor, project, and before/after payloads.</p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <select
                                  value={auditFilters.action}
                                  onChange={(event) => {
                                    const next = { ...auditFilters, action: event.target.value, page: 1 };
                                    setAuditFilters(next);
                                    fetchAuditLogs(next);
                                  }}
                                  className="h-10 min-w-[220px] rounded-md border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-700 outline-none focus:border-emerald-400"
                                >
                                  <option value="ALL">All actions</option>
                                  {auditActions.map((action) => (
                                    <option key={action} value={action}>{activityLabel(action)}</option>
                                  ))}
                                </select>
                                <form
                                  className="flex gap-2"
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    const next = { ...auditFilters, page: 1 };
                                    setAuditFilters(next);
                                    fetchAuditLogs(next);
                                  }}
                                >
                                  <input
                                    value={auditFilters.search}
                                    onChange={(event) => setAuditFilters((current) => ({ ...current, search: event.target.value }))}
                                    placeholder="Search action / reason"
                                    className="h-10 w-52 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 outline-none focus:border-emerald-400"
                                  />
                                  <button
                                    type="submit"
                                    className="h-10 rounded-md bg-slate-950 px-3 text-[11px] font-bold text-white shadow-sm hover:bg-slate-800"
                                  >
                                    Search
                                  </button>
                                </form>
                                <button
                                  type="button"
                                  onClick={() => fetchAuditLogs()}
                                  disabled={auditLoading}
                                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {auditLoading ? 'Loading...' : 'Refresh'}
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3 md:grid-cols-4">
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Total matched</p>
                                <p className="mt-1 text-[15px] font-black text-slate-950">{auditPagination.total}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Page</p>
                                <p className="mt-1 text-[15px] font-black text-slate-950">{auditPagination.page}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Loaded</p>
                                <p className="mt-1 text-[15px] font-black text-slate-950">{auditLogs.length}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Retention</p>
                                <p className="mt-1 text-[12px] font-bold text-slate-600">DB audit trail</p>
                              </div>
                            </div>

                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[1080px] text-left text-[12px]">
                                <thead>
                                  <tr className="border-b border-slate-100 bg-white text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                    <th className="px-4 py-3">Time</th>
                                    <th className="px-4 py-3">Action</th>
                                    <th className="px-4 py-3">Actor</th>
                                    <th className="px-4 py-3">Project</th>
                                    <th className="px-4 py-3">Entity</th>
                                    <th className="px-4 py-3">Payload</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {auditLoading ? (
                                    <tr>
                                      <td colSpan={6} className="px-4 py-8 text-center text-[12px] font-bold text-slate-400">Loading audit logs...</td>
                                    </tr>
                                  ) : auditLogs.length === 0 ? (
                                    <tr>
                                      <td colSpan={6} className="px-4 py-8 text-center text-[12px] font-bold text-slate-400">No audit logs found</td>
                                    </tr>
                                  ) : auditLogs.map((log) => (
                                    <tr key={log.id} className="align-top hover:bg-slate-50">
                                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-600">{formatDateTime(log.created_at)}</td>
                                      <td className="px-4 py-3">
                                        <span className={`inline-flex rounded border px-2 py-1 text-[10px] font-bold ${activityToneClass(log.action)}`}>
                                          {activityLabel(log.action)}
                                        </span>
                                        {log.reason && <p className="mt-1 max-w-56 text-[11px] font-semibold text-slate-500">{log.reason}</p>}
                                      </td>
                                      <td className="px-4 py-3">
                                        <p className="font-bold text-slate-900">{auditActorLabel(log)}</p>
                                        <p className="mt-0.5 text-[10px] font-semibold text-slate-400">{log.actor?.role || 'system'}</p>
                                      </td>
                                      <td className="px-4 py-3">
                                        <p className="max-w-64 truncate font-bold text-slate-900">{auditProjectLabel(log)}</p>
                                        {log.stage && <p className="mt-0.5 text-[10px] font-bold uppercase text-slate-400">{log.stage.code} / {log.stage.name}</p>}
                                      </td>
                                      <td className="px-4 py-3">
                                        <p className="font-mono text-[11px] font-bold text-slate-600">{log.related_entity_type || '-'}</p>
                                        <p className="mt-0.5 font-mono text-[10px] font-semibold text-slate-400">{log.related_entity_id || log.id}</p>
                                      </td>
                                      <td className="px-4 py-3">
                                        <code className="block max-w-[360px] whitespace-pre-wrap break-words rounded-md bg-slate-50 px-2 py-1.5 text-[10px] font-semibold leading-4 text-slate-600">
                                          {auditPayloadSummary(log)}
                                        </code>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
                              <p className="text-[11px] font-semibold text-slate-500">
                                Showing {auditLogs.length} of {auditPagination.total}
                              </p>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  disabled={auditLoading || auditFilters.page <= 1}
                                  onClick={() => {
                                    const next = { ...auditFilters, page: Math.max(1, auditFilters.page - 1) };
                                    setAuditFilters(next);
                                    fetchAuditLogs(next);
                                  }}
                                  className="h-9 rounded-md border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Previous
                                </button>
                                <button
                                  type="button"
                                  disabled={auditLoading || auditFilters.page * auditFilters.pageSize >= auditPagination.total}
                                  onClick={() => {
                                    const next = { ...auditFilters, page: auditFilters.page + 1 };
                                    setAuditFilters(next);
                                    fetchAuditLogs(next);
                                  }}
                                  className="h-9 rounded-md border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Next
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                        {adminSettingsTab === 'role' && (
                          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                            <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
                              <div>
                                <h3 className="text-[15px] font-bold text-slate-950">Role Directory</h3>
                                <p className="text-[12px] text-slate-500">Role = สิทธิ์ของผู้ใช้ในระบบ ส่วน Owner role = ทีมที่รับผิดชอบ stage ใน workflow</p>
                                <p className="mt-1 text-[11px] font-semibold text-slate-400">ระบบจะแสดงชื่อพร้อม role_code เสมอ เช่น ทีมปฏิบัติการ (ops)</p>
                              </div>
                              <select
                                value={selectedAdminRole}
                                onChange={(event) => setSelectedAdminRole(event.target.value)}
                                className="h-10 min-w-[220px] rounded-md border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-800 outline-none focus:border-emerald-400"
                              >
                                {adminRoleDefinitions.map((role) => (
                                  <option key={role.value} value={role.value}>{adminRoleDisplay(role)}</option>
                                ))}
                              </select>
                            </div>
                            <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                              <div className="space-y-4">
                                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Role</p>
                                      <h4 className="mt-1 text-[20px] font-black text-slate-950">{adminRoleDisplay(selectedAdminRoleDefinition)}</h4>
                                      <p className="mt-1 font-mono text-[11px] font-bold text-slate-400">role_code: {selectedAdminRoleDefinition.value}</p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => beginEditAdminRole(selectedAdminRoleDefinition)}
                                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                                    >
                                      Edit
                                    </button>
                                  </div>
                                  <p className="mt-2 text-[13px] font-semibold text-slate-600">{selectedAdminRoleDefinition.purpose}</p>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-white px-4 py-4">
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <h4 className="text-[13px] font-bold text-slate-950">เพิ่ม / แก้ไข Role</h4>
                                      <p className="text-[11px] font-semibold text-slate-500">แก้ definition ที่ใช้แสดงผลและ dropdown owner ของ Workflow Builder</p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={saveAdminRoleDefinition}
                                      className="h-9 rounded-md bg-slate-950 px-3 text-[11px] font-bold text-white shadow-sm hover:bg-slate-800"
                                    >
                                      Save role
                                    </button>
                                  </div>
                                  <div className="mt-3 grid gap-2 md:grid-cols-[120px_minmax(0,1fr)]">
                                    <input
                                      value={adminRoleDraft.value}
                                      onChange={(event) => setAdminRoleDraft((current) => ({ ...current, value: event.target.value }))}
                                      placeholder="code เช่น rcm"
                                      className="h-9 rounded-md border border-slate-200 bg-white px-2 text-[12px] font-bold lowercase text-slate-700 outline-none focus:border-emerald-400"
                                    />
                                    <input
                                      value={adminRoleDraft.label}
                                      onChange={(event) => setAdminRoleDraft((current) => ({ ...current, label: event.target.value }))}
                                      placeholder="ชื่อที่แสดง เช่น RCM"
                                      className="h-9 rounded-md border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-700 outline-none focus:border-emerald-400"
                                    />
                                  </div>
                                  <textarea
                                    value={adminRoleDraft.purpose}
                                    onChange={(event) => setAdminRoleDraft((current) => ({ ...current, purpose: event.target.value }))}
                                    placeholder="หน้าที่ของ role นี้"
                                    className="mt-2 min-h-20 w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 outline-none focus:border-emerald-400"
                                  />
                                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                                    <textarea
                                      value={adminRoleDraft.responsibilities}
                                      onChange={(event) => setAdminRoleDraft((current) => ({ ...current, responsibilities: event.target.value }))}
                                      placeholder="หน้าที่หลัก บรรทัดละ 1 รายการ"
                                      className="min-h-24 resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 outline-none focus:border-emerald-400"
                                    />
                                    <textarea
                                      value={adminRoleDraft.pages}
                                      onChange={(event) => setAdminRoleDraft((current) => ({ ...current, pages: event.target.value }))}
                                      placeholder="หน้าที่เห็นได้ คั่นด้วย comma เช่น Dashboard, Projects"
                                      className="min-h-24 resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 outline-none focus:border-emerald-400"
                                    />
                                  </div>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-white px-4 py-4">
                                  <h4 className="text-[13px] font-bold text-slate-950">หน้าที่หลัก</h4>
                                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                                    {selectedAdminRoleDefinition.responsibilities.map((item) => (
                                      <div key={item} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-[12px] font-semibold text-slate-700">{item}</div>
                                    ))}
                                  </div>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-white px-4 py-4">
                                  <h4 className="text-[13px] font-bold text-slate-950">เห็นหน้าไหนได้บ้าง</h4>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {selectedAdminRoleDefinition.pages.map((page) => (
                                      <span key={page} className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700">{page}</span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <aside className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-4">
                                <h4 className="text-[13px] font-bold text-slate-950">พื้นที่ที่มองเห็น</h4>
                                <p className="mt-1 text-[11px] font-semibold text-slate-500">เตรียมไว้สำหรับ region/province scope ในอนาคต</p>
                                <div className="mt-4 space-y-3">
                                  <label className="block">
                                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Region</span>
                                    <select disabled className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-400">
                                      <option>ทุก Region</option>
                                    </select>
                                  </label>
                                  <label className="block">
                                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Province</span>
                                    <select disabled className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-400">
                                      <option>ทุกจังหวัด</option>
                                    </select>
                                  </label>
                                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
                                    ตอนนี้เป็น design/definition เท่านั้น ยังไม่บังคับ permission ตามพื้นที่
                                  </p>
                                </div>
                              </aside>
                            </div>
                          </div>
                        )}
                        <div className={`${adminSettingsTab === 'workflow' ? 'space-y-6' : 'hidden'}`}>
                        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                          <div className="border-b border-slate-100 px-5 py-4">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <h3 className="text-[15px] font-bold text-slate-950">ความพร้อมตาม Source of Truth</h3>
                                <p className="text-[12px] text-slate-500">ตรวจ workflow, standard version, SLA, hard gate และการ lock version ของโครงการ</p>
                              </div>
                              <span className={`w-fit rounded-full border px-3 py-1 text-[11px] font-bold ${governanceScore >= 90 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : governanceScore >= 70 ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                                พร้อม {governanceScore}%
                              </span>
                            </div>
                          </div>
                          <div className="px-5 py-5">
                            <div className="relative h-4 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={`h-full rounded-full ${governanceScore >= 90 ? 'bg-gradient-to-r from-emerald-500 via-teal-400 to-sky-400' : governanceScore >= 70 ? 'bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400' : 'bg-gradient-to-r from-rose-500 via-orange-500 to-amber-400'}`}
                                style={{ width: `${governanceScore}%` }}
                              ></div>
                              <div className="absolute inset-0 grid grid-cols-5">
                                {[0, 1, 2, 3, 4].map((item) => <span key={item} className="border-r border-white/70 last:border-r-0"></span>)}
                              </div>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-3 text-[11px] font-semibold text-slate-500 md:grid-cols-5">
                              <span>Publish: <b className="text-slate-900">{workflowGovernance.version.status}</b></span>
                              <span>ใช้งาน: <b className="text-slate-900">{workflowGovernance.version.is_active ? 'เปิด' : 'ปิด'}</b></span>
                              <span>มาตรฐาน: <b className="text-slate-900">{workflowGovernance.standard?.code || 'N/A'}</b></span>
                              <span>ขั้นตอน: <b className="text-slate-900">{stages.length}</b></span>
                              <span>Hard gate: <b className="text-slate-900">{hardGateCount}</b></span>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                            <p className="text-[12px] font-semibold text-slate-500">Workflow ที่ใช้งาน</p>
                            <p className="mt-2 truncate text-[16px] font-bold text-slate-950">{template?.name || workflowGovernance.version.name}</p>
                            <p className="mt-1 text-[11px] font-bold text-slate-400">{template?.code || 'N/A'} / V{workflowGovernance.version.version_number}</p>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                            <p className="text-[12px] font-semibold text-slate-500">มาตรฐานติดตั้ง</p>
                            <p className="mt-2 truncate text-[16px] font-bold text-slate-950">{workflowGovernance.standard?.code || 'N/A'}</p>
                            <p className="mt-1 text-[11px] font-bold text-slate-400">{workflowGovernance.standard?.version || 'ยังไม่มีมาตรฐาน active'}</p>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                            <p className="text-[12px] font-semibold text-slate-500">ขอบเขต Runtime</p>
                            <p className="mt-2 text-[16px] font-bold text-slate-950">{template?.project_type || 'RES-S'} / {template?.payment_type || 'CASH'}</p>
                            <p className="mt-1 text-[11px] font-bold text-slate-400">workflow สำหรับ pilot</p>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                            <p className="text-[12px] font-semibold text-slate-500">SLA รวม</p>
                            <p className="mt-2 text-[16px] font-bold text-slate-950">{formatSlaDuration(totalSlaHours)}</p>
                            <p className="mt-1 text-[11px] font-bold text-slate-400">{requiredChecklistCount} checklist / {requiredDocCount} เอกสาร</p>
                          </div>
                        </div>

                        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                          <div className="border-b border-slate-100 px-5 py-4">
                            <h3 className="text-[14px] font-bold text-slate-950">วิธีจัด Workflow</h3>
                            <p className="mt-1 text-[12px] text-slate-500">ทำตามลำดับ 1-4 เพื่อกันแก้ผิด version และทำให้ stage ใหม่พร้อมใช้งานจริง</p>
                          </div>
                          <div className="grid gap-3 p-5 md:grid-cols-4">
                            {[
                              { step: "1", title: "สร้าง Draft", detail: "เริ่มจาก version สำเนา ก่อนแก้ stage จริง", status: draftVersion ? "พร้อมแก้ไข" : "ต้องสร้างก่อน" },
                              { step: "2", title: "จัด Stage", detail: "เพิ่ม/เลือก stage แล้วเรียงลำดับด้วย Prev/Next", status: `${stages.length} stage` },
                              { step: "3", title: "ตั้ง Gate", detail: "เลือก owner, SLA, transition, checklist และเอกสาร", status: selectedBuilderStage ? stageDisplay(selectedBuilderStage).title : "เลือก stage" },
                              { step: "4", title: "Publish", detail: "ตรวจความพร้อมแล้ว publish เป็น workflow version ใหม่", status: builderIsDraft ? "รอ publish" : "published" },
                            ].map((item, index) => (
                              <div key={item.step} className="relative rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
                                {index < 3 && <div className="absolute right-[-18px] top-1/2 hidden h-px w-9 bg-slate-200 md:block"></div>}
                                <div className="flex items-start gap-3">
                                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-[12px] font-bold text-white">{item.step}</span>
                                  <div className="min-w-0">
                                    <p className="text-[13px] font-bold text-slate-950">{item.title}</p>
                                    <p className="mt-1 text-[11px] font-medium leading-5 text-slate-500">{item.detail}</p>
                                    <span className="mt-3 inline-flex max-w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600">{item.status}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                              <h3 className="text-[14px] font-bold text-slate-950">ตัวจัดการ Workflow</h3>
                              <p className="text-[12px] text-slate-500">
                                กำลังดู {builderIsDraft ? `draft V${builderVersion.version_number}` : `published V${workflowGovernance.version.version_number}`}. โครงการเดิมยัง lock กับ workflow version เดิมเสมอ
                              </p>
                              <p className="text-[12px] text-slate-500">เลือก stage จากแผนผังด้านซ้าย แล้วตั้งค่ารายละเอียดจาก panel ด้านขวา</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <span className={`rounded-md border px-3 py-2 text-[11px] font-bold ${builderIsDraft ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                                {builderIsDraft ? 'โหมดแก้ไข Draft' : 'อ่านอย่างเดียว'}
                              </span>
                              <button
                                type="button"
                                onClick={handleCreateWorkflowDraft}
                                disabled={Boolean(draftVersion) || workflowBuilderLoading === 'create-draft'}
                                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-300"
                              >
                                {workflowBuilderLoading === 'create-draft' ? 'กำลังสร้าง...' : draftVersion ? 'มี Draft แล้ว' : 'สร้าง Draft'}
                              </button>
                              <button
                                type="button"
                                onClick={handleAddWorkflowStage}
                                disabled={!builderIsDraft || workflowBuilderLoading === 'add-stage'}
                                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-300"
                              >
                                {workflowBuilderLoading === 'add-stage' ? 'กำลังเพิ่ม...' : 'เพิ่ม Stage'}
                              </button>
                              <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-400">เรียงลำดับด้วยลูกศร</span>
                              <button
                                type="button"
                                onClick={handlePublishWorkflowDraft}
                                disabled={!draftVersion || workflowBuilderLoading === 'publish-draft'}
                                className="rounded-md bg-slate-950 px-3 py-2 text-[11px] font-bold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                              >
                                {workflowBuilderLoading === 'publish-draft' ? 'กำลัง Publish...' : 'Publish Version'}
                              </button>
                            </div>
                          </div>
                          <div className="border-b border-slate-100 bg-slate-50 px-5 py-3 text-[11px] font-medium text-slate-500">
                            Hint: ต้องสร้าง Draft ก่อนจึงจะแก้ไขได้ เมื่อ publish แล้ว project ใหม่จะใช้ version ใหม่ ส่วน project เดิมยัง lock กับ version เดิม
                          </div>
                          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]">
                            <div className="border-b border-slate-100 p-5 lg:border-b-0 lg:border-r">
                              {builderIsDraft && (
                                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
                                  <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                                    <div>
                                      <p className="text-[12px] font-bold text-slate-950">Step 2: เพิ่ม Stage ใน Draft</p>
                                      <p className="text-[11px] font-medium text-amber-800">ใส่ code สั้น ๆ, ชื่อขั้นตอน, ผู้รับผิดชอบ และ SLA ก่อนกดเพิ่ม</p>
                                    </div>
                                  </div>
                                  <div className="mt-3 grid gap-2 md:grid-cols-[120px_minmax(0,1fr)_150px_120px_auto]">
                                    <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                      Code
                                      <input
                                        value={workflowNewStageDraft.code}
                                        onChange={(event) => setWorkflowNewStageDraft((current) => ({ ...current, code: event.target.value }))}
                                        placeholder="MAT_CUT"
                                        className="h-9 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold uppercase text-slate-700 outline-none focus:border-amber-400"
                                      />
                                    </label>
                                    <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                      Stage name
                                      <input
                                        value={workflowNewStageDraft.name}
                                        onChange={(event) => setWorkflowNewStageDraft((current) => ({ ...current, name: event.target.value }))}
                                        placeholder="ชื่อ Stage ภาษาไทย"
                                        className="h-9 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 outline-none focus:border-amber-400"
                                      />
                                    </label>
                                    <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                      Owner role
                                      <select
                                        value={workflowNewStageDraft.ownerRole}
                                        onChange={(event) => setWorkflowNewStageDraft((current) => ({ ...current, ownerRole: event.target.value }))}
                                        className="h-9 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 outline-none focus:border-amber-400"
                                      >
                                        {adminRoleDefinitions.map((role) => (
                                          <option key={role.value} value={role.value}>{adminRoleDisplay(role)}</option>
                                        ))}
                                      </select>
                                      <span className="normal-case tracking-normal text-slate-400">ทีม/role ที่ต้องรับผิดชอบ stage นี้</span>
                                    </label>
                                    <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                      SLA
                                      <select
                                        value={workflowNewStageDraft.slaHours}
                                        onChange={(event) => setWorkflowNewStageDraft((current) => ({ ...current, slaHours: event.target.value }))}
                                        className="h-9 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 outline-none focus:border-amber-400"
                                      >
                                        {workflowSlaOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                      </select>
                                    </label>
                                    <button
                                      type="button"
                                      onClick={handleAddWorkflowStage}
                                      disabled={workflowBuilderLoading === 'add-stage'}
                                      className="mt-auto h-9 rounded-md bg-slate-950 px-3 text-[11px] font-bold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                                    >
                                      {workflowBuilderLoading === 'add-stage' ? 'กำลังเพิ่ม...' : 'เพิ่ม'}
                                    </button>
                                  </div>
                                </div>
                              )}
                              <div className="mb-3 flex items-center justify-between">
                                <div>
                                  <p className="text-[12px] font-bold text-slate-950">Step 2: แผนผังลำดับ Stage</p>
                                  <p className="text-[11px] font-medium text-slate-500">คลิกกล่องเพื่อแก้รายละเอียด ใช้ Prev/Next เพื่อย้ายตำแหน่งใน draft</p>
                                </div>
                                <span className={`rounded border px-2 py-1 text-[10px] font-bold ${builderIsDraft ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                                  {builderIsDraft ? 'Draft แก้ไขได้' : 'Preview อ่านอย่างเดียว'}
                                </span>
                              </div>
                              <div className="flex gap-3 overflow-x-auto pb-2">
                                {stages.map((stage: any, stageIndex: number) => {
                                  const isSelected = selectedBuilderStage?.id === stage.id;
                                  const hardStageGates = [...(stage.checklists || []), ...(stage.documents || [])].filter((item: any) => item.gate_severity === 'HARD').length;
                                  const visual = stageVisual(stage);
                                  const canMoveLeft = builderIsDraft && stageIndex > 0;
                                  const canMoveRight = builderIsDraft && stageIndex < stages.length - 1;
                                  return (
                                    <div key={stage.id} className="flex items-center gap-3">
                                    <div
                                      className={`min-w-[190px] rounded-lg border px-3 py-3 text-left transition-all ${isSelected ? 'border-slate-950 bg-slate-950 text-white shadow-md' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'}`}
                                    >
                                      <button type="button" onClick={() => setSelectedWorkflowStageId(stage.id)} className="w-full text-left">
                                        <div className="flex items-start gap-2">
                                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${isSelected ? 'border-white/20 bg-white/10 text-white' : visual.iconClass}`}>
                                          <StageIcon name={visual.icon} />
                                        </span>
                                        <div className="min-w-0">
                                          <p className={`truncate text-[12px] font-bold ${isSelected ? 'text-white' : 'text-slate-950'}`}>{stageDisplay(stage).title}</p>
                                          <p className={`mt-1 font-mono text-[10px] font-bold ${isSelected ? 'text-white/60' : 'text-slate-400'}`}>#{stage.order_index} / {stage.code}</p>
                                        </div>
                                      </div>
                                      <div className={`mt-3 grid grid-cols-3 gap-2 text-center text-[10px] font-bold ${isSelected ? 'text-white/80' : 'text-slate-500'}`}>
                                        <span>SLA {formatSlaDuration(stage.sla_hours)}</span>
                                        <span>{(stage.checklists || []).length} checklist</span>
                                        <span>{hardStageGates} hard</span>
                                      </div>
                                      </button>
                                      {builderIsDraft && (
                                        <div className="mt-3 grid grid-cols-2 gap-2">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const next = [...stages];
                                              [next[stageIndex - 1], next[stageIndex]] = [next[stageIndex], next[stageIndex - 1]];
                                              handleReorderWorkflowStages(next);
                                            }}
                                            disabled={!canMoveLeft || workflowBuilderLoading === 'reorder-stages'}
                                            className={`rounded border px-2 py-1 text-[10px] font-bold ${isSelected ? 'border-white/20 text-white/80 disabled:text-white/30' : 'border-slate-200 text-slate-600 disabled:text-slate-300'}`}
                                          >
                                            Prev
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const next = [...stages];
                                              [next[stageIndex], next[stageIndex + 1]] = [next[stageIndex + 1], next[stageIndex]];
                                              handleReorderWorkflowStages(next);
                                            }}
                                            disabled={!canMoveRight || workflowBuilderLoading === 'reorder-stages'}
                                            className={`rounded border px-2 py-1 text-[10px] font-bold ${isSelected ? 'border-white/20 text-white/80 disabled:text-white/30' : 'border-slate-200 text-slate-600 disabled:text-slate-300'}`}
                                          >
                                            Next
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                    {stageIndex < stages.length - 1 && (
                                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-[12px] font-bold text-slate-400">→</div>
                                    )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            <aside className="p-5">
                              {selectedBuilderStage ? (
                                <div className="space-y-4">
                                  <div>
                                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Step 3: ตั้งค่าขั้นตอน</p>
                                    <h4 className="mt-1 text-[16px] font-bold text-slate-950">{stageDisplay(selectedBuilderStage).title}</h4>
                                    <p className="mt-1 font-mono text-[10px] font-bold uppercase text-slate-400">{selectedBuilderStage.code} / {selectedBuilderStage.name}</p>
                                    <p className="mt-2 text-[11px] font-medium leading-5 text-slate-500">ตั้ง owner และ SLA ก่อน จากนั้นตรวจ transition, checklist และเอกสารที่เป็น hard gate</p>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-[12px]">
                                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                      <p className="font-semibold text-slate-500">SLA</p>
                                      <p className="mt-1 font-bold text-slate-950">{formatSlaDuration(selectedBuilderStage.sla_hours)}</p>
                                    </div>
                                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                      <p className="font-semibold text-slate-500">Owner role</p>
                                      <p className="mt-1 font-bold text-slate-950">{stageOwner(selectedBuilderStage)}</p>
                                    </div>
                                  </div>
                                  {builderIsDraft && (() => {
                                    const editDraft = workflowStageEditFor(selectedBuilderStage);
                                    return (
                                      <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                                        <p className="text-[12px] font-bold text-slate-950">แก้ข้อมูล Stage</p>
                                        <p className="mt-1 text-[11px] font-medium text-amber-800">Owner role คือทีมที่รับผิดชอบ stage นี้ ไม่ใช่สิทธิ์ admin ของผู้ใช้</p>
                                        <div className="mt-3 space-y-2">
                                          <input
                                            value={editDraft.name}
                                            onChange={(event) => setWorkflowStageEdits((current) => ({ ...current, [selectedBuilderStage.id]: { ...editDraft, name: event.target.value } }))}
                                            className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px] font-bold text-slate-800 outline-none focus:border-amber-400"
                                          />
                                          <div className="grid grid-cols-[minmax(0,1fr)_92px] gap-2">
                                            <select
                                              value={editDraft.ownerRole}
                                              onChange={(event) => setWorkflowStageEdits((current) => ({ ...current, [selectedBuilderStage.id]: { ...editDraft, ownerRole: event.target.value } }))}
                                              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-700 outline-none focus:border-amber-400"
                                            >
                                              <option value="">ยังไม่กำหนดผู้รับผิดชอบ</option>
                                              {adminRoleDefinitions.map((role) => (
                                                <option key={role.value} value={role.value}>{adminRoleDisplay(role)}</option>
                                              ))}
                                            </select>
                                            <select
                                              value={editDraft.slaHours}
                                              onChange={(event) => setWorkflowStageEdits((current) => ({ ...current, [selectedBuilderStage.id]: { ...editDraft, slaHours: event.target.value } }))}
                                              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-700 outline-none focus:border-amber-400"
                                            >
                                              {!workflowSlaOptions.some((option) => option.value === String(editDraft.slaHours)) && (
                                                <option value={editDraft.slaHours}>{formatSlaDuration(Number(editDraft.slaHours || 0))}</option>
                                              )}
                                              {workflowSlaOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                            </select>
                                          </div>
                                          <label className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-2 text-[11px] font-bold text-slate-600">
                                            Active stage
                                            <input
                                              type="checkbox"
                                              checked={editDraft.isActive}
                                              onChange={(event) => setWorkflowStageEdits((current) => ({ ...current, [selectedBuilderStage.id]: { ...editDraft, isActive: event.target.checked } }))}
                                              className="h-4 w-4 accent-amber-500"
                                            />
                                          </label>
                                          <button
                                            type="button"
                                            onClick={() => handleSaveWorkflowStage(selectedBuilderStage)}
                                            disabled={workflowBuilderLoading === `stage:${selectedBuilderStage.id}`}
                                            className="h-9 w-full rounded-md bg-slate-950 text-[11px] font-bold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                                          >
                                            {workflowBuilderLoading === `stage:${selectedBuilderStage.id}` ? 'กำลังบันทึก...' : 'บันทึก Draft ของขั้นตอน'}
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                  <div className="rounded-lg border border-slate-200">
                                    <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                                      <div>
                                        <p className="text-[12px] font-bold text-slate-950">Transition</p>
                                        <p className="text-[10px] font-medium text-slate-400">บอกว่าขั้นตอนนี้ไปต่อที่ไหน หรือวนกลับ rework ได้ไหม</p>
                                      </div>
                                      <span className="text-[11px] font-bold text-slate-400">{(selectedBuilderStage.transitions || []).length}</span>
                                    </div>
                                    <div className="max-h-44 overflow-y-auto p-2">
                                      {(selectedBuilderStage.transitions || []).length === 0 ? (
                                        <p className="px-2 py-3 text-[12px] font-medium text-slate-400">ยังไม่มีเส้นทางไปขั้นตอนถัดไป</p>
                                      ) : (selectedBuilderStage.transitions || []).map((item: any) => {
                                        const targetStage = stages.find((stage: any) => stage.id === item.to_stage_id);
                                        return (
                                          <div key={item.id} className="rounded-md px-2 py-2 text-[12px] hover:bg-slate-50">
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="truncate font-semibold text-slate-700">{item.type} ไป {targetStage?.code || 'ไม่พบขั้นตอน'}</span>
                                              <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold ${item.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>{item.is_active ? 'ACTIVE' : 'OFF'}</span>
                                            </div>
                                            {builderIsDraft && (
                                              <div className="mt-2 grid grid-cols-[minmax(0,1fr)_78px_58px] gap-1">
                                                <select
                                                  value={item.to_stage_id || ''}
                                                  onChange={(event) => handleUpdateWorkflowTransition(item, { toStageId: event.target.value })}
                                                  className="h-8 rounded border border-slate-200 bg-white px-1 text-[10px] font-bold text-slate-600 outline-none"
                                                >
                                                  {stages.filter((stage: any) => stage.id !== selectedBuilderStage.id).map((stage: any) => (
                                                    <option key={stage.id} value={stage.id}>{stage.order_index}. {stage.code}</option>
                                                  ))}
                                                </select>
                                                <select
                                                  value={item.type}
                                                  onChange={(event) => handleUpdateWorkflowTransition(item, { type: event.target.value })}
                                                  className="h-8 rounded border border-slate-200 bg-white px-1 text-[10px] font-bold text-slate-600 outline-none"
                                                >
                                                  {workflowTransitionTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
                                                </select>
                                                <label className="flex h-8 items-center justify-center gap-1 rounded border border-slate-200 bg-white text-[10px] font-bold text-slate-500">
                                                  <input
                                                    type="checkbox"
                                                    checked={item.is_active !== false}
                                                    onChange={(event) => handleUpdateWorkflowTransition(item, { isActive: event.target.checked })}
                                                    className="h-3 w-3 accent-amber-500"
                                                  />
                                                  On
                                                </label>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                    {builderIsDraft && (
                                      <div className="border-t border-slate-100 p-2">
                                        <div className="grid grid-cols-[minmax(0,1fr)_82px_72px] gap-1">
                                          <select
                                            value={workflowTransitionDraft.toStageId}
                                            onChange={(event) => setWorkflowTransitionDraft((current) => ({ ...current, toStageId: event.target.value }))}
                                            className="h-8 rounded border border-slate-200 bg-white px-1 text-[10px] font-bold text-slate-600 outline-none"
                                          >
                                            <option value="">ปลายทาง</option>
                                            {stages.filter((stage: any) => stage.id !== selectedBuilderStage.id).map((stage: any) => (
                                              <option key={stage.id} value={stage.id}>{stage.order_index}. {stage.code}</option>
                                            ))}
                                          </select>
                                          <select
                                            value={workflowTransitionDraft.type}
                                            onChange={(event) => setWorkflowTransitionDraft((current) => ({ ...current, type: event.target.value }))}
                                            className="h-8 rounded border border-slate-200 bg-white px-1 text-[10px] font-bold text-slate-600 outline-none"
                                          >
                                            {workflowTransitionTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
                                          </select>
                                          <button
                                            type="button"
                                            onClick={() => handleAddWorkflowTransition(selectedBuilderStage)}
                                            disabled={workflowBuilderLoading === 'add-transition'}
                                            className="h-8 rounded bg-slate-950 text-[10px] font-bold text-white disabled:bg-slate-300"
                                          >
                                            เพิ่ม
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  <div className="rounded-lg border border-slate-200">
                                    <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                                      <div>
                                        <p className="text-[12px] font-bold text-slate-950">Checklist Gate</p>
                                        <p className="text-[10px] font-medium text-slate-400">สิ่งที่ต้องตรวจใน stage นี้ ถ้าเป็น HARD จะบังคับก่อนข้าม stage</p>
                                      </div>
                                      <span className="text-[11px] font-bold text-slate-400">{(selectedBuilderStage.checklists || []).length}</span>
                                    </div>
                                    <div className="max-h-44 overflow-y-auto p-2">
                                      {(selectedBuilderStage.checklists || []).length === 0 ? (
                                        <p className="px-2 py-3 text-[12px] font-medium text-slate-400">ยังไม่มี checklist</p>
                                      ) : (selectedBuilderStage.checklists || []).map((item: any) => (
                                        <div key={item.id} className="rounded-md px-2 py-2 text-[12px] hover:bg-slate-50">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="truncate font-semibold text-slate-700">{item.label}</span>
                                            <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold ${gateSeverityClass(item.gate_severity)}`}>{item.gate_severity}</span>
                                          </div>
                                          {builderIsDraft && (
                                            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_92px_72px] gap-1">
                                              <input
                                                defaultValue={item.label}
                                                onBlur={(event) => event.target.value !== item.label && handleUpdateWorkflowChecklist(item, { label: event.target.value })}
                                                className="h-8 rounded border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 outline-none focus:border-amber-400"
                                              />
                                              <select
                                                value={item.gate_severity}
                                                onChange={(event) => handleUpdateWorkflowChecklist(item, { gateSeverity: event.target.value })}
                                                className="h-8 rounded border border-slate-200 bg-white px-1 text-[10px] font-bold text-slate-600 outline-none"
                                              >
                                                {workflowGateSeverityOptions.map((severity) => <option key={severity} value={severity}>{severity}</option>)}
                                              </select>
                                              <label className="flex h-8 items-center justify-center gap-1 rounded border border-slate-200 bg-white text-[10px] font-bold text-slate-500">
                                                <input
                                                  type="checkbox"
                                                  checked={item.is_required !== false}
                                                  onChange={(event) => handleUpdateWorkflowChecklist(item, { isRequired: event.target.checked })}
                                                  className="h-3 w-3 accent-amber-500"
                                                />
                                                บังคับ
                                              </label>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                    {builderIsDraft && (
                                      <div className="border-t border-slate-100 p-2">
                                        <div className="grid gap-1">
                                          <input
                                            value={workflowChecklistDraft.code}
                                            onChange={(event) => setWorkflowChecklistDraft((current) => ({ ...current, code: event.target.value }))}
                                            placeholder="CHECK_CODE"
                                            className="h-8 rounded border border-slate-200 bg-white px-2 text-[11px] font-bold uppercase text-slate-700 outline-none focus:border-amber-400"
                                          />
                                          <input
                                            value={workflowChecklistDraft.label}
                                            onChange={(event) => setWorkflowChecklistDraft((current) => ({ ...current, label: event.target.value }))}
                                            placeholder="รายละเอียด checklist"
                                            className="h-8 rounded border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 outline-none focus:border-amber-400"
                                          />
                                          <div className="grid grid-cols-[minmax(0,1fr)_72px] gap-1">
                                            <select
                                              value={workflowChecklistDraft.gateSeverity}
                                              onChange={(event) => setWorkflowChecklistDraft((current) => ({ ...current, gateSeverity: event.target.value }))}
                                              className="h-8 rounded border border-slate-200 bg-white px-2 text-[10px] font-bold text-slate-600 outline-none"
                                            >
                                              {workflowGateSeverityOptions.map((severity) => <option key={severity} value={severity}>{severity}</option>)}
                                            </select>
                                            <button
                                              type="button"
                                              onClick={() => handleAddWorkflowChecklist(selectedBuilderStage)}
                                              disabled={workflowBuilderLoading === 'add-checklist'}
                                              className="h-8 rounded bg-slate-950 text-[10px] font-bold text-white disabled:bg-slate-300"
                                            >
                                              เพิ่ม
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  <div className="rounded-lg border border-slate-200">
                                    <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                                      <div>
                                        <p className="text-[12px] font-bold text-slate-950">เอกสารบังคับ</p>
                                        <p className="text-[10px] font-medium text-slate-400">เลือก Drive folder และระดับ gate ให้ตรงกับเอกสารจริง</p>
                                      </div>
                                      <span className="text-[11px] font-bold text-slate-400">{(selectedBuilderStage.documents || []).length}</span>
                                    </div>
                                    <div className="max-h-44 overflow-y-auto p-2">
                                      {(selectedBuilderStage.documents || []).length === 0 ? (
                                        <p className="px-2 py-3 text-[12px] font-medium text-slate-400">ยังไม่มีเอกสาร</p>
                                      ) : (selectedBuilderStage.documents || []).map((item: any) => (
                                        <div key={item.id} className="rounded-md px-2 py-2 text-[12px] hover:bg-slate-50">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="truncate font-semibold text-slate-700">{item.name}</span>
                                            <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold ${gateSeverityClass(item.gate_severity)}`}>{item.gate_severity}</span>
                                          </div>
                                          {builderIsDraft && (
                                            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_92px_72px] gap-1">
                                              <input
                                                defaultValue={item.name}
                                                onBlur={(event) => event.target.value !== item.name && handleUpdateWorkflowDocument(item, { name: event.target.value })}
                                                className="h-8 rounded border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 outline-none focus:border-amber-400"
                                              />
                                              <select
                                                value={item.gate_severity}
                                                onChange={(event) => handleUpdateWorkflowDocument(item, { gateSeverity: event.target.value })}
                                                className="h-8 rounded border border-slate-200 bg-white px-1 text-[10px] font-bold text-slate-600 outline-none"
                                              >
                                                {workflowGateSeverityOptions.map((severity) => <option key={severity} value={severity}>{severity}</option>)}
                                              </select>
                                              <label className="flex h-8 items-center justify-center gap-1 rounded border border-slate-200 bg-white text-[10px] font-bold text-slate-500">
                                                <input
                                                  type="checkbox"
                                                  checked={item.requires_verification !== false}
                                                  onChange={(event) => handleUpdateWorkflowDocument(item, { requiresVerification: event.target.checked })}
                                                  className="h-3 w-3 accent-amber-500"
                                                />
                                                ตรวจ
                                              </label>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                    {builderIsDraft && (
                                      <div className="border-t border-slate-100 p-2">
                                        <div className="grid gap-1">
                                          <input
                                            value={workflowDocumentDraft.code}
                                            onChange={(event) => setWorkflowDocumentDraft((current) => ({ ...current, code: event.target.value }))}
                                            placeholder="DOC_CODE"
                                            className="h-8 rounded border border-slate-200 bg-white px-2 text-[11px] font-bold uppercase text-slate-700 outline-none focus:border-amber-400"
                                          />
                                          <input
                                            value={workflowDocumentDraft.name}
                                            onChange={(event) => setWorkflowDocumentDraft((current) => ({ ...current, name: event.target.value }))}
                                            placeholder="ชื่อเอกสาร"
                                            className="h-8 rounded border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 outline-none focus:border-amber-400"
                                          />
                                          <select
                                            value={workflowDocumentDraft.driveFolderKey}
                                            onChange={(event) => setWorkflowDocumentDraft((current) => ({ ...current, driveFolderKey: event.target.value }))}
                                            className="h-8 rounded border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 outline-none focus:border-amber-400"
                                          >
                                            {workflowDriveFolderOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                          </select>
                                          <div className="grid grid-cols-[minmax(0,1fr)_72px] gap-1">
                                            <select
                                              value={workflowDocumentDraft.gateSeverity}
                                              onChange={(event) => setWorkflowDocumentDraft((current) => ({ ...current, gateSeverity: event.target.value }))}
                                              className="h-8 rounded border border-slate-200 bg-white px-2 text-[10px] font-bold text-slate-600 outline-none"
                                            >
                                              {workflowGateSeverityOptions.map((severity) => <option key={severity} value={severity}>{severity}</option>)}
                                            </select>
                                            <button
                                              type="button"
                                              onClick={() => handleAddWorkflowDocument(selectedBuilderStage)}
                                              disabled={workflowBuilderLoading === 'add-document'}
                                              className="h-8 rounded bg-slate-950 text-[10px] font-bold text-white disabled:bg-slate-300"
                                            >
                                              เพิ่ม
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="rounded-lg border border-dashed border-slate-200 px-3 py-8 text-center text-[12px] font-medium text-slate-400">เลือก Stage เพื่อดูรายละเอียด</div>
                              )}
                            </aside>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                            <div className="border-b border-slate-100 px-5 py-4">
                              <h3 className="text-[14px] font-bold text-slate-950">กำกับ Workflow รายขั้นตอน</h3>
                              <p className="text-[12px] text-slate-500">ตรวจ SLA, ผู้รับผิดชอบ, checklist, เอกสารบังคับ และ hard gate ของแต่ละขั้นตอน</p>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[900px] text-left">
                                <thead>
                                  <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                    <th className="px-4 py-3">#</th>
                                    <th className="px-4 py-3">Stage</th>
                                    <th className="px-4 py-3">SLA</th>
                                    <th className="px-4 py-3">Owner</th>
                                    <th className="px-4 py-3">Checklist</th>
                                    <th className="px-4 py-3">Docs</th>
                                    <th className="px-4 py-3">Hard Gates</th>
                                    <th className="px-4 py-3">Role</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-[12px]">
                                  {stages.map((stage: any) => {
                                    const hardStageGates = [...(stage.checklists || []), ...(stage.documents || [])].filter((item: any) => item.gate_severity === 'HARD').length;
                                    const display = stageDisplay(stage);
                                    return (
                                      <tr key={stage.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 font-bold text-slate-400">{stage.order_index}</td>
                                        <td className="px-4 py-3">
                                          <div className="flex min-w-0 items-center gap-2">
                                            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${stageVisual(stage).iconClass}`}>
                                              <StageIcon name={stageVisual(stage).icon} />
                                            </span>
                                            <div className="min-w-0">
                                              <p className="truncate font-bold text-slate-950">{display.title}</p>
                                              <p className="font-mono text-[10px] font-bold text-slate-400">{stage.code} / {stage.name}</p>
                                            </div>
                                          </div>
                                        </td>
                                        <td className="px-4 py-3 font-bold text-slate-800">{formatSlaDuration(stage.sla_hours)}</td>
                                        <td className="px-4 py-3 font-bold text-slate-800">{stageOwner(stage)}</td>
                                        <td className="px-4 py-3 font-bold text-slate-800">{(stage.checklists || []).length}</td>
                                        <td className="px-4 py-3 font-bold text-slate-800">{(stage.documents || []).length}</td>
                                        <td className="px-4 py-3">
                                          <span className={`rounded border px-2 py-1 text-[10px] font-bold ${hardStageGates ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                                            {hardStageGates}
                                          </span>
                                        </td>
                                        <td className="px-4 py-3">
                                          <div className="flex flex-wrap gap-1">
                                            {stage.is_start && <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">START</span>}
                                            {stage.is_terminal && <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-600">TERMINAL</span>}
                                            {!stage.is_active && <span className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700">INACTIVE</span>}
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                              <h3 className="text-[13px] font-bold text-slate-950">Project Locking Rule</h3>
                              <div className="mt-4 space-y-3 text-[12px] font-medium text-slate-600">
                                <p><b className="text-slate-950">Workflow:</b> project lock  `workflow_version_id` </p>
                                <p><b className="text-slate-950">Standard:</b> project lock  `applied_standard_id`  V8R2</p>
                                <p><b className="text-slate-950">Files:</b> Google Drive stores files; Supabase stores metadata.</p>
                              </div>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                              <h3 className="text-[13px] font-bold text-slate-950">Drive Folder Governance</h3>
                              <div className="mt-4 space-y-2 text-[12px] font-semibold text-slate-600">
                                {['01_Sales_Commercial', '02_Survey_TSSR', '03_Loan_Documents', '04_Installation_Photos', '05_Site_Folder_Handover', '06_Billing_Finance'].map((folder) => (
                                  <div key={folder} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">{folder}</div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                        </div>
                      </>
                    );
                  })()}
                </>
              )}
            </div>
          ) : !selectedProject ? (
            <div className="mx-auto max-w-[1200px] space-y-6 pt-1">
              <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[13px] font-extrabold text-slate-950">Project Search</p>
                  <p className="text-[12px] font-medium text-slate-500">
                    Showing {displayedProjects.length} of {projects.length} projects
                  </p>
                </div>
                <div className="flex w-full gap-2 sm:max-w-md">
                  <input
                    type="search"
                    value={projectSearch}
                    onChange={(event) => setProjectSearch(event.target.value)}
                    placeholder="Search customer code or customer name"
                    className="h-10 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  />
                  {projectSearch && (
                    <button
                      type="button"
                      onClick={() => setProjectSearch("")}
                      className="h-10 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-600 transition-colors hover:bg-slate-50"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-[#f9fafb] text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                      <th className="px-4 py-3.5">Project Name</th>
                      <th className="px-4 py-3.5">Code</th>
                      <th className="px-4 py-3.5">Current Stage</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[13px]">
                    {loading ? (
                      <tr><td colSpan={5} className="p-8 text-center text-slate-500">Loading...</td></tr>
                    ) : displayedProjects.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-[13px] font-semibold text-slate-500">
                          No projects match this customer code or customer name.
                        </td>
                      </tr>
                    ) : (
                      displayedProjects.map((project) => {
                        const currentStage = Array.isArray(project.current_stage) ? project.current_stage[0] : project.current_stage;

                        return (
                          <tr key={project.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3.5 font-semibold text-slate-950">{project.customer_name}</td>
                            <td className="px-4 py-3.5 font-mono text-[11px] font-medium text-slate-500">{project.customer_code}</td>
                            <td className="px-4 py-3.5">
                              <div className="flex min-w-0 flex-col gap-1">
                                <span className="truncate font-semibold text-slate-800">
                                  {currentStage?.name || (project.status === 'COMPLETED' ? 'Completed' : 'Runtime not generated')}
                                </span>
                                <span className="font-mono text-[10px] font-bold uppercase text-slate-400">
                                  {currentStage?.code || project.project_type || 'N/A'}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="flex flex-wrap gap-1.5">
                                <span className={`inline-flex rounded border px-2 py-1 text-[11px] font-bold ${project.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                  {project.status === 'COMPLETED' ? 'Completed' : 'Active'}
                                </span>
                                <span className={`inline-flex rounded border px-2 py-1 text-[11px] font-bold ${projectStageToneClass(currentStage)}`}>
                                  {currentStage?.sla_status || project.sla_status || 'ON_TRACK'}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              <div className="flex justify-end gap-2">
                                <button onClick={() => handleSelectProject(project)} className="rounded border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-950 transition-colors hover:bg-slate-50">View</button>
                                {canDeleteProjects && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteProject(project)}
                                    disabled={deletingProjectId === project.id}
                                    className="rounded border border-rose-200 bg-rose-50 px-3 py-1.5 text-[12px] font-bold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                                  >
                                    {deletingProjectId === project.id ? "Deleting..." : "Delete"}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="w-full space-y-5">
              <section className="space-y-5">
                <div>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => setSelectedProject(null)}
                        className="mb-3 inline-flex items-center gap-2 text-[12px] font-bold text-slate-500 transition-colors hover:text-slate-950"
                      >
                        <span className="text-[16px] leading-none">&larr;</span>
                        Back to project list
                      </button>
                      <div className="flex flex-wrap items-center gap-3">
                        <h1 className="text-[28px] font-black leading-tight tracking-tight text-slate-950">{selectedProject.customer_code}</h1>
                        <span className={`rounded-full border px-3 py-1 text-[11px] font-black ${selectedProject.status === 'COMPLETED' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                          {selectedProject.status === 'COMPLETED' ? 'Completed' : 'Active'}
                        </span>
                        <span className={`rounded-full border px-3 py-1 text-[11px] font-black ${timelineRailTone === 'rose' ? 'border-rose-200 bg-rose-50 text-rose-700' : timelineRailTone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                          {statusLabel(currentMilestone?.sla_status || selectedProject.sla_status || 'ON_TRACK')}
                        </span>
                        {currentMilestone && (
                          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-white px-3 py-1 text-[11px] font-bold text-slate-600 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
                            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                            อยู่ในขั้นตอน : {stageDisplay(currentMilestone).title}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-semibold text-slate-500">
                        <span className="font-bold text-slate-800">{selectedProject.customer_name || 'ไม่ระบุชื่อลูกค้า'}</span>
                        <span className="text-slate-300">|</span>
                        <span>{selectedProject.project_type || 'RES-S'}</span>
                        <span className="text-slate-300">|</span>
                        <span>{selectedProjectSystemSize}{String(selectedProjectSystemSize).includes('kW') || selectedProjectSystemSize === '-' ? '' : ' kWp'}</span>
                        <span className="text-slate-300">|</span>
                        <span>{selectedProject.payment_type || 'CASH'}</span>
                        <span className="text-slate-300">|</span>
                        <span>{selectedProjectArea}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <button
                        type="button"
                        onClick={async () => {
                          const text = [
                            selectedProject.customer_code,
                            selectedProject.customer_name,
                            selectedProject.customer_phone,
                            selectedProject.payment_type,
                          ].filter(Boolean).join(' | ');
                          await navigator.clipboard?.writeText(text);
                          showNotice('success', 'คัดลอกข้อมูลซัพพอร์ตแล้ว', text);
                        }}
                        title="คัดลอกข้อมูลซัพพอร์ต"
                        aria-label="คัดลอกข้อมูลซัพพอร์ต"
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200/90 bg-white px-3 text-[12px] font-bold text-slate-700 shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition-colors hover:bg-slate-50"
                      >
                        <StageIcon name="file" />
                        คัดลอกข้อมูลซัพพอร์ต
                      </button>
                      <button
                        type="button"
                        onClick={() => window.print()}
                        title="พิมพ์"
                        aria-label="พิมพ์"
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200/90 bg-white px-3 text-[12px] font-bold text-slate-700 shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition-colors hover:bg-slate-50"
                      >
                        <StageIcon name="receipt" />
                        พิมพ์
                      </button>
                      <button
                        type="button"
                        onClick={() => projectLeadStage ? setSelectedStageId(projectLeadStage.id) : showNotice('info', 'No lead stage found')}
                        title="แก้ไขโครงการ"
                        aria-label="แก้ไขโครงการ"
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-3 text-[12px] font-bold text-white shadow-[0_8px_16px_rgba(37,99,235,0.18)] transition-colors hover:bg-blue-700"
                      >
                        <StageIcon name="tool" />
                        แก้ไขโครงการ
                      </button>
                    </div>
                  </div>

                  {totalMilestones > 0 && (
                    <div className="relative mt-3 overflow-hidden rounded-xl bg-white">
                      <div className="flex items-center justify-between gap-3 px-3 pt-2">
                        <span aria-hidden="true"></span>
                        <button
                          type="button"
                          title={showProjectStageSequence ? 'ซ่อนรายละเอียดลำดับขั้นตอน' : 'แสดงรายละเอียดลำดับขั้นตอน'}
                          aria-label={showProjectStageSequence ? 'ซ่อนรายละเอียดลำดับขั้นตอน' : 'แสดงรายละเอียดลำดับขั้นตอน'}
                          onClick={() => setShowProjectStageSequence((current) => !current)}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                        >
                          <span className="[&_svg]:h-5 [&_svg]:w-5"><StageIcon name="expand" /></span>
                        </button>
                      </div>
                      <div className="relative">
                        {!showProjectStageSequence && stageRailOverflow.left && (
                          <>
                            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-white via-white/85 to-transparent"></div>
                            <button
                              type="button"
                              aria-label="เลื่อนลำดับขั้นตอนไปทางซ้าย"
                              title="เลื่อนลำดับขั้นตอนไปทางซ้าย"
                              onClick={() => scrollStageRail('left')}
                              className="absolute left-4 top-[38%] z-20 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-sky-100 bg-white/95 text-sky-600 shadow-[0_8px_18px_rgba(37,99,235,0.12)] transition-all hover:-translate-y-[52%] hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
                            >
                              <span className="[&_svg]:h-5 [&_svg]:w-5"><StageIcon name="chevronLeft" /></span>
                            </button>
                          </>
                        )}
                        {!showProjectStageSequence && stageRailOverflow.right && (
                          <>
                            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-white via-white/85 to-transparent"></div>
                            <button
                              type="button"
                              aria-label="เลื่อนลำดับขั้นตอนไปทางขวา"
                              title="เลื่อนลำดับขั้นตอนไปทางขวา"
                              onClick={() => scrollStageRail('right')}
                              className="absolute right-4 top-[38%] z-20 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-sky-100 bg-white/95 text-sky-600 shadow-[0_8px_18px_rgba(37,99,235,0.12)] transition-all hover:-translate-y-[52%] hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
                            >
                              <span className="[&_svg]:h-5 [&_svg]:w-5"><StageIcon name="chevronRight" /></span>
                            </button>
                          </>
                        )}
                      <div
                        ref={stageRailRef}
                        onScroll={updateStageRailOverflow}
                        onPointerDown={handleStageRailPointerDown}
                        onPointerMove={handleStageRailPointerMove}
                        onPointerUp={endStageRailDrag}
                        onPointerCancel={endStageRailDrag}
                        onPointerLeave={endStageRailDrag}
                        onClickCapture={handleStageRailClickCapture}
                        className={`${showProjectStageSequence ? 'overflow-x-auto px-3 pb-3' : 'scrollbar-none overflow-x-auto pb-2 pl-0 pr-14'} select-none pt-2 ${stageRailDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                      >
                        <div
                          className="min-w-max"
                          style={{ width: `max(100%, ${workflowStageTrackWidth}px)` }}
                        >
                        <div
                          className="grid pt-3 transition-[gap] duration-200"
                          style={{
                            gap: `${workflowStageGapPx}px`,
                            gridTemplateColumns: `repeat(${Math.max(milestones.length, 1)}, minmax(${workflowStageColumnWidth}px, ${workflowStageColumnWidth}px))`,
                          }}
                        >
                          {milestones.map((stage: any, index: number) => {
                            const isDone = stage.dynamicStatus === 'Completed';
                            const isCurrent = stage.id === timelineTargetStage?.id;
                            const visual = stageVisual(stage);
                            const solidStageClass = stageSolidIconClass(stage);
                            const isOverdue = stage.dynamicStatus === 'Overdue';
                            const isNearSla = stage.dynamicStatus === 'Near SLA';
                            const isBlocked = stage.dynamicStatus === 'Blocked';
                            const activeMarkerClass = isOverdue || isBlocked
                              ? 'active-stage-marker is-overdue'
                              : isNearSla
                                ? 'active-stage-marker is-near-sla'
                                : 'active-stage-marker is-on-track';
                            const showRunningTime = isCurrent && !stage.actual_completed_at && runningStageHours(stage);
                            const activeTone = isOverdue || isBlocked ? 'rose' : isNearSla ? 'amber' : 'emerald';
                            const nextStage = milestones[index + 1];
                            const badgeTone = isDone
                              ? "completed"
                              : isCurrent && (isBlocked || isOverdue)
                                ? "blocked"
                                : isCurrent && isNearSla
                                  ? "pending"
                                  : null;
                            const stageTone = isCurrent
                              ? activeTone === 'rose'
                                ? `border-rose-700 bg-rose-600 text-white shadow-xl shadow-rose-200/80 ring-4 ring-rose-100 ${activeMarkerClass}`
                                : activeTone === 'amber'
                                  ? `border-amber-700 bg-amber-500 text-white shadow-xl shadow-amber-200/80 ring-4 ring-amber-100 ${activeMarkerClass}`
                                  : `${solidStageClass} ring-4 ring-blue-100 ${activeMarkerClass}`
                              : isDone
                                ? solidStageClass
                                : 'border-slate-300 bg-gradient-to-br from-slate-100 via-slate-200 to-slate-300 text-slate-500 shadow-inner';
                            return (
                              <div key={stage.id} data-stage-id={stage.id} className="relative flex min-w-0 justify-center">
                                {nextStage && (
                                  <WorkflowStageConnector
                                    tone={isDone ? "active" : "inactive"}
                                    style={{
                                      left: 'calc(50% + 29px)',
                                      width: `${workflowStageColumnWidth + workflowStageGapPx - 58}px`,
                                    }}
                                  />
                                )}
                                <button
                                  type="button"
                                  onClick={() => setSelectedStageId(stage.id)}
                                  title={stageDisplay(stage).title}
                                  className="group relative z-10 flex w-full flex-col items-center text-center"
                                >
                                  <WorkflowStageTile icon={visual.icon} className={stageTone} badgeTone={badgeTone} />
                                  <span className="mt-2 line-clamp-2 min-h-[28px] px-1 text-[10px] font-black leading-3 text-slate-900">{index + 1}. {stageDisplay(stage).title}</span>
                                  <span className={`mt-1 inline-flex min-h-[16px] items-center justify-center gap-1 text-[10px] font-semibold ${isCurrent ? 'text-blue-600' : isDone ? 'text-emerald-600' : 'text-slate-400'}`}>
                                    <span>{isCurrent ? 'กำลังดำเนินการ' : isDone ? 'เสร็จสิ้น' : 'รอเริ่ม'}</span>
                                    {showRunningTime && (
                                      <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${runningStageBadgeClass(stage)}`}>
                                        <span className="shrink-0 text-amber-600 [&_svg]:h-2.5 [&_svg]:w-2.5"><StageIcon name="wait" /></span>
                                        <span>{runningStageLabel(stage)}</span>
                                      </span>
                                    )}
                                  </span>
                                  <span className="mt-1 min-h-[14px] text-[10px] font-semibold text-slate-400">
                                    {stage.actual_completed_at ? timelineDateLabel(stage.actual_completed_at) : stage.started_at ? timelineDateLabel(stage.started_at) : ''}
                                  </span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                        {showProjectStageSequence && (
                          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 py-3 text-[11px] font-semibold text-slate-500">
                            <span className="inline-flex items-center gap-1.5"><span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-white [&_svg]:h-2.5 [&_svg]:w-2.5"><StageIcon name="check" /></span>เสร็จสิ้น</span>
                            <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-full border-2 border-emerald-500 bg-white"></span>กำลังดำเนินการ</span>
                            <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-full bg-slate-200"></span>รอเริ่ม</span>
                            <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-full bg-rose-500"></span>มีปัญหา/ติดขัด</span>
                            <span className="inline-flex items-center gap-1.5"><span className="text-amber-500 [&_svg]:h-3.5 [&_svg]:w-3.5"><StageIcon name="wait" /></span>รอการอนุมัติ</span>
                          </div>
                        )}
                        {showProjectStageSequence && (
                          <div className="mt-4 border-t border-slate-100 bg-[#f8fafc] pt-4">
                            <div
                              className="grid pb-1"
                              style={{
                                gap: `${workflowStageGapPx}px`,
                                gridTemplateColumns: `repeat(${Math.max(milestones.length, 1)}, minmax(${workflowStageColumnWidth}px, ${workflowStageColumnWidth}px))`,
                              }}
                            >
                              {milestones.map((stage: any, index: number) => {
                                const display = stageDisplay(stage);
                                const visual = stageVisual(stage);
                                const isCompleted = stage.dynamicStatus === 'Completed';
                                const isCurrent = stage.id === timelineTargetStage?.id;
                                const isOverdue = stage.dynamicStatus === 'Overdue';
                                const isNearSla = stage.dynamicStatus === 'Near SLA';
                                const isBlocked = stage.dynamicStatus === 'Blocked';
                                const activeDocuments = sortProjectDocuments(stage.documents || []).filter(isActiveDocumentVersion);
                                const gateItems = [...(stage.checklists || []), ...activeDocuments];
                                const passedGates = gateItems.filter(gateItemPassed).length;
                                const activeTone = isOverdue || isBlocked ? 'rose' : isNearSla ? 'amber' : 'emerald';
                                const cardClass = isCurrent
                                  ? activeTone === 'rose'
                                    ? 'border-rose-200 bg-rose-50/50 shadow-md shadow-rose-100/70'
                                    : activeTone === 'amber'
                                      ? 'border-amber-200 bg-amber-50/50 shadow-md shadow-amber-100/70'
                                      : 'border-emerald-200 bg-emerald-50/60 shadow-md shadow-emerald-100/70'
                                  : isCompleted
                                    ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-white shadow-sm shadow-emerald-100/70'
                                    : 'border-slate-200 bg-slate-50/70 opacity-80';
                                const deadlineTextClass = isOverdue || isBlocked
                                  ? 'font-semibold text-rose-600'
                                  : isNearSla
                                    ? 'font-semibold text-amber-600'
                                  : 'font-semibold text-slate-800';

                                return (
                                  <div key={stage.id} className="relative min-w-0">
                                    <button
                                      type="button"
                                      onClick={() => setSelectedStageId(stage.id)}
                                      className={`relative flex min-h-[190px] w-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-lg border p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${cardClass}`}
                                    >
                                      <span className={`absolute inset-x-0 top-0 h-1 ${isCurrent ? activeTone === 'rose' ? 'bg-rose-500' : activeTone === 'amber' ? 'bg-amber-500' : 'bg-emerald-500' : isCompleted ? 'bg-emerald-400' : 'bg-slate-200'}`}></span>
                                      <div className="flex min-h-11 items-start gap-2">
                                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${isCompleted ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : visual.iconClass}`}>
                                          <StageIcon name={visual.icon} />
                                        </span>
                                        <div className="min-w-0">
                                          <h4 className="line-clamp-2 text-[12px] font-bold leading-4 text-slate-950">{display.title}</h4>
                                          <div className="mt-1 flex flex-wrap gap-1">
                                            {isBlocked && <span className="rounded border border-rose-100 bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-600">BLOCKED</span>}
                                            {isOverdue && <span className="rounded border border-rose-100 bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-600">OVERDUE</span>}
                                            {isNearSla && <span className="rounded border border-amber-100 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">NEAR SLA</span>}
                                            {isCurrent && !isOverdue && !isNearSla && !isBlocked && <span className="rounded border border-emerald-200 bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">ACTIVE</span>}
                                            {isCompleted && <span className="rounded border border-emerald-200 bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">DONE</span>}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="mt-3 grid gap-1.5 text-[11px] text-slate-500">
                                        <div className="flex items-center justify-between gap-2"><span className="shrink-0">SLA</span><b className="whitespace-nowrap font-semibold text-slate-800">{formatSlaDuration(stage.workflow_definitions?.sla_hours || stage.workflow_stages?.sla_hours || stage.sla_hours)}</b></div>
                                        <div className="flex items-center justify-between gap-2"><span className="shrink-0">เริ่มเมื่อ</span><b className="whitespace-nowrap text-[10px] font-semibold text-slate-800">{formatDateTime(stage.started_at)}</b></div>
                                        <div className="flex items-center justify-between gap-2"><span>{isCompleted ? 'เสร็จเมื่อ' : 'Deadline'}</span><b className={`truncate ${deadlineTextClass}`}>{stage.actual_completed_at ? formatDateTime(stage.actual_completed_at) : stage.deadline ? formatDateTime(stage.deadline) : 'N/A'}</b></div>
                                        <div className="flex items-center justify-between gap-2"><span>ผู้รับผิดชอบ</span><b className="truncate font-semibold text-slate-800">{stageOwner(stage)}</b></div>
                                        <div className="flex items-center justify-between gap-2"><span>Gates</span><b className={`truncate font-semibold ${gateItems.length && passedGates < gateItems.length ? 'text-amber-700' : 'text-slate-800'}`}>{gateItems.length ? `${passedGates}/${gateItems.length}` : 'ไม่มี'}</b></div>
                                      </div>
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        </div>
                      </div>
                      </div>

                        <div className={`${showProjectStageSequence ? 'hidden' : 'mx-3 flex'} flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 py-3 text-[11px] font-semibold text-slate-500`}>
                          <span className="inline-flex items-center gap-1.5"><span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-white [&_svg]:h-2.5 [&_svg]:w-2.5"><StageIcon name="check" /></span>เสร็จสิ้น</span>
                          <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-full border-2 border-emerald-500 bg-white"></span>กำลังดำเนินการ</span>
                          <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-full bg-slate-200"></span>รอเริ่ม</span>
                          <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-full bg-rose-500"></span>มีปัญหา/ติดขัด</span>
                          <span className="inline-flex items-center gap-1.5"><span className="text-amber-500 [&_svg]:h-3.5 [&_svg]:w-3.5"><StageIcon name="wait" /></span>รอการอนุมัติ</span>
                        </div>

                          {false && showProjectStageSequence && (
                            <div className="overflow-x-auto px-3 pb-4">
                            <div
                              className="min-w-max border-t border-slate-100 bg-[#f8fafc] pt-4"
                              style={{ width: `max(100%, ${workflowStageTrackWidth}px)` }}
                            >
                            <div
                              className="grid pb-1"
                              style={{
                                gap: `${workflowStageGapPx}px`,
                                gridTemplateColumns: `repeat(${Math.max(milestones.length, 1)}, minmax(${workflowStageColumnWidth}px, ${workflowStageColumnWidth}px))`,
                              }}
                            >
                              {milestones.map((stage: any, index: number) => {
                                const display = stageDisplay(stage);
                                const visual = stageVisual(stage);
                                const isCompleted = stage.dynamicStatus === 'Completed';
                                const isCurrent = stage.id === timelineTargetStage?.id;
                                const isOverdue = stage.dynamicStatus === 'Overdue';
                                const isNearSla = stage.dynamicStatus === 'Near SLA';
                                const isBlocked = stage.dynamicStatus === 'Blocked';
                                const activeDocuments = sortProjectDocuments(stage.documents || []).filter(isActiveDocumentVersion);
                                const gateItems = [...(stage.checklists || []), ...activeDocuments];
                                const passedGates = gateItems.filter(gateItemPassed).length;
                                const activeTone = isOverdue || isBlocked ? 'rose' : isNearSla ? 'amber' : 'emerald';
                                const cardClass = isCurrent
                                  ? activeTone === 'rose'
                                    ? 'border-rose-200 bg-rose-50/50 shadow-md shadow-rose-100/70'
                                    : activeTone === 'amber'
                                      ? 'border-amber-200 bg-amber-50/50 shadow-md shadow-amber-100/70'
                                      : 'border-emerald-200 bg-emerald-50/60 shadow-md shadow-emerald-100/70'
                                  : isCompleted
                                    ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-white shadow-sm shadow-emerald-100/70'
                                    : 'border-slate-200 bg-slate-50/70 opacity-80';
                                const deadlineTextClass = isOverdue || isBlocked
                                  ? 'font-semibold text-rose-600'
                                  : isNearSla
                                    ? 'font-semibold text-amber-600'
                                  : 'font-semibold text-slate-800';

                                return (
                                  <div key={stage.id} className="relative min-w-0">
                                    <button
                                      type="button"
                                      onClick={() => setSelectedStageId(stage.id)}
                                      className={`relative flex min-h-[190px] w-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-lg border p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${cardClass}`}
                                    >
                                      <span className={`absolute inset-x-0 top-0 h-1 ${isCurrent ? activeTone === 'rose' ? 'bg-rose-500' : activeTone === 'amber' ? 'bg-amber-500' : 'bg-emerald-500' : isCompleted ? 'bg-emerald-400' : 'bg-slate-200'}`}></span>
                                      <div className="flex min-h-11 items-start gap-2">
                                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${isCompleted ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : visual.iconClass}`}>
                                          <StageIcon name={visual.icon} />
                                        </span>
                                        <div className="min-w-0">
                                          <h4 className="line-clamp-2 text-[12px] font-bold leading-4 text-slate-950">{display.title}</h4>
                                          <div className="mt-1 flex flex-wrap gap-1">
                                            {isBlocked && <span className="rounded border border-rose-100 bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-600">BLOCKED</span>}
                                            {isOverdue && <span className="rounded border border-rose-100 bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-600">OVERDUE</span>}
                                            {isNearSla && <span className="rounded border border-amber-100 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">NEAR SLA</span>}
                                            {isCurrent && !isOverdue && !isNearSla && !isBlocked && <span className="rounded border border-emerald-200 bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">ACTIVE</span>}
                                            {isCompleted && <span className="rounded border border-emerald-200 bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">DONE</span>}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="mt-3 grid gap-1.5 text-[11px] text-slate-500">
                                        <div className="flex items-center justify-between gap-2"><span className="shrink-0">SLA</span><b className="whitespace-nowrap font-semibold text-slate-800">{formatSlaDuration(stage.workflow_definitions?.sla_hours || stage.workflow_stages?.sla_hours || stage.sla_hours)}</b></div>
                                        <div className="flex items-center justify-between gap-2"><span className="shrink-0">เริ่มเมื่อ</span><b className="whitespace-nowrap text-[10px] font-semibold text-slate-800">{formatDateTime(stage.started_at)}</b></div>
                                        <div className="flex items-center justify-between gap-2"><span>{isCompleted ? 'เสร็จเมื่อ' : 'Deadline'}</span><b className={`truncate ${deadlineTextClass}`}>{stage.actual_completed_at ? formatDateTime(stage.actual_completed_at) : stage.deadline ? formatDateTime(stage.deadline) : 'N/A'}</b></div>
                                        <div className="flex items-center justify-between gap-2"><span>ผู้รับผิดชอบ</span><b className="truncate font-semibold text-slate-800">{stageOwner(stage)}</b></div>
                                        <div className="flex items-center justify-between gap-2"><span>Gates</span><b className={`truncate font-semibold ${gateItems.length && passedGates < gateItems.length ? 'text-amber-700' : 'text-slate-800'}`}>{gateItems.length ? `${passedGates}/${gateItems.length}` : 'ไม่มี'}</b></div>
                                      </div>
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                            </div>
                            </div>
                          )}
                    </div>
                  )}

                  <div className="mt-5 grid gap-3 lg:grid-cols-4">
                    <div className={`relative self-start overflow-hidden rounded-xl border px-4 py-4 shadow-[0_8px_22px_rgba(15,23,42,0.045)] ${summaryCardClass(statusSummaryTone)}`}>
                      <span className={`pointer-events-none absolute -right-5 -top-4 opacity-[0.08] [&_svg]:h-28 [&_svg]:w-28 ${summaryWatermarkClass(statusSummaryTone)}`}><StageIcon name="check" /></span>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[12px] font-black text-slate-950">สถานะโครงการ</p>
                          <p className="mt-2 text-[13px] font-bold text-slate-800">{currentMilestone ? stageDisplay(currentMilestone).title : 'ไม่พบขั้นตอน'}</p>
                          <p className="mt-1 text-[11px] font-semibold text-slate-500">Owner: {currentMilestone ? stageOwner(currentMilestone) : '-'}</p>
                        </div>
                        <span className={`h-2.5 w-2.5 rounded-full ${timelineRailTone === 'rose' ? 'bg-rose-500' : timelineRailTone === 'amber' ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                      </div>
                      <div
                        className="mt-4 rounded-lg border border-slate-100 bg-white px-3 py-3 shadow-[0_1px_6px_rgba(15,23,42,0.035)]"
                        title={currentMilestone ? stageDisplay(currentMilestone).title : undefined}
                        aria-label={`ขั้นตอนปัจจุบัน ${timelineTargetIndex + 1} จาก ${totalMilestones}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border ${statusMiniRailSolidClass}`}>
                              <StageIcon name={statusMiniRailVisual.icon} className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-[12px] font-black text-slate-900">{currentMilestone ? stageDisplay(currentMilestone).title : '-'}</p>
                              <p className="text-[10px] font-semibold text-slate-500">ขั้นที่ {timelineTargetIndex + 1} จาก {totalMilestones}</p>
                            </div>
                          </div>
                          <span className="shrink-0 rounded-full border border-emerald-100 bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700">
                            {completedMilestones}/{totalMilestones}
                          </span>
                        </div>
                        <div className="relative mt-3 h-2 rounded-full bg-slate-200">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progressPercent}%` }}></div>
                          <span
                            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-600 shadow-[0_2px_8px_rgba(5,150,105,0.28)]"
                            style={{ left: `${progressPercent}%` }}
                          ></span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3 text-[11px] font-bold text-slate-500">
                          <p>เสร็จสิ้นแล้ว {completedMilestones} ขั้นตอน</p>
                          <p className="text-[10px] font-black text-slate-400">{progressPercent}%</p>
                        </div>
                      </div>
                      <div className="hidden" aria-label={`ขั้นตอนปัจจุบัน ${timelineTargetIndex + 1} จาก ${totalMilestones}`}>
                        {milestones.map((stage: any, index: number) => {
                          const isDone = stage.actual_completed_at || stage.dynamicStatus === 'Completed';
                          const isCurrent = stage.id === timelineTargetStage?.id;
                          return (
                            <div key={stage.id || index} className="flex flex-1 items-center last:flex-none">
                              <span
                                title={stageDisplay(stage).title}
                                className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                                  isCurrent
                                    ? 'border-emerald-500 bg-white ring-4 ring-emerald-100'
                                    : isDone
                                      ? 'border-emerald-500 bg-emerald-500'
                                      : 'border-slate-200 bg-slate-100'
                                }`}
                              >
                                {isCurrent && <span className="h-2 w-2 rounded-full bg-emerald-500"></span>}
                              </span>
                              {index < milestones.length - 1 && (
                                <span className={`h-0.5 flex-1 ${isDone ? 'bg-emerald-300' : 'bg-slate-200'}`}></span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="hidden">
                        <p>กำลังดำเนินการขั้นที่ {timelineTargetIndex + 1} จาก {totalMilestones}</p>
                        <p>เสร็จสิ้นแล้ว {completedMilestones} ขั้นตอน</p>
                      </div>
                    </div>

                    <div className={`relative overflow-hidden rounded-xl border px-4 py-4 shadow-[0_8px_22px_rgba(15,23,42,0.045)] ${summaryCardClass(actionSummaryTone)}`}>
                      <span className={`pointer-events-none absolute -right-5 -top-4 opacity-[0.08] [&_svg]:h-28 [&_svg]:w-28 ${summaryWatermarkClass(actionSummaryTone)}`}><StageIcon name="arrowRight" /></span>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[12px] font-black text-slate-950">{currentStageBlockers.length ? 'สิ่งที่ต้องดำเนินการ' : 'พร้อมไปขั้นถัดไป'}</p>
                          {currentStageBlockers.length ? (
                            <p className="mt-2 text-[22px] font-black text-rose-600">{currentStageBlockers.length}</p>
                          ) : (
                            <p className="mt-2 text-[14px] font-black text-emerald-700">ไม่มี blocker</p>
                          )}
                          <p className="text-[11px] font-semibold text-slate-600">{currentStageBlockers.length ? (nextActionAssistant?.status || 'blocking gates') : 'ยืนยันงานปัจจุบันเพื่อไปขั้นถัดไป'}</p>
                        </div>
                      </div>
                      {nextActionAssistant && (
                        <div className="mt-3 rounded-md border border-slate-100 bg-white px-3 py-2 shadow-[0_1px_4px_rgba(15,23,42,0.035)]">
                          <p className="line-clamp-1 text-[12px] font-black text-slate-950">{nextActionAssistant.title}</p>
                          <p className="mt-1 line-clamp-2 text-[12px] font-semibold leading-5 text-slate-700">{nextActionAssistant.suggestion}</p>
                        </div>
                      )}
                      {currentMilestone && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {canCompleteCurrentStage ? (
                            <button
                              type="button"
                              onClick={() => currentStageReady ? handleCompleteMilestone(currentMilestone.id) : setSelectedStageId(currentMilestone.id)}
                              disabled={completingStageId === currentMilestone.id}
                              className={`min-h-9 rounded-md px-3 py-2 text-[11px] font-bold shadow-sm transition-colors disabled:cursor-not-allowed disabled:bg-slate-300 ${
                                currentStageReady
                                  ? 'bg-slate-950 text-white shadow-[0_8px_16px_rgba(15,23,42,0.18)] hover:bg-slate-800'
                                  : 'border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                              }`}
                            >
                              {completingStageId === currentMilestone.id ? 'กำลังบันทึก...' : currentStageReady ? completionButtonLabel(currentMilestone) : 'ดูรายการที่ติดอยู่'}
                            </button>
                          ) : (
                            <span className="rounded-md border border-slate-200 bg-white/70 px-3 py-2 text-[11px] font-bold text-slate-600">
                              รอ {stageOwner(currentMilestone)}
                            </span>
                          )}
                        </div>
                      )}
                      {currentStageBlockers[0] && (
                        <button type="button" onClick={() => currentMilestone && setSelectedStageId(currentMilestone.id)} className="mt-3 text-left text-[11px] font-bold text-rose-700 underline decoration-rose-200">
                          {gateBlockerSummary(currentStageBlockers[0])}
                        </button>
                      )}
                    </div>

                    <div className={`relative overflow-hidden rounded-xl border px-4 py-4 shadow-[0_8px_22px_rgba(15,23,42,0.045)] ${summaryCardClass(approvalSummaryTone)}`}>
                      <span className={`pointer-events-none absolute -right-5 -top-4 opacity-[0.08] [&_svg]:h-28 [&_svg]:w-28 ${summaryWatermarkClass(approvalSummaryTone)}`}><StageIcon name="wait" /></span>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[12px] font-black text-slate-950">การอนุมัติที่รออยู่</p>
                          <p className={`mt-2 text-[22px] font-black ${projectPendingApprovals.length ? 'text-amber-600' : 'text-slate-400'}`}>{projectPendingApprovals.length}</p>
                          <p className="text-[11px] font-semibold text-slate-600">
                            {projectPendingApprovals.length ? `\u0e23\u0e2d\u0e2d\u0e19\u0e38\u0e21\u0e31\u0e15\u0e34 ${projectPendingApprovals.length} \u0e23\u0e32\u0e22\u0e01\u0e32\u0e23` : "\u0e44\u0e21\u0e48\u0e21\u0e35\u0e04\u0e33\u0e02\u0e2d\u0e2d\u0e19\u0e38\u0e21\u0e31\u0e15\u0e34"}
                          </p>
                          <p className="mt-1 text-[11px] font-semibold text-slate-500">
                            {projectOpenExceptions.length ? `exception \u0e04\u0e49\u0e32\u0e07 ${projectOpenExceptions.length}` : "\u0e44\u0e21\u0e48\u0e21\u0e35 exception \u0e04\u0e49\u0e32\u0e07"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className={`relative overflow-hidden rounded-xl border px-4 py-4 shadow-[0_8px_22px_rgba(15,23,42,0.045)] ${summaryCardClass(documentSummaryTone)}`}>
                      <span className={`pointer-events-none absolute -right-5 -top-4 opacity-[0.08] [&_svg]:h-28 [&_svg]:w-28 ${summaryWatermarkClass(documentSummaryTone)}`}><StageIcon name="file" /></span>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[12px] font-black text-slate-950">เอกสาร</p>
                          <div className="mt-3 grid grid-cols-2 gap-3">
                            <div>
                              <p className={`text-[22px] font-black ${currentStageDocumentRiskCount ? 'text-rose-600' : currentStageRequiredDocuments.length ? 'text-blue-600' : 'text-slate-500'}`}>{currentStageVerifiedDocuments.length}/{currentStageRequiredDocuments.length}</p>
                              <p className="text-[11px] font-semibold text-slate-600">เอกสารที่ต้องใช้ตอนนี้</p>
                            </div>
                            <div className="border-l border-slate-200 pl-3">
                              <p className={`text-[22px] font-black ${projectDocumentHealthPercent >= 100 ? 'text-emerald-700' : projectDocumentHealthPercent > 0 ? 'text-blue-600' : 'text-slate-500'}`}>{projectVerifiedDocuments.length}/{projectRequiredDocuments.length}</p>
                              <p className="text-[11px] font-semibold text-slate-600">เอกสารทั้งหมด</p>
                            </div>
                          </div>
                          <p className="mt-2 text-[11px] font-semibold text-slate-600">Verified {projectDocumentHealthPercent}% / Drive {projectDriveLinkedPercent}%</p>
                        </div>
                        <button
                          type="button"
                          title={showProjectDocumentControl ? 'ซ่อนการควบคุมเอกสาร' : 'แสดงการควบคุมเอกสาร'}
                          aria-label={showProjectDocumentControl ? 'ซ่อนการควบคุมเอกสาร' : 'แสดงการควบคุมเอกสาร'}
                          onClick={() => setShowProjectDocumentControl((current) => !current)}
                          className={`grid h-8 w-8 place-items-center rounded-md border shadow-sm transition-colors hover:bg-white hover:text-slate-950 ${summaryIconClass(documentSummaryTone)}`}
                        >
                          <StageIcon name="file" />
                        </button>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/80">
                        <div
                          className={`h-full rounded-full ${currentStageDocumentRiskCount ? 'bg-rose-500' : projectDocumentHealthPercent >= 100 ? 'bg-emerald-500' : projectDocumentHealthPercent > 0 ? 'bg-blue-500' : 'bg-slate-300'}`}
                          style={{ width: projectDocumentHealthPercent > 0 ? `${projectDocumentHealthPercent}%` : '0%' }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
                    <div className={`relative overflow-hidden rounded-xl border px-4 py-4 shadow-[0_8px_22px_rgba(15,23,42,0.045)] ${summaryCardClass("blue")}`}>
                      <span className={`pointer-events-none absolute bottom-2 right-8 opacity-[0.06] [&_svg]:h-28 [&_svg]:w-28 ${summaryWatermarkClass("blue")}`}><StageIcon name="activity" /></span>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[13px] font-black text-slate-950">Activity ล่าสุด</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {projectActivities.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setStageHistoryScope('all')}
                              className="rounded border border-blue-100 bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700 transition-colors hover:bg-blue-100"
                            >
                              ดูทั้งหมด
                            </button>
                          )}
                          <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-500">{projectActivities.length} events</span>
                        </div>
                      </div>
                      <div className="mt-4 space-y-2">
                        {projectLatestActivities.length === 0 ? (
                          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50/60 px-3 py-5 text-center">
                            <p className="text-[12px] font-black text-slate-500">ยังไม่มีกิจกรรมล่าสุด</p>
                            <p className="mt-1 text-[11px] font-semibold text-slate-400">กิจกรรมสำคัญของโครงการจะแสดงที่นี่</p>
                          </div>
                        ) : projectLatestActivities.map((activity: any, index: number) => {
                          const view = timelineActivityView(activity);
                          const auditIcon = activityAuditIcon(activity);
                          const contextLine = activityContextLine(activity);
                          const statusBadge = activityStatusBadge(activity);
                          return (
                            <div key={`${activity.id}-${index}`} className="grid grid-cols-[34px_minmax(0,1fr)_96px] gap-3 rounded-lg border border-slate-100 bg-white/75 px-2.5 py-2.5">
                              <div className="relative flex justify-center">
                                {index < projectLatestActivities.length - 1 && <span className="absolute top-8 h-[calc(100%+8px)] w-px bg-slate-200"></span>}
                                <span className={`relative z-10 grid h-7 w-7 place-items-center rounded-full border ${auditIcon.className}`}>
                                  <StageIcon name={auditIcon.icon} className="h-4 w-4" />
                                </span>
                              </div>
                              <div className="min-w-0 pb-1">
                                <div className="flex min-w-0 items-center gap-2">
                                  <p className="truncate text-[12px] font-bold text-slate-900">{view.title}</p>
                                  {statusBadge && (
                                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold ${statusBadge.className}`}>
                                      {statusBadge.label}
                                    </span>
                                  )}
                                </div>
                                {contextLine && <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">{contextLine}</p>}
                                <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-400">{activityActorLine(activity)}</p>
                              </div>
                              <div className="text-right text-[10px] font-semibold text-slate-400">
                                <p>{timelineDateLabel(activity.created_at)}</p>
                                <p>{timelineTimeLabel(activity.created_at)}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className={`relative overflow-hidden rounded-xl border px-4 py-4 shadow-[0_8px_22px_rgba(15,23,42,0.045)] ${summaryCardClass("slate")}`}>
                      <span className={`pointer-events-none absolute -right-5 -top-4 opacity-[0.07] [&_svg]:h-28 [&_svg]:w-28 ${summaryWatermarkClass("slate")}`}><StageIcon name="info" /></span>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="flex items-center gap-2 text-[13px] font-black text-slate-950"><span className={`grid h-7 w-7 place-items-center rounded-md border [&_svg]:h-3.5 [&_svg]:w-3.5 ${summaryIconClass("slate")}`}><StageIcon name="info" /></span>รายละเอียดโครงการ</p>
                          <p className="text-[11px] font-semibold text-slate-500">ข้อมูลหลักและสถานะเอกสาร</p>
                        </div>
                        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md border [&_svg]:h-4 [&_svg]:w-4 ${summaryIconClass("slate")}`}><StageIcon name="file" /></span>
                      </div>

                      <dl className="mt-4 grid gap-3 text-[12px]">
                        {[
                          ['รหัสโครงการ', selectedProject.customer_code],
                          ['ลูกค้า', selectedProject.customer_name || '-'],
                          ['ประเภทลูกค้า', selectedProject.project_type || 'RES-S'],
                          ['กำลังติดตั้ง', `${selectedProjectSystemSize}${String(selectedProjectSystemSize).includes('kW') || selectedProjectSystemSize === '-' ? '' : ' kWp'}`],
                          ['ประเภทการชำระเงิน', selectedProject.payment_type || 'CASH'],
                          ['พื้นที่ติดตั้ง', selectedProjectArea],
                        ].map(([label, value]) => (
                          <div key={label} className="grid grid-cols-[112px_minmax(0,1fr)] gap-3">
                            <dt className="font-semibold text-slate-500">{label}</dt>
                            <dd className="truncate font-bold text-slate-900">{value}</dd>
                          </div>
                        ))}
                      </dl>

                      <div className="mt-5 rounded-lg border border-slate-200/90 bg-slate-50/70 px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex items-center gap-2.5 text-[13px] font-black text-slate-950">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                                <svg className="h-8 w-8 drop-shadow-[0_1px_1px_rgba(15,23,42,0.12)]" viewBox="0 0 87.3 78" aria-hidden="true">
                                  <path fill="#1A73E8" d="M6.6 66.9 43.7 2.6l12.8 22.1-24.3 42.2z" />
                                  <path fill="#34A853" d="M32.2 66.9h48.5L68 44.8H19.4z" />
                                  <path fill="#188038" d="M19.4 44.8 6.6 66.9h25.6z" />
                                  <path fill="#4285F4" d="M43.7 2.6h25.6l18 31.1H61.7z" />
                                  <path fill="#FBBC04" d="M61.7 33.7 80.7 66.9 87.3 33.7z" />
                                  <path fill="#EA4335" d="M43.7 2.6 56.5 24.7h25.6L69.3 2.6z" />
                                </svg>
                              </span>
                              <span>โฟลเดอร์ Google Drive</span>
                            </p>
                            <p className={`mt-2 text-[12px] font-bold ${selectedProject.google_drive_folder_id ? 'text-emerald-700' : 'text-amber-700'}`}>
                              {selectedProject.google_drive_folder_id ? 'เชื่อมต่อแล้ว' : 'ยังไม่สร้าง'}
                            </p>
                            {selectedProject.google_drive_folder_id && <p className="mt-1 font-mono text-[10px] font-semibold text-slate-400">ID: {String(selectedProject.google_drive_folder_id).slice(0, 18)}...</p>}
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              const folderId = selectedProject.google_drive_folder_id || await handleSetupDriveFolder();
                              if (folderId) window.open(`https://drive.google.com/drive/folders/${folderId}`, '_blank');
                            }}
                            disabled={creatingDriveFolder}
                            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                          >
                            {creatingDriveFolder ? 'Creating...' : selectedProject.google_drive_folder_id ? 'Open Drive' : 'Create Drive'}
                          </button>
                        </div>
                      </div>

                      <div className={`mt-4 rounded-lg border px-4 py-4 ${currentStageDocumentRiskCount || projectOpenExceptions.length ? 'border-rose-100 bg-rose-50/80' : 'border-slate-200/90 bg-slate-50/70'}`}>
                        <p className="text-[13px] font-black text-slate-950">Risk ที่พบ</p>
                        <div className="mt-3 space-y-2 text-[12px] font-bold">
                          {currentStageDocumentRiskCount > 0 && <p className="text-rose-700">เอกสารในขั้นตอนนี้เป็น blocker {currentStageDocumentRiskCount} รายการ</p>}
                          {currentStageDocumentRiskCount === 0 && projectDocumentRiskCount > 0 && <p className="text-amber-700">มีเอกสารของขั้นตอนถัดไปที่ยังไม่ครบ {projectDocumentRiskCount} รายการ</p>}
                          {projectOpenExceptions.length > 0 && <p className="text-rose-700">Exception เปิดอยู่ {projectOpenExceptions.length} รายการ</p>}
                          {projectDocumentRiskCount === 0 && projectOpenExceptions.length === 0 && <p className="text-slate-500">ยังไม่พบ risk สำคัญ</p>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <div className="space-y-4">
                  <div className="hidden flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-[17px] font-bold text-slate-950">แผนดำเนินงาน</h3>
                      <p className="text-[12px] text-slate-500">ติดตามขั้นตอน หลักฐาน และเวลา SLA</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {totalMilestones > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowProjectDocumentControl((current) => !current)}
                          className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                        >
                          {showProjectDocumentControl ? 'ซ่อนการควบคุมเอกสาร' : 'แสดงการควบคุมเอกสาร'}
                        </button>
                      )}
                      {canDeleteProjects && (
                        <button
                          type="button"
                          onClick={() => handleDeleteProject(selectedProject)}
                          disabled={deletingProjectId === selectedProject.id}
                          className="inline-flex items-center justify-center rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-bold text-rose-700 shadow-sm transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          {deletingProjectId === selectedProject.id ? "Deleting..." : "Delete Project"}
                        </button>
                      )}
                      <button 
                      onClick={async () => {
                        const folderId = selectedProject.google_drive_folder_id || await handleSetupDriveFolder();
                        if (folderId) window.open(`https://drive.google.com/drive/folders/${folderId}`, '_blank');
                      }}
                      disabled={creatingDriveFolder}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                    >
                      <svg className="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>
                      {creatingDriveFolder ? 'กำลังสร้าง...' : selectedProject.google_drive_folder_id ? 'Drive Folder' : 'สร้าง Drive Folder'}
                      </button>
                      </div>
                    </div>

                  {nextActionAssistant && (
                    <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                      <div className="px-5 py-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-[15px] font-black text-slate-950">สิ่งที่ต้องทำต่อ</h3>
                            <span className={`rounded border px-2 py-1 text-[10px] font-bold ${nextActionToneClass(nextActionAssistant.tone)}`}>
                              {nextActionAssistant.status}
                            </span>
                          </div>
                          <p className="mt-1 text-[12px] font-medium text-slate-500">ระบบสรุปจาก stage, gate, SLA, Drive และเอกสาร</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {nextActionAssistant.chips.map((chip: any) => (
                              <span key={`${chip.label}-${chip.value}`} className="inline-flex max-w-full items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                                <span className="text-slate-400">{chip.label}:</span>
                                <span className="truncate text-slate-900">{chip.value}</span>
                              </span>
                            ))}
                          </div>
                          <div className="mt-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-3">
                            <p className="text-[13px] font-black text-slate-950">{nextActionAssistant.title}</p>
                            <p className="mt-1 text-[13px] font-semibold text-slate-700">{nextActionAssistant.suggestion}</p>
                          </div>
                          {currentMilestone && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {canCompleteCurrentStage ? (
                                <button
                                  type="button"
                                  onClick={() => currentStageReady ? handleCompleteMilestone(currentMilestone.id) : setSelectedStageId(currentMilestone.id)}
                                  disabled={completingStageId === currentMilestone.id}
                                  className={`min-h-10 rounded-md px-4 py-2 text-[12px] font-bold shadow-sm transition-colors disabled:cursor-not-allowed disabled:bg-slate-300 ${
                                    currentStageReady
                                      ? 'bg-slate-950 text-white hover:bg-slate-800'
                                      : 'border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                                  }`}
                                >
                                  {completingStageId === currentMilestone.id ? 'กำลังบันทึก...' : currentStageReady ? completionButtonLabel(currentMilestone) : 'ดูรายการที่ติดอยู่'}
                                </button>
                              ) : (
                                <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-bold text-slate-600">
                                  รอ {stageOwner(currentMilestone)}
                                </span>
                              )}
                            </div>
                          )}
                          {nextActionAssistant.blockers.length > 0 && (
                            <div className="mt-3">
                              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">ติดอยู่</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {nextActionAssistant.blockers.slice(0, 3).map((blocker: string, index: number) => (
                                  <span key={`${blocker}-${index}`} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700">
                                    {blocker}
                                  </span>
                                ))}
                                {nextActionAssistant.blockers.length > 3 && (
                                  <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-500">
                                    +{nextActionAssistant.blockers.length - 3} รายการ
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        {(nextActionAssistant.counts.approvals > 0 || nextActionAssistant.counts.exceptions > 0 || nextActionAssistant.counts.reviewDocuments > 0) && (
                          <div className="mt-3 rounded-md border border-sky-100 bg-sky-50 px-3 py-2">
                            <p className="text-[12px] font-bold text-sky-900">
                              อนุมัติ {nextActionAssistant.counts.approvals} / Exception {nextActionAssistant.counts.exceptions} / เอกสารรอตรวจ {nextActionAssistant.counts.reviewDocuments}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {false && currentMilestone && (
                    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
                        <div className="px-5 py-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Next Action</p>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <h3 className="text-[17px] font-black text-slate-950">{stageDisplay(currentMilestone).title}</h3>
                                <span className={`rounded border px-2 py-1 text-[10px] font-bold ${currentStageReady ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                                  {currentStageReady ? 'READY' : `${currentStageBlockers.length} BLOCKER${currentStageBlockers.length > 1 ? 'S' : ''}`}
                                </span>
                              </div>
                              <p className="mt-1 text-[12px] font-semibold text-slate-500">
                                Owner: {stageOwner(currentMilestone)}{nextMilestone ? ` / Next: ${stageDisplay(nextMilestone).title}` : ' / Final stage'}
                              </p>
                            </div>
                            {canCompleteCurrentStage ? (
                              <button
                                type="button"
                                onClick={() => currentStageReady ? handleCompleteMilestone(currentMilestone.id) : setSelectedStageId(currentMilestone.id)}
                                disabled={completingStageId === currentMilestone.id}
                                className={`min-h-11 rounded-md px-4 py-2 text-[13px] font-bold shadow-sm transition-colors disabled:cursor-not-allowed disabled:bg-slate-300 ${
                                  currentStageReady
                                    ? 'bg-slate-950 text-white hover:bg-slate-800'
                                    : 'border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                                }`}
                              >
                                {completingStageId === currentMilestone.id ? 'Completing...' : currentStageReady ? completionButtonLabel(currentMilestone) : 'Review Blockers'}
                              </button>
                            ) : (
                              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-right">
                                <p className="text-[11px] font-bold text-slate-500">Waiting for</p>
                                <p className="mt-0.5 text-[13px] font-black text-slate-900">{stageOwner(currentMilestone)}</p>
                              </div>
                            )}
                          </div>
                          {!currentStageReady && (
                            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              {currentStageBlockers.slice(0, 6).map((item: any) => (
                                <button
                                  key={`${item.code}-${item.id}`}
                                  type="button"
                                  onClick={() => setSelectedStageId(currentMilestone.id)}
                                  className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left transition-colors hover:bg-white"
                                >
                                  <p className="truncate text-[12px] font-bold text-slate-800">{item.label || item.name || item.code}</p>
                                  <p className="mt-1 font-mono text-[10px] font-bold uppercase text-amber-700">{item.code} / {statusLabel(item.status)}</p>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="border-t border-slate-100 bg-slate-50 px-5 py-4 lg:border-l lg:border-t-0">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Department</p>
                          <p className="mt-1 text-[15px] font-black text-slate-950">{stageOwner(currentMilestone)}</p>
                          <p className="mt-2 text-[12px] font-semibold text-slate-500">
                            {currentUserRole ? `Signed in as ${roleLabelWithCode(currentUserRole)}` : 'Signed in role not available'}
                          </p>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className={`h-full rounded-full ${currentStageReady ? 'bg-emerald-500' : 'bg-amber-500'}`}
                              style={{ width: `${currentMilestone ? Math.round(((currentMilestone.checklists || []).concat(sortProjectDocuments(currentMilestone.documents || []).filter(isActiveDocumentVersion)).filter(gateItemPassed).length / Math.max(1, ((currentMilestone.checklists || []).length + sortProjectDocuments(currentMilestone.documents || []).filter(isActiveDocumentVersion).length))) * 100) : 0}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {totalMilestones > 0 && showProjectDocumentControl && (
                    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
                        <div className="px-5 py-4">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-[13px] font-bold text-slate-950">การควบคุมเอกสาร</p>
                              <p className="text-[11px] text-slate-500">เอกสารบังคับ การเชื่อม Drive การตรวจเอกสาร และ gate blocker</p>
                            </div>
                            <span className={`rounded border px-2 py-1 text-[10px] font-bold ${projectMissingHardDocuments.length || projectRejectedDocuments.length ? 'border-rose-200 bg-rose-50 text-rose-700' : projectReviewDocuments.length ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                              {projectMissingHardDocuments.length || projectRejectedDocuments.length ? 'ต้องดำเนินการ' : projectReviewDocuments.length ? 'รอตรวจ' : 'ปกติ'}
                            </span>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-4">
                            {[
                              ['บังคับ', projectRequiredDocuments.length, 'text-slate-950'],
                              ['ผ่านแล้ว', projectVerifiedDocuments.length, 'text-emerald-600'],
                              ['รอตรวจ', projectReviewDocuments.length, 'text-sky-600'],
                              ['ติดขัด', projectMissingHardDocuments.length + projectRejectedDocuments.length, projectMissingHardDocuments.length + projectRejectedDocuments.length ? 'text-rose-600' : 'text-slate-950'],
                            ].map(([label, value, className]) => (
                              <div key={label as string} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                                <p className={`mt-1 text-lg font-black ${className}`}>{value}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="border-t border-slate-100 bg-slate-50 px-5 py-4 lg:border-l lg:border-t-0">
                          <div className="flex items-center justify-between text-[12px]">
                            <span className="font-semibold text-slate-500">Drive folder</span>
                            <span className={`font-bold ${selectedProject.google_drive_folder_id ? 'text-emerald-700' : 'text-amber-700'}`}>{selectedProject.google_drive_folder_id ? 'เชื่อมแล้ว' : 'ยังไม่สร้าง'}</span>
                          </div>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${projectActiveDocuments.length ? Math.round((projectDriveLinkedDocuments.length / projectActiveDocuments.length) * 100) : 0}%` }}
                            ></div>
                          </div>
                          <p className="mt-2 text-[11px] font-semibold text-slate-500">{projectDriveLinkedDocuments.length}/{projectActiveDocuments.length} เอกสาร active เชื่อมกับ Drive</p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {loadingMilestones ? (
                    <div className="p-12 text-center bg-white rounded-xl border border-slate-200">กำลังโหลด...</div>
                  ) : totalMilestones === 0 ? (
                    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                      <div className="flex min-h-[150px] flex-col items-center justify-center gap-3 px-5 py-8 text-center">
                        <p className="text-[13px] font-bold text-slate-900">ยังไม่ได้สร้าง Runtime workflow</p>
                        <p className="max-w-md text-[12px] text-slate-500">โปรเจกต์นี้อาจถูกสร้างก่อนเปิด runtime workflow engine</p>
                        <button
                          onClick={handleGenerateRuntime}
                          disabled={generatingRuntime}
                          className="rounded-md bg-slate-950 px-3 py-2 text-[12px] font-bold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {generatingRuntime ? 'กำลังสร้าง...' : 'สร้าง Runtime Workflow'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                        <div>
                          <p className="text-[13px] font-bold text-slate-900">ลำดับขั้นตอน</p>
                          <p className="text-[11px] text-slate-500">{totalMilestones} ขั้นตอนใน workflow นี้</p>
                        </div>
                        <div className="hidden items-center gap-4 text-[11px] text-slate-500 sm:flex">
                          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500"></span>เสร็จแล้ว</span>
                          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border-2 border-emerald-500 bg-white"></span>กำลังทำ</span>
                          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-200"></span>รอ</span>
                        </div>
                      </div>
                      <div className="overflow-x-auto px-5 py-5">
                        <div
                          className="relative grid w-max min-w-full gap-3 pb-3 pt-4"
                          style={{ gridTemplateColumns: `repeat(${Math.max(milestones.length, 1)}, minmax(184px, 184px))` }}
                        >
                        {milestones.map((m: any, index: number) => {
                          const isCompleted = m.dynamicStatus === 'Completed';
	                          const isCurrent = m.dynamicStatus === 'In Progress' || m.dynamicStatus === 'Near SLA' || m.dynamicStatus === 'Overdue' || m.dynamicStatus === 'Blocked';
	                          const isOverdue = m.dynamicStatus === 'Overdue';
	                          const isNearSla = m.dynamicStatus === 'Near SLA';
	                          const isBlocked = m.dynamicStatus === 'Blocked';
	                          const activeTone = isOverdue || isBlocked ? 'rose' : isNearSla ? 'amber' : 'emerald';
	                          const activeLineClass = activeTone === 'rose' ? 'bg-rose-400' : activeTone === 'amber' ? 'bg-amber-400' : 'bg-emerald-400';
	                          const activeMarkerClass = activeTone === 'rose'
	                            ? 'active-stage-marker is-overdue border-rose-500 text-rose-600 shadow-rose-100 ring-rose-50'
	                            : activeTone === 'amber'
	                              ? 'active-stage-marker is-near-sla border-amber-500 text-amber-600 shadow-amber-100 ring-amber-50'
	                            : 'active-stage-marker is-on-track border-emerald-500 text-emerald-600 shadow-emerald-100 ring-emerald-50';
	                          const activeCardClass = activeTone === 'rose'
	                            ? 'border-rose-200 bg-rose-50/40 shadow-md shadow-rose-100/70'
	                            : activeTone === 'amber'
	                              ? 'border-amber-200 bg-amber-50/40 shadow-md shadow-amber-100/70'
	                            : 'border-emerald-200 bg-emerald-50/40 shadow-md shadow-emerald-100/70';
                          const activeDocuments = sortProjectDocuments(m.documents || []).filter(isActiveDocumentVersion);
                          const gateItems = [...(m.checklists || []), ...activeDocuments];
                          const passedGates = gateItems.filter(gateItemPassed).length;
                          const pendingVerifyCount = activeDocuments.filter((document: any) => document.status === 'PENDING_VERIFY' || document.status === 'UPLOADED').length;
                          const rejectedDocumentCount = activeDocuments.filter((document: any) => document.status === 'REJECTED').length;
                          const overrideableBlockers = stageOverrideableBlockers(m);
                          const approvedOverride = stageApprovedOverride(m);
                          const pendingOverride = stagePendingOverride(m);
                          const display = stageDisplay(m);
                          const visual = stageVisual(m);
                          const completedGap = stageCompletionGap(m, milestones[index - 1]);
                          const transitionClass = transitionTimeClass(m, milestones[index - 1]);
                          const deadlineTextClass = isOverdue || isBlocked
                            ? 'font-semibold text-rose-600'
                            : isNearSla
                              ? 'font-semibold text-amber-600'
                              : 'font-semibold text-slate-800';
                          const showTransitionTime = index > 0 && completedGap !== '' && completedGap !== 'N/A';
                          const showRunningTime = isCurrent && !m.actual_completed_at && runningStageHours(m);
                          const isRunningOverSla = showRunningTime && runningStageTone(m) === 'over';
                          return (
                            <div key={m.id} className="relative flex min-w-0 flex-col items-center group">
                              <div className="mb-2 h-7 w-full px-1 text-center">
                                <p className="truncate text-[10px] font-bold leading-7 text-slate-500">{stageDisplay(m).title}</p>
                              </div>
                              <div className={`absolute left-0 top-[49px] h-[3px] w-1/2 ${index === 0 ? 'bg-transparent' : isCompleted ? 'bg-emerald-400' : isCurrent ? activeLineClass : 'bg-slate-200'}`}></div>
                              <div className={`absolute right-0 top-[49px] h-[3px] w-1/2 ${isCompleted ? 'bg-emerald-400' : 'bg-slate-200'}`}></div>
                              {showTransitionTime && (
                                <div className={`absolute left-0 top-[37px] z-20 -translate-x-1/2 rounded-full border px-2 py-0.5 text-[9px] font-bold shadow-sm ${transitionClass}`}>
                                  {completedGap}
                                </div>
                              )}
                              {showRunningTime && (
                                <div className={`absolute left-0 top-[38px] z-30 flex -translate-x-1/2 items-center justify-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold ${runningStageBadgeClass(m)}`}>
                                  <span className="shrink-0 text-amber-600"><StageIcon name="wait" /></span>
                                  <span>{runningStageLabel(m)}</span>
                                </div>
                              )}
                              {isRunningOverSla && (
                                <div className="absolute left-0 top-[27px] z-40 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 shadow-sm shadow-rose-100">
                                  <StageIcon name="alert" />
                                </div>
                              )}
                              <div className="relative z-10 flex h-8 w-full justify-center shrink-0">
                                <div className={`relative w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold transition-all
                                  ${isCompleted ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200' : 
                                    isCurrent ? `bg-white border-2 shadow-lg ring-4 ${activeMarkerClass}` : 
                                    'bg-slate-50 border border-slate-200 text-slate-400'}
                                `}>
                                  <span className="relative z-10">
                                    {isCompleted ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg> : index + 1}
                                  </span>
                                </div>
                              </div>
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={() => setSelectedStageId(m.id)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    setSelectedStageId(m.id);
                                  }
                                }}
                                className={`relative mt-4 flex min-h-[190px] w-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-lg border p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-slate-100
                                ${isCurrent ? activeCardClass : isCompleted ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-white shadow-sm shadow-emerald-100/70 hover:border-emerald-300' : 'border-slate-200 bg-slate-50/50 opacity-75 hover:border-slate-300 hover:bg-white'}
                              `}
                              >
                                <div className="relative flex flex-1 flex-col gap-3">
                                  <div>
                                    <div className="flex min-h-11 flex-col items-start gap-1.5">
                                      <div className="flex w-full items-start gap-2">
                                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${isCompleted ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : visual.iconClass}`}>
                                          <StageIcon name={visual.icon} />
                                        </span>
                                        <div className="min-w-0">
                                          <h4 className="line-clamp-2 text-[12px] font-bold leading-4 text-slate-950">{display.title}</h4>
                                        </div>
                                      </div>
	                                      {isBlocked && <span className="rounded border border-rose-100 bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-600">BLOCKED</span>}
	                                      {isOverdue && <span className="rounded border border-rose-100 bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-600">OVERDUE</span>}
	                                      {isNearSla && <span className="rounded border border-amber-100 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">NEAR SLA</span>}
	                                      {isCurrent && !isOverdue && !isNearSla && !isBlocked && <span className="rounded border border-emerald-200 bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">ACTIVE</span>}
                                      {isCompleted && <span className="rounded border border-emerald-200 bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">DONE</span>}
                                      {pendingVerifyCount > 0 && <span className="rounded border border-sky-100 bg-sky-50 px-1.5 py-0.5 text-[9px] font-bold text-sky-700"> {pendingVerifyCount}</span>}
                                      {rejectedDocumentCount > 0 && <span className="rounded border border-rose-100 bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-600">DOC REJECT</span>}
                                      {pendingOverride && <span className="rounded border border-amber-100 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">OVERRIDE PENDING</span>}
                                      {approvedOverride && <span className="rounded border border-emerald-100 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">OVERRIDE OK</span>}
	                                    </div>
                                      <div className="mt-3 grid gap-1.5 text-[11px] text-slate-500">
                                        <div className="flex items-center justify-between gap-2"><span className="shrink-0">SLA</span><b className="whitespace-nowrap font-semibold text-slate-800">{formatSlaDuration(m.workflow_definitions?.sla_hours)}</b></div>
                                        <div className="flex items-center justify-between gap-2"><span className="shrink-0">เริ่มเมื่อ</span><b className="whitespace-nowrap text-[10px] font-semibold text-slate-800">{formatDateTime(m.started_at)}</b></div>
                                        <div className="flex items-center justify-between gap-2"><span>{isCompleted ? 'เสร็จเมื่อ' : 'Deadline'}</span><b className={`truncate ${deadlineTextClass}`}>{m.actual_completed_at ? formatDateTime(m.actual_completed_at) : m.deadline ? formatDateTime(m.deadline) : 'N/A'}</b></div>
                                        <div className="flex items-center justify-between gap-2"><span>ผู้รับผิดชอบ</span><b className="truncate font-semibold text-slate-800">{stageOwner(m)}</b></div>
                                        <div className="flex items-center justify-between gap-2"><span>Gates</span><b className={`truncate font-semibold ${gateItems.length && passedGates < gateItems.length ? 'text-amber-700' : 'text-slate-800'}`}>{gateItems.length ? `${passedGates}/${gateItems.length}` : 'ไม่มี'}</b></div>
                                      </div>
	                                    <div className="hidden">
	                                      <div className="flex items-center justify-between gap-2"><span className="shrink-0">SLA</span><b className="whitespace-nowrap font-semibold text-slate-800">{formatSlaDuration(m.workflow_definitions?.sla_hours)}</b></div>
                                      <div className="flex items-center justify-between gap-2"><span className="shrink-0"></span><b className="whitespace-nowrap text-[10px] font-semibold text-slate-800">{formatDateTime(m.started_at)}</b></div>
                                      <div className="flex items-center justify-between gap-2"><span>{isCompleted ? '' : 'Deadline'}</span><b className={`truncate ${deadlineTextClass}`}>
                                        {m.actual_completed_at ? formatDateTime(m.actual_completed_at) : m.deadline ? formatDateTime(m.deadline) : 'N/A'}
                                      </b></div>
                                      <div className="flex items-center justify-between gap-2"><span></span><b className="truncate font-semibold text-slate-800">{stageOwner(m)}</b></div>
                                      <div className="flex items-center justify-between gap-2"><span>Gates</span><b className={`truncate font-semibold ${gateItems.length && passedGates < gateItems.length ? 'text-amber-700' : 'text-slate-800'}`}>{gateItems.length ? `${passedGates}/${gateItems.length}` : 'None'}</b></div>
                                      {overrideableBlockers.length > 0 && (
                                        <div className="flex items-center justify-between gap-2"><span>Override</span><b className="truncate font-semibold text-amber-700">{overrideableBlockers.length} item{overrideableBlockers.length > 1 ? 's' : ''}</b></div>
                                      )}
                                    </div>
                                  </div>
                                  {m.evidence_files?.length > 0 && (
                                    <div className="mt-auto flex -space-x-2 self-start">
                                      {m.evidence_files.map((file: any, idx: number) => (
                                        <DriveImageThumb key={idx} fileId={file.fileId} onOpen={handleOpenDriveImage} />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
          )}
        </div>
      </div>

      {selectedStage && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[2px]" onClick={() => setSelectedStageId(null)}>
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="stage-detail-title"
            className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-950/20"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex min-h-0 w-full flex-col">
            <div className="shrink-0 border-b border-slate-100 px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                    Stage {selectedStage.order_index} / {selectedStage.code || selectedStage.workflow_definitions?.step_name || selectedStage.name}
                  </p>
                  <h2 id="stage-detail-title" className="truncate text-[20px] font-bold text-slate-950">{stageDisplay(selectedStage).title}</h2>
                  <p className="mt-1 line-clamp-2 text-[12px] font-semibold text-slate-500">{stageDisplay(selectedStage).description}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
	                    <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-bold text-slate-600">{selectedStage.status}</span>
	                    <span className="rounded border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-500">SLA {formatSlaDuration(selectedStage.workflow_definitions?.sla_hours)}</span>
	                    <span className={`rounded border px-2 py-1 font-semibold ${selectedStage.sla_status === 'OVER_SLA' ? 'border-rose-200 bg-rose-50 text-rose-700' : selectedStage.sla_status === 'NEAR_SLA' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{selectedStage.sla_status}</span>
	                    <span className={`rounded border px-2 py-1 font-semibold ${selectedStageGateItems.length && selectedStagePassedGates < selectedStageGateItems.length ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                      {selectedStageGateItems.length ? `${selectedStagePassedGates}/${selectedStageGateItems.length} gates` : 'ไม่มี gate'}
                    </span>
                  </div>
                </div>
                <button onClick={() => setSelectedStageId(null)} className="rounded-md p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <section className="mb-5 overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
                  <div>
                    <p className="text-[12px] font-bold text-slate-950">สถานะขั้นตอน</p>
                    <p className="text-[11px] font-medium text-slate-500">SLA, ผู้รับผิดชอบ, deadline และความพร้อมของ gate</p>
                  </div>
                  <span className={`rounded border px-2 py-1 text-[10px] font-bold ${selectedStageGateItems.length && selectedStagePassedGates < selectedStageGateItems.length ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                    {selectedStageGateItems.length ? `${selectedStagePassedGates}/${selectedStageGateItems.length}` : 'ไม่มี gate'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-0 text-[12px]">
                  <div className="border-r border-b border-slate-100 px-3 py-2">
                    <p className="font-semibold text-slate-500">SLA</p>
                    <p className="mt-1 font-bold text-slate-950">{formatSlaDuration(selectedStage.workflow_definitions?.sla_hours)}</p>
                  </div>
                  <div className="border-b border-slate-100 px-3 py-2">
                    <p className="font-semibold text-slate-500">ผู้รับผิดชอบ</p>
                    <p className="mt-1 font-bold text-slate-950">{stageOwner(selectedStage)}</p>
                    {selectedStage.code === 'INSTALLATION' && (
                      <p className="mt-1 text-[11px] font-bold text-emerald-700">
                        ทีม: {selectedStageScheduleMetadata.resource_team_name || 'ยังไม่ assign ทีม'}
                      </p>
                    )}
                  </div>
                  <div className="border-r border-slate-100 px-3 py-2">
                    <p className="font-semibold text-slate-500">Deadline</p>
                    <p className={`mt-1 font-bold ${
                      selectedStage.sla_status === 'OVER_SLA' || selectedStage.status === 'BLOCKED'
                        ? 'text-rose-600'
                        : selectedStage.sla_status === 'NEAR_SLA'
                          ? 'text-amber-600'
                          : 'text-slate-950'
                    }`}>{selectedStage.deadline ? formatDateTime(selectedStage.deadline) : 'N/A'}</p>
                  </div>
                  <div className="px-3 py-2">
                    <p className="font-semibold text-slate-500">{selectedStage.actual_completed_at ? 'ใช้เวลา' : 'เวลาที่ใช้'}</p>
                    {!selectedStage.actual_completed_at && runningStageHours(selectedStage) ? (
                      <div className={`mt-1 flex w-fit items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-bold ${runningStageBadgeClass(selectedStage)}`}>
                        <span className="shrink-0 text-amber-600"><StageIcon name="wait" /></span>
                        <span className="leading-none">{runningStageLabel(selectedStage)}</span>
                      </div>
                    ) : (
                      <p className="mt-1 font-bold text-slate-950">{stageCompletionGap(selectedStage, milestones[milestones.findIndex((stage) => stage.id === selectedStage.id) - 1])}</p>
                    )}
                  </div>
                </div>
                {selectedStage.code === 'INSTALLATION' && (
                  <div className="grid grid-cols-1 border-t border-slate-100 text-[12px] sm:grid-cols-3">
                    <div className="border-b border-slate-100 px-3 py-2 sm:border-r sm:border-b-0">
                      <p className="font-semibold text-slate-500">นัดติดตั้ง</p>
                      <p className="mt-1 font-bold text-slate-950">
                        {selectedStageScheduleMetadata.scheduled_at ? formatDateTime(selectedStageScheduleMetadata.scheduled_at) : 'ยังไม่ได้นัด'}
                      </p>
                    </div>
                    <div className="border-b border-slate-100 px-3 py-2 sm:border-r sm:border-b-0">
                      <p className="font-semibold text-slate-500">คาดการณ์แล้วเสร็จ</p>
                      <p className="mt-1 font-bold text-slate-950">
                        {selectedStageScheduleMetadata.scheduled_end ? formatDateTime(selectedStageScheduleMetadata.scheduled_end) : 'ยังไม่ระบุ'}
                      </p>
                    </div>
                    <div className="px-3 py-2">
                      <p className="font-semibold text-slate-500">เลื่อนนัดแล้ว</p>
                      <p className={`mt-1 font-bold ${selectedStageRescheduleCount > 0 ? 'text-amber-600' : 'text-slate-950'}`}>
                        {selectedStageRescheduleCount} ครั้ง
                      </p>
                    </div>
                  </div>
                )}
              </section>

              <section className={`mb-5 rounded-lg border px-3 py-3 ${
                selectedStageHasBlockingGates
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold">
                      {selectedStageHasBlockingGates
                        ? `ตอนนี้ยังผ่านไม่ได้: เหลือ ${selectedStageBlockers.length} gate`
                        : 'พร้อมไปขั้นตอนถัดไป'}
                    </p>
                    <p className={`mt-1 text-[11px] font-semibold ${
                      selectedStageHasBlockingGates ? 'text-amber-700' : 'text-emerald-700'
                    }`}>
                      {selectedStageHasBlockingGates
                        ? gateBlockerSummary(selectedStagePrimaryBlocker)
                        : selectedStageNext
                          ? `ขั้นตอนถัดไป: ${stageDisplay(selectedStageNext).title}`
                          : 'ขั้นตอนนี้เป็นขั้นตอนสุดท้าย'}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded border px-2 py-1 text-[10px] font-bold ${
                    selectedStageHasBlockingGates
                      ? 'border-amber-300 bg-white/70 text-amber-700'
                      : 'border-emerald-300 bg-white/70 text-emerald-700'
                  }`}>
                    {selectedStagePassedGates}/{selectedStageGateItems.length || 0}
                  </span>
                </div>
              </section>

              <div className="mb-5 hidden grid-cols-2 gap-3 text-[12px]">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="font-semibold text-slate-500"></p>
                  <p className="mt-1 font-bold text-slate-950">{selectedStage.deadline ? new Date(selectedStage.deadline).toLocaleDateString() : 'N/A'}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="font-semibold text-slate-500"></p>
                  <p className="mt-1 font-bold text-slate-950">{stageCompletionGap(selectedStage, milestones[milestones.findIndex((stage) => stage.id === selectedStage.id) - 1])}</p>
                </div>
                {!selectedStage.actual_completed_at && runningStageHours(selectedStage) && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="font-semibold text-slate-500"></p>
                    <div className={`mt-1 flex items-center justify-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-bold ${runningStageBadgeClass(selectedStage)}`}>
                      <span className="shrink-0 text-amber-600"><StageIcon name="wait" /></span>
                      <span className="text-center leading-none">{runningStageLabel(selectedStage)}</span>
                    </div>
                  </div>
                )}
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="font-semibold text-slate-500"></p>
                  <p className="mt-1 font-bold text-slate-950">{stageOwner(selectedStage)}</p>
                </div>
              </div>

              {(selectedStageOverrideableBlockers.length > 0 || selectedStagePendingOverride || selectedStageApprovedOverride) && (
                <section className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold text-amber-900">ขออนุมัติข้าม Gate</p>
                      <p className="mt-1 text-[11px] font-semibold text-amber-700">
                        {selectedStageApprovedOverride
                          ? 'อนุมัติ override สำหรับ gate นี้แล้ว'
                          : selectedStagePendingOverride
                            ? 'คำขอ override กำลังรออนุมัติ'
                            : `มี blocker ที่ขอ override ได้ ${selectedStageOverrideableBlockers.length} รายการ`}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded border px-2 py-1 text-[10px] font-bold ${selectedStageApprovedOverride ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : selectedStagePendingOverride ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-amber-300 bg-white text-amber-700'}`}>
                      {selectedStageApprovedOverride ? 'อนุมัติแล้ว' : selectedStagePendingOverride ? 'รออนุมัติ' : 'ต้องขออนุมัติ'}
                    </span>
                  </div>

                  {selectedStageOverrideableBlockers.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {selectedStageOverrideableBlockers.slice(0, 3).map((item: any) => (
                        <div key={`${item.code}-${item.id}`} className="flex items-center justify-between gap-2 text-[11px] font-semibold text-amber-800">
                          <span className="truncate">{item.code || item.label || item.name}</span>
                          <span className="shrink-0 rounded bg-white/70 px-1.5 py-0.5 text-[10px]">{item.status}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setOverrideModal({ stage: selectedStage, reason: '' })}
                      disabled={Boolean(selectedStagePendingOverride || selectedStageApprovedOverride || selectedStageOverrideableBlockers.length === 0 || approvalLoading)}
                      className="rounded-md border border-amber-300 bg-white px-3 py-2 text-[11px] font-bold text-amber-800 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-amber-100 disabled:bg-amber-50 disabled:text-amber-300"
                    >
                      {approvalLoading === `request:${selectedStage.id}` ? 'กำลังส่งคำขอ...' : 'ขออนุมัติ'}
                    </button>
                    {selectedStagePendingOverride ? (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleApprovalDecision(selectedStagePendingOverride.id, 'APPROVED')}
                          disabled={Boolean(approvalLoading)}
                          className="rounded-md border border-emerald-200 bg-white px-2 py-2 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          อนุมัติ
                        </button>
                        <button
                          onClick={() => handleApprovalDecision(selectedStagePendingOverride.id, 'REJECTED')}
                          disabled={Boolean(approvalLoading)}
                          className="rounded-md border border-rose-200 bg-white px-2 py-2 text-[10px] font-bold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          ตีกลับ
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-md border border-amber-100 bg-white/50 px-3 py-2 text-center text-[11px] font-bold text-amber-400">
                        ยังไม่มีคำขอ
                      </div>
                    )}
                  </div>
                </section>
              )}

              {(selectedStage.metadata?.scheduled_at || selectedStage.code === 'SCHEDULING') && (
                <section className="mb-5 rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[12px] font-bold text-slate-950">ข้อมูลตารางติดตั้ง</p>
                      <p className="mt-1 text-[11px] font-semibold text-violet-700">
                        {selectedStage.metadata?.scheduled_at ? 'อ่านจาก Scheduling Engine ชุดเดียวกับหน้า Schedule' : 'ยังไม่ได้เลือกวันติดตั้ง ให้ไปหน้า Schedule เพื่อดูทีมว่างก่อนบันทึก'}
                      </p>
                    </div>
                    <span className="shrink-0 rounded border border-violet-200 bg-white px-2 py-1 text-[10px] font-bold text-violet-700">
                      {selectedStage.metadata.schedule_conflict_status || 'NONE'}
                    </span>
                  </div>
                  {selectedStage.metadata?.scheduled_at ? (
                    <div className="mt-3 grid gap-2 text-[11px] font-semibold text-slate-600 sm:grid-cols-3">
                      <div className="rounded-md border border-white/80 bg-white px-2 py-2">
                        <p className="text-slate-400">วันเริ่ม</p>
                        <p className="mt-1 text-slate-950">{formatDateTime(selectedStage.metadata.scheduled_at)}</p>
                      </div>
                      <div className="rounded-md border border-white/80 bg-white px-2 py-2">
                        <p className="text-slate-400">วันจบ</p>
                        <p className="mt-1 text-slate-950">{formatDateTime(selectedStage.metadata.scheduled_end)}</p>
                      </div>
                      <div className="rounded-md border border-white/80 bg-white px-2 py-2">
                        <p className="text-slate-400">ทีม</p>
                        <p className="mt-1 text-slate-950">{selectedStage.metadata.resource_team_name || 'ยังไม่ระบุทีม'}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-md border border-dashed border-violet-200 bg-white/70 px-3 py-4 text-center text-[12px] font-semibold text-violet-600">ยังไม่ได้ลงตารางติดตั้ง</div>
                  )}
                  {selectedStage.code === 'SCHEDULING' && (
                    <button
                      type="button"
                      onClick={() => openSchedulingForStage(selectedStage)}
                      className="mt-3 h-9 w-full rounded-md border border-violet-200 bg-white px-3 text-[11px] font-bold text-violet-700 shadow-sm transition-colors hover:bg-violet-100"
                    >
                      {selectedStage.metadata?.scheduled_at ? 'Edit schedule' : 'เลือกวันใน Calendar'}
                    </button>
                  )}
                </section>
              )}

              {(selectedStage.exceptions || []).length > 0 && (
                <section className="mb-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[13px] font-bold text-slate-950">ปัญหาของขั้นตอนนี้</h3>
                    <span className="text-[11px] font-semibold text-rose-500">{selectedStage.exceptions.length} รายการ</span>
                  </div>
                  {(selectedStage.exceptions || []).map((exception: any) => (
                    <div key={exception.id} className="rounded-lg border border-rose-100 bg-rose-50/50 px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-bold text-slate-950">{exception.title}</p>
                          {exception.description && <p className="mt-1 line-clamp-2 text-[11px] font-semibold text-rose-700">{exception.description}</p>}
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${exceptionSeverityClass(exception.severity)}`}>{severityLabel(exception.severity)}</span>
                            <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-bold text-slate-600">{statusLabel(exception.status)}</span>
                            {exception.category && <span className="rounded border border-rose-100 bg-white px-1.5 py-0.5 text-[9px] font-bold text-rose-600">{exceptionCategoryLabel(exception.category)}</span>}
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-2">
                            {exception.status === 'OPEN' && (
                              <button onClick={() => handleExceptionAction(exception.id, 'ACKNOWLEDGED')} className="rounded border border-amber-200 bg-white px-2 py-1.5 text-[10px] font-bold text-amber-700 hover:bg-amber-50">
                                รับทราบ
                              </button>
                            )}
                            {(exception.status === 'OPEN' || exception.status === 'ACKNOWLEDGED') && (
                              <button onClick={() => handleExceptionAction(exception.id, 'IN_PROGRESS')} className="rounded border border-sky-200 bg-white px-2 py-1.5 text-[10px] font-bold text-sky-700 hover:bg-sky-50">
                                เริ่มแก้
                              </button>
                            )}
                            <button onClick={() => handleExceptionAction(exception.id, 'RESOLVED')} className="rounded border border-emerald-200 bg-white px-2 py-1.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50">
                              ปิดปัญหา
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </section>
              )}

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-[13px] font-bold text-slate-950">Checklist Gate</h3>
                    <p className="text-[11px] font-semibold text-slate-400">{selectedStagePassedChecklists}/{selectedStage.checklists?.length || 0} รายการผ่านแล้ว</p>
                  </div>
                </div>
                {(selectedStage.checklists || []).length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-[12px] font-medium text-slate-400">ขั้นตอนนี้ไม่มี Checklist Gate</div>
                ) : (
                  selectedStage.checklists.map((item: any) => {
                    const visualState = gateVisualState(item);
                    const itemPassed = gateItemPassed(item);
                    const itemFailed = item.status === "FAILED";
                    const itemLoading = checklistLoadingId === item.id || checklistLoadingId === `checklist:${item.id}`;
                    return (
                    <div key={item.id} className={`relative flex items-center justify-between gap-3 overflow-hidden rounded-lg border px-4 py-3 shadow-sm ${visualState.cardClass}`}>
                      <span className={`pointer-events-none absolute -right-2 -top-7 text-[96px] font-black leading-none ${visualState.iconClass}`}>{visualState.icon}</span>
                      <div className="relative z-10 min-w-0">
                        <p className="truncate text-[13px] font-bold text-slate-800">{item.label}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">{item.code}</span>
                          <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${visualState.badgeClass}`}>{visualState.label}</span>
                          <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${gateSeverityClass(item.gate_severity)}`}>{severityLabel(item.gate_severity || 'INFO')}</span>
                          <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${gateStatusClass(item.status)}`}>{statusLabel(item.status)}</span>
                        </div>
                        {shouldShowChecklistNote(item) ? (
                          <div className="mt-2 space-y-1">
                            <p className={`max-w-md rounded-md px-2 py-1 text-[10px] font-semibold ${checklistNoteClass(item)}`}>{checklistStatusSummary(item)}</p>
                            <p className={`line-clamp-2 max-w-md rounded-md px-2 py-1 text-[10px] font-semibold ${checklistNoteClass(item)}`}>เหตุผล: {item.notes}</p>
                          </div>
                        ) : (
                          <p className={`mt-2 max-w-md rounded-md px-2 py-1 text-[10px] font-semibold ${checklistNoteClass(item)}`}>{checklistStatusSummary(item)}</p>
                        )}
                      </div>
                      <div className="relative z-10 flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleFailChecklist(item.id, item.notes)}
                        disabled={itemFailed || itemLoading}
                        className={`flex h-9 w-9 items-center justify-center rounded-md border text-[17px] font-black shadow-sm transition-colors ${
                          itemFailed
                            ? 'border-rose-500 bg-rose-500 text-white'
                            : 'border-rose-200 bg-white/90 text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60'
                        }`}
                        title={itemFailed ? 'ไม่ผ่านแล้ว' : 'กดเพื่อบันทึกว่าไม่ผ่าน'}
                        aria-label={itemFailed ? 'Checklist failed' : 'Fail checklist'}
                      >
                        ×
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePassChecklist(item.id, false)}
                        disabled={itemPassed || itemLoading}
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-[13px] font-black shadow-sm transition-colors ${
                          itemPassed
                            ? 'border-emerald-500 bg-emerald-500 text-white'
                            : 'border-emerald-200 bg-white/90 text-emerald-600 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60'
                        }`}
                        title={itemPassed ? 'ผ่านแล้ว' : 'กดเพื่อผ่าน checklist นี้'}
                        aria-label={itemPassed ? 'Checklist passed' : 'Pass checklist'}
                      >
                        {itemLoading ? '...' : '✓'}
                        <span className="hidden">
                        ✓
                        </span>
                      </button>
                      </div>
                    </div>
                    );
                  })
                )}
              </section>

              <section className="mt-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-[13px] font-bold text-slate-950">เอกสารบังคับ</h3>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {selectedStageActiveDocuments.length}
                    {selectedStageDocuments.length !== selectedStageActiveDocuments.length ? `/${selectedStageDocuments.length}` : ''} ใช้งาน
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    ['ผ่านแล้ว', selectedStageVerifiedDocuments.length, 'text-emerald-600'],
                    ['รอตรวจ', selectedStageReviewDocuments.length, 'text-sky-600'],
                    ['ตีกลับ', selectedStageRejectedDocuments.length, 'text-rose-600'],
                    ['ขาด Hard Gate', selectedStageMissingHardDocuments.length, selectedStageMissingHardDocuments.length ? 'text-rose-600' : 'text-slate-900'],
                  ].map(([label, value, className]) => (
                    <div key={label as string} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2">
                      <p className="truncate text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                      <p className={`mt-1 text-[15px] font-black ${className}`}>{value}</p>
                    </div>
                  ))}
                </div>
                {selectedStageDocuments.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-[12px] font-medium text-slate-400">ขั้นตอนนี้ไม่มีเอกสารบังคับ</div>
                ) : (
                  selectedStageDocuments.map((item: any) => {
                    const visualState = gateVisualState(item);
                    const documentAwaitingReview = canVerifyDocument(item);
                    const documentCardClass = item.status === 'SUPERSEDED'
                      ? 'border-slate-100 bg-slate-50 opacity-70'
                      : documentAwaitingReview
                        ? 'border-sky-200 bg-gradient-to-r from-sky-50 via-white to-white shadow-sky-100/60 ring-1 ring-sky-100'
                        : visualState.cardClass;
                    const documentMessageClass = item.status === 'REJECTED'
                      ? 'bg-rose-50 text-rose-700'
                      : documentAwaitingReview
                        ? 'bg-sky-50 text-sky-700'
                        : canUploadDocument(item)
                          ? 'bg-amber-50 text-amber-700'
                          : item.status === 'VERIFIED'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-50 text-slate-500';
                    const documentLooksLikeImage = Boolean(item.google_drive_file_id && (!item.mime_type || String(item.mime_type).startsWith('image/')));
                    return (
                    <div key={item.id} className={`relative overflow-hidden rounded-lg border px-4 py-3 shadow-sm ${documentCardClass}`}>
                      {item.status !== 'SUPERSEDED' && (
                        <>
                          <span className={`pointer-events-none absolute -right-2 -top-7 text-[96px] font-black leading-none ${visualState.iconClass}`}>{visualState.icon}</span>
                        </>
                      )}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => item.web_view_link && window.open(item.web_view_link, '_blank')}
                            className={`truncate text-left text-[13px] font-bold ${item.web_view_link ? 'text-slate-900 underline decoration-slate-300 underline-offset-2' : 'text-slate-800'}`}
                          >
                            {item.name}
                          </button>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">{item.code}</span>
                            {item.status !== 'SUPERSEDED' && <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${visualState.badgeClass}`}>{visualState.label}</span>}
                            {item.is_required !== false && <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">บังคับ</span>}
                            <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${gateSeverityClass(item.gate_severity)}`}>{severityLabel(item.gate_severity || 'INFO')}</span>
                            <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${documentStatusClass(item.status)}`}>{statusLabel(item.status)}</span>
                            <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${documentGovernanceClass(item)}`}>{documentGovernanceTone(item) === 'good' ? 'พร้อมใช้' : documentGovernanceTone(item) === 'risk' ? 'ต้องแก้' : documentGovernanceTone(item) === 'review' ? 'รอตรวจ' : 'รออัปโหลด'}</span>
                          </div>
                          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">{item.code}  {item.gate_severity}</p>
                          <div className="mt-2 grid gap-1 text-[11px] font-medium text-slate-500">
                            <div className="flex justify-between gap-2"><span>Drive</span><b className={item.google_drive_file_id || item.web_view_link ? 'text-emerald-700' : 'text-amber-600'}>{item.google_drive_file_id || item.web_view_link ? 'เชื่อมแล้ว' : 'ยังไม่มีไฟล์'}</b></div>
                            <div className="flex justify-between gap-2"><span>อัปโหลดเมื่อ</span><b className="truncate text-slate-800">{formatDateTime(item.uploaded_at)}</b></div>
                            <div className="flex justify-between gap-2"><span>ตรวจผ่านเมื่อ</span><b className="truncate text-slate-800">{formatDateTime(item.verified_at)}</b></div>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-500">V{item.version_number || 1}</span>
                          <button
                            type="button"
                            onClick={() => setSelectedDocument({ ...item, stage: selectedStage, project: selectedProject })}
                            className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
                          >
                            รายละเอียด
                          </button>
                        </div>
                      </div>
                      {item.rejection_reason && (
                        <p className="mt-2 rounded-md bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700">
                          {item.rejection_reason}
                        </p>
                      )}
                      {documentLooksLikeImage && (
                        <div className="relative z-10 mt-3 flex items-center gap-3 rounded-md border border-white/70 bg-white/65 p-2 shadow-sm">
                          <DriveImageThumb
                            fileId={item.google_drive_file_id}
                            onOpen={handleOpenDriveImage}
                            className="h-20 w-28 rounded-md"
                            fallbackLabel="IMG"
                          />
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold text-slate-800">รูปที่แนบไว้</p>
                            <p className="mt-1 text-[10px] font-semibold text-slate-500">กดรูปเพื่อขยายดู แล้วกดกากบาทเพื่อกลับมาหน้านี้</p>
                          </div>
                        </div>
                      )}
                      <p className={`mt-3 rounded-md px-2 py-1.5 text-[11px] font-semibold ${documentMessageClass}`}>
                        {item.status === 'REJECTED'
                          ? 'เอกสารถูกตีกลับ ให้อัปโหลดเวอร์ชันที่แก้ไขแล้ว'
                          : canVerifyDocument(item)
                            ? 'อัปโหลดแล้ว รอผู้รับผิดชอบตรวจเอกสาร'
                            : canUploadDocument(item)
                              ? 'ยังขาดเอกสารที่ใช้ผ่าน Gate นี้'
                              : item.status === 'VERIFIED'
                                ? 'เอกสารผ่านแล้ว ใช้ผ่าน Gate ได้'
                                : 'ยังไม่ต้องดำเนินการ'}
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <label className={`rounded-md border px-3 py-2 text-center text-[11px] font-bold shadow-sm transition-colors ${canUploadDocument(item) ? 'cursor-pointer border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600' : 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'}`}>
                          {uploadingMilestoneId === selectedStage.id ? 'กำลังอัปโหลด...' : 'อัปโหลด'}
                          <input
                            type="file"
                            className="hidden"
                            onChange={(event) => handleFileUpload(selectedStage, event, item.id)}
                            disabled={uploadingMilestoneId === selectedStage.id || !canUploadDocument(item)}
                          />
                        </label>
                        <button
                          onClick={() => handleVerifyDocument(item.id)}
                          disabled={!canVerifyDocument(item)}
                          className={`rounded-md border px-3 py-2 text-[11px] font-bold shadow-sm ${canVerifyDocument(item) ? 'border-sky-500 bg-sky-500 text-white hover:bg-sky-600' : item.status === 'VERIFIED' ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-slate-100 bg-slate-50 text-slate-300'}`}
                        >
                          {item.status === 'VERIFIED' ? 'ตรวจผ่านแล้ว' : 'ตรวจผ่าน'}
                        </button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setRejectModal({ document: item, reason: item.rejection_reason || '' })}
                          disabled={!canRejectDocument(item) || rejectingDocumentId === item.id}
                          className={`rounded-md border px-3 py-2 text-[11px] font-bold ${canRejectDocument(item) ? 'border-rose-200 bg-white text-rose-700 hover:bg-rose-50' : 'border-slate-100 bg-slate-50 text-slate-300'}`}
                        >
                          {rejectingDocumentId === item.id ? 'กำลังตีกลับ...' : 'ตีกลับ'}
                        </button>
                        <button
                          onClick={() => handleCreateDocumentVersion(item.id)}
                          disabled={item.status !== 'REJECTED' || versioningDocumentId === item.id}
                          className={`rounded-md border px-3 py-2 text-[11px] font-bold shadow-sm ${item.status === 'REJECTED' ? 'border-sky-500 bg-sky-500 text-white hover:bg-sky-600' : 'border-slate-100 bg-slate-50 text-slate-300'}`}
                        >
                          {versioningDocumentId === item.id ? 'กำลังสร้าง...' : 'สร้างเวอร์ชันใหม่'}
                        </button>
                      </div>
                    </div>
                    );
                  })
                )}
              </section>

              <section className="mt-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-[13px] font-bold text-slate-950">ประวัติการทำงาน</h3>
                  <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
                      {[
                        ['stage', 'This stage'],
                        ['all', 'All stages'],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            setStageHistoryScope(value as 'stage' | 'all');
                            setExpandedHistoryStages({});
                          }}
                          className={`rounded px-2.5 py-1 text-[10px] font-bold transition-colors ${
                            stageHistoryScope === value
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <span className="text-[11px] font-semibold text-slate-400">{visibleStageActivities.length} เหตุการณ์</span>
                  </div>
                </div>
                {visibleStageActivities.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-[12px] font-medium text-slate-400">
                    ยังไม่มีประวัติในขั้นตอนนี้
                  </div>
                ) : (
                  <div className="space-y-3">
                    {visibleHistoryGroups.map((group: any) => {
                      const isExpanded = Boolean(expandedHistoryStages[group.key]);
                      const collapsedLimit = stageHistoryScope === 'all' ? 1 : 8;
                      const groupActivities = isExpanded ? group.activities : group.activities.slice(0, collapsedLimit);
                      const canToggleGroup = group.activities.length > collapsedLimit;

                      return (
                        <div key={group.key} className="overflow-hidden rounded-lg border border-slate-100 bg-white">
                          <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/40 px-3 py-2">
                            <div className="min-w-0">
                              <p className="truncate text-[10px] font-semibold text-slate-700">{group.title}</p>
                              <p className="mt-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                                STAGE {group.order} / {group.code || 'STAGE'} / {group.activities.length} events
                              </p>
                            </div>
                            {canToggleGroup && (
                              <button
                                type="button"
                                title={isExpanded ? 'Collapse' : 'Expand'}
                                aria-label={isExpanded ? 'Collapse stage history' : 'Expand stage history'}
                                onClick={() => setExpandedHistoryStages((current) => ({
                                  ...current,
                                  [group.key]: !current[group.key],
                                }))}
                                className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-slate-100 bg-white text-[14px] font-semibold leading-none text-slate-400 shadow-sm hover:bg-slate-50 hover:text-slate-600"
                              >
                                {isExpanded ? '-' : '+'}
                              </button>
                            )}
                          </div>
                          <div className="px-3 py-3">
                            {groupActivities.map((activity: any, index: number) => {
                      const scheduleDetail = scheduleActivityDetail(activity);
                      const activityView = timelineActivityView(activity);
                      const isLatest = index === 0;
                      const isLast = index === groupActivities.length - 1;
                      const latestToneClass = activityView.tone === 'risk'
                        ? 'text-rose-700'
                        : activityView.tone === 'success'
                          ? 'text-emerald-700'
                          : 'text-slate-700';
                      const latestDotClass = activityView.tone === 'risk'
                        ? 'border-rose-500 bg-rose-500 shadow-sm shadow-rose-200'
                        : activityView.tone === 'success'
                          ? 'border-emerald-500 bg-emerald-500 shadow-sm shadow-emerald-200'
                          : 'border-slate-500 bg-slate-500 shadow-sm shadow-slate-200';
                      return (
                        <div key={activity.id} className="grid grid-cols-[68px_24px_minmax(0,1fr)] gap-2">
                          <div className={`pt-0.5 text-right ${isLatest ? 'text-slate-500' : 'text-slate-300'}`}>
                            <p className="text-[9px] font-semibold leading-4">{timelineDateLabel(activity.created_at)}</p>
                            <p className="text-[9px] font-medium leading-4">{timelineTimeLabel(activity.created_at)}</p>
                          </div>
                          <div className="relative flex justify-center">
                            {!isLast && <span className={`absolute top-4 h-full w-px ${isLatest && activityView.tone === 'risk' ? 'bg-rose-200' : isLatest ? 'bg-emerald-200' : 'bg-slate-200'}`} />}
                            <span className={`relative z-10 mt-1 h-2.5 w-2.5 rounded-full border-2 ${
                              isLatest
                                ? latestDotClass
                                : 'border-slate-300 bg-slate-300'
                            }`} />
                          </div>
                          <div className={`min-w-0 pb-3 ${isLatest ? 'text-slate-600' : 'text-slate-300'}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className={`text-[11px] font-semibold leading-5 ${isLatest ? latestToneClass : 'text-slate-400'}`}>
                                  {activityView.title}
                                </p>
                                {(activity.metadata?.name || activity.metadata?.file_name || activity.metadata?.title) && (
                                  <p className={`mt-0.5 text-[10px] font-medium ${isLatest ? 'text-blue-500' : 'text-slate-300'}`}>
                                    {activity.metadata?.name || activity.metadata?.file_name || activity.metadata?.title}
                                  </p>
                                )}
                                {activity.reason && (
                                  <p className={`mt-1.5 rounded-md px-2 py-1 text-[9px] font-medium ${isLatest ? activityView.tone === 'risk' ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-500' : 'bg-slate-50 text-slate-300'}`}>
                                    {activity.reason}
                                  </p>
                                )}
                                {scheduleDetail && (
                                  <div className={`mt-2 rounded-md border px-2 py-2 text-[9px] font-medium ${
                                    isLatest ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-100 bg-slate-50 text-slate-400'
                                  }`}>
                                    <p className="font-bold">{scheduleDetail.direction}</p>
                                    <p className="mt-1">จาก: {scheduleDetail.from}</p>
                                    <p className="mt-0.5">ไป: {scheduleDetail.to}</p>
                                    <p className="mt-1">สาเหตุ: {scheduleDetail.notes}</p>
                                  </div>
                                )}
                              </div>
                              <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[7px] font-semibold uppercase ${
                                isLatest ? activityView.badgeClass : 'border-slate-100 bg-slate-50 text-slate-400'
                              }`}>
                                {activity.action}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                            {!isExpanded && group.activities.length > collapsedLimit && (
                              <button
                                type="button"
                                onClick={() => setExpandedHistoryStages((current) => ({ ...current, [group.key]: true }))}
                                className="ml-[92px] mt-1 rounded-md border border-slate-100 bg-slate-50 px-2 py-1 text-[9px] font-semibold text-slate-400 hover:bg-white hover:text-slate-600"
                              >
                                Show {group.activities.length - collapsedLimit} more
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-4">
              {selectedStageIsQuotation && (
                <div className="mb-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold text-slate-950">เลือกเส้นทางชำระเงิน</p>
                      <p className="mt-1 text-[11px] font-semibold text-amber-700">
                        จุดแยก workflow อยู่ที่ใบเสนอราคา เลือกหรือสลับก่อนยืนยันไปขั้นตอนถัดไป
                      </p>
                    </div>
                    <span className="shrink-0 rounded border border-amber-200 bg-white px-2 py-1 text-[10px] font-bold text-amber-700">
                      {selectedProjectPaymentLabel}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setFinancePathModal({
                        stage: selectedStage,
                        action: 'SWITCH_TO_CASH',
                        title: 'เลือกชำระเงินสด',
                        reason: selectedProject?.payment_type === 'CASH' ? 'ยืนยันเส้นทางเงินสดที่ใบเสนอราคา' : '',
                      })}
                      disabled={Boolean(stageActionLoading)}
                      className={`rounded-md border px-3 py-2 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        selectedProject?.payment_type === 'CASH'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      เงินสด
                    </button>
                    <button
                      onClick={() => setFinancePathModal({
                        stage: selectedStage,
                        action: 'SWITCH_TO_LOAN',
                        title: 'เลือกสินเชื่อ/เงินผ่อน',
                        reason: selectedProject?.payment_type === 'LOAN' ? 'ยืนยันเส้นทางสินเชื่อที่ใบเสนอราคา' : '',
                      })}
                      disabled={Boolean(stageActionLoading)}
                      className={`rounded-md border px-3 py-2 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        selectedProject?.payment_type === 'LOAN'
                          ? 'border-sky-200 bg-sky-50 text-sky-700'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      สินเชื่อ/เงินผ่อน
                    </button>
                  </div>
                </div>
              )}

              {selectedStageIsLoanDecision && (
                <div className="mb-3 rounded-lg border border-sky-100 bg-sky-50 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold text-slate-950">เปลี่ยนเส้นทางสินเชื่อ/เงินสด</p>
                      <p className="mt-1 text-[11px] font-semibold text-sky-700">
                        {selectedStageLoanFallbackState === 'CASH_OFFERED'
                          ? 'สินเชื่อไม่ผ่านแล้ว ให้ยืนยันว่าลูกค้ารับข้อเสนอเงินสดหรือไม่'
                          : 'ใช้เมื่อผลสินเชื่อไม่ผ่าน และฝ่ายขายต้องเสนอเงินสดให้ลูกค้า'}
                      </p>
                    </div>
                    <span className="shrink-0 rounded border border-sky-200 bg-white px-2 py-1 text-[10px] font-bold text-sky-700">
                      {selectedStageLoanFallbackState || 'LOAN'}
                    </span>
                  </div>

                  {selectedStageLoanFallbackState === 'CASH_OFFERED' ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setLoanFallbackModal({
                          stage: selectedStage,
                          action: 'ACCEPT_CASH_OFFER',
                          title: 'ลูกค้ารับข้อเสนอเงินสด',
                          reason: '',
                        })}
                        disabled={Boolean(stageActionLoading)}
                        className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-[11px] font-bold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        ลูกค้ารับเงินสด
                      </button>
                      <button
                        onClick={() => setLoanFallbackModal({
                          stage: selectedStage,
                          action: 'DECLINE_CASH_OFFER',
                          title: 'ลูกค้าไม่รับข้อเสนอเงินสด',
                          reason: '',
                        })}
                        disabled={Boolean(stageActionLoading)}
                        className="rounded-md border border-rose-200 bg-white px-3 py-2 text-[11px] font-bold text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        ลูกค้าไม่รับเงินสด
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setLoanFallbackModal({
                        stage: selectedStage,
                        action: 'REJECT_AND_OFFER_CASH',
                        title: 'สินเชื่อไม่ผ่าน เสนอเงินสด',
                        reason: '',
                      })}
                      disabled={Boolean(stageActionLoading)}
                      className="mt-3 w-full rounded-md border border-sky-200 bg-white px-3 py-2 text-[11px] font-bold text-sky-700 transition-colors hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      สินเชื่อไม่ผ่าน เสนอเงินสด
                    </button>
                  )}
                </div>
              )}

              {selectedStage.code === 'QA' && (
                <div className="mb-3 grid grid-cols-3 gap-2">
                  <button
                    onClick={() => submitStageAction('QA', 'PASS')}
                    disabled={Boolean(stageActionLoading)}
                    className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {stageActionLoading === 'QA:PASS' ? 'กำลังบันทึก...' : 'ผ่าน QA'}
                  </button>
                  <button
                    onClick={() => openStageActionModal('QA', 'FAIL', 'QA ไม่ผ่าน')}
                    disabled={Boolean(stageActionLoading)}
                    className="rounded-md border border-rose-200 bg-white px-3 py-2.5 text-[11px] font-bold text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    ไม่ผ่าน QA
                  </button>
                  <button
                    onClick={() => openStageActionModal('QA', 'REWORK', 'ส่งกลับแก้งาน QA')}
                    disabled={Boolean(stageActionLoading)}
                    className="rounded-md border border-amber-200 bg-white px-3 py-2.5 text-[11px] font-bold text-amber-700 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    ส่งกลับแก้งาน
                  </button>
                </div>
              )}

              {selectedStage.code === 'BILLING' && (
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => submitStageAction('BILLING', 'APPROVE')}
                    disabled={Boolean(stageActionLoading)}
                    className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {stageActionLoading === 'BILLING:APPROVE' ? 'กำลังอนุมัติ...' : 'อนุมัติวางบิล'}
                  </button>
                  <button
                    onClick={() => openStageActionModal('BILLING', 'REJECT', 'ตีกลับวางบิล')}
                    disabled={Boolean(stageActionLoading)}
                    className="rounded-md border border-rose-200 bg-white px-3 py-2.5 text-[11px] font-bold text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    ตีกลับวางบิล
                  </button>
                </div>
              )}

              <button
                onClick={() => {
                  if (selectedStageCanTransitionNow) {
                    handleCompleteMilestone(selectedStage.id);
                    return;
                  }
                  setCompleteStageModal(selectedStage);
                }}
                disabled={selectedStage.dynamicStatus !== 'In Progress' && selectedStage.dynamicStatus !== 'Overdue' && selectedStage.dynamicStatus !== 'Blocked' || completingStageId === selectedStage.id || !selectedStageCanTransitionNow}
                className="w-full rounded-md bg-slate-950 px-4 py-3 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {completingStageId === selectedStage.id
                  ? 'Completing...'
                  : !selectedStageCanComplete
                    ? `Waiting for ${stageOwner(selectedStage)}`
                    : selectedStageHasBlockingGates
                      ? `ยังผ่านไม่ได้: เหลือ ${selectedStageBlockers.length} gate`
                      : completionButtonLabel(selectedStage)}
              </button>
              <p className="mt-2 text-center text-[11px] font-semibold text-slate-500">
                {selectedStageNext ? `Next: ${stageDisplay(selectedStageNext).title}` : 'Final stage'}
              </p>
            </div>
            </div>
          </aside>
        </div>
      )}
      {selectedException && (
        <ExceptionDrawer
          exception={selectedException}
          onClose={() => setSelectedException(null)}
          onAction={handleExceptionAction}
          onOpenProject={openExceptionProject}
        />
      )}
      {selectedDocument && (
        <DocumentDrawer
          document={selectedDocument}
          uploadingStageId={uploadingMilestoneId}
          versioningDocumentId={versioningDocumentId}
          rejectingDocumentId={rejectingDocumentId}
          onClose={() => setSelectedDocument(null)}
          onUpload={handleFileUpload}
          onVerify={handleVerifyDocument}
          onReject={(document) => setRejectModal({ document, reason: document.rejection_reason || '' })}
          onCreateVersion={handleCreateDocumentVersion}
          stageTitle={(stage) => stageDisplay(stage).title}
        />
      )}

      {previewImage && <PreviewImageModal src={previewImage} onClose={() => setPreviewImage(null)} />}

      {notice && <NoticeToast notice={notice} onClose={() => setNotice(null)} />}

      <AuthDialog
        isOpen={authDialogOpen}
        loading={authLoading}
        error={authError}
        onClose={() => setAuthDialogOpen(false)}
        onSignIn={handleSignIn}
      />

      {completeStageModal && (
        <CompleteStageModal
          stage={completeStageModal}
          completingStageId={completingStageId}
          onClose={() => setCompleteStageModal(null)}
          onConfirm={handleCompleteMilestone}
          stageTitle={(stage) => stageDisplay(stage).title}
        />
      )}
      {checklistReviewModal && selectedStage && (
        <ChecklistReviewModal
          stage={selectedStage}
          project={selectedProject}
          loadingId={checklistLoadingId}
          onClose={() => setChecklistReviewModal(null)}
          onPass={handlePassChecklist}
          onUpdate={handleUpdateChecklist}
          onUpdateCustomerIntake={handleUpdateCustomerIntake}
          onUploadDocument={handleFileUpload}
          onVerifyDocument={handleVerifyDocument}
          onOpenDocument={(document) => setSelectedDocument({ ...document, stage: selectedStage, project: selectedProject })}
          onOpenSchedule={openSchedulingForStage}
          uploadingStageId={uploadingMilestoneId}
          stageTitle={(stage) => stageDisplay(stage).title}
        />
      )}
      {gateBlockModal && (
        <GateBlockModal
          modal={gateBlockModal}
          onClose={() => setGateBlockModal(null)}
          onOpenStage={(stageId) => {
            setSelectedStageId(stageId);
            setGateBlockModal(null);
          }}
          onRequestOverride={(stageId) => {
            const stage = milestones.find((item) => item.id === stageId);
            if (stage) {
              setSelectedStageId(stage.id);
              setOverrideModal({ stage, reason: "" });
            }
            setGateBlockModal(null);
          }}
        />
      )}

      {rejectModal && (
        <RejectDocumentModal
          modal={rejectModal}
          rejectingDocumentId={rejectingDocumentId}
          onChangeReason={(reason) => setRejectModal({ ...rejectModal, reason })}
          onClose={() => setRejectModal(null)}
          onConfirm={handleRejectDocument}
        />
      )}

      {stageActionModal && (
        <StageActionModal
          modal={stageActionModal}
          stageTitle={selectedStage ? stageDisplay(selectedStage).title : ""}
          stageActionLoading={stageActionLoading}
          onChangeReason={(reason) => setStageActionModal({ ...stageActionModal, reason })}
          onClose={() => setStageActionModal(null)}
          onConfirm={(type, action, reason) => submitStageAction(type, action, reason)}
        />
      )}

      {financePathModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-950/15">
            <div className="border-b border-slate-100 bg-amber-50 px-5 py-4">
              <p className="text-[11px] font-bold uppercase text-amber-600">Finance Path</p>
              <h2 className="mt-1 text-[16px] font-bold text-slate-950">{financePathModal.title}</h2>
              <p className="mt-1 text-[12px] font-semibold text-slate-500">{stageDisplay(financePathModal.stage).title}</p>
            </div>

            <div className="space-y-3 px-5 py-4">
              <label className="block text-[12px] font-semibold text-slate-700">Reason</label>
              <textarea
                value={financePathModal.reason}
                onChange={(event) => setFinancePathModal({ ...financePathModal, reason: event.target.value })}
                className="min-h-28 w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-medium text-slate-950 shadow-sm transition placeholder:text-slate-400 focus:border-amber-300 focus:outline-none focus:ring-4 focus:ring-amber-50"
                placeholder="บันทึกการตัดสินใจของลูกค้าจากใบเสนอราคา"
              />
              <p className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
                ระบบจะเปิด branch ถัดไปตาม path ที่เลือก และยังคงให้ยืนยันไปขั้นตอนถัดไปตาม gate ปกติ
              </p>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setFinancePathModal(null)}
                disabled={Boolean(stageActionLoading)}
                className="rounded-md px-4 py-2.5 text-[13px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitFinancePathAction}
                disabled={!financePathModal.reason.trim() || Boolean(stageActionLoading)}
                className="rounded-md bg-slate-950 px-4 py-2.5 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {stageActionLoading?.startsWith('FINANCE:') ? 'Submitting...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loanFallbackModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-950/15">
            <div className="border-b border-slate-100 bg-sky-50 px-5 py-4">
              <p className="text-[11px] font-bold uppercase text-sky-600">Loan / Cash fallback</p>
              <h2 className="mt-1 text-[16px] font-bold text-slate-950">{loanFallbackModal.title}</h2>
              <p className="mt-1 text-[12px] font-semibold text-slate-500">{stageDisplay(loanFallbackModal.stage).title}</p>
            </div>

            <div className="space-y-3 px-5 py-4">
              <label className="block text-[12px] font-semibold text-slate-700">Reason</label>
              <textarea
                value={loanFallbackModal.reason}
                onChange={(event) => setLoanFallbackModal({ ...loanFallbackModal, reason: event.target.value })}
                className="min-h-28 w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-medium text-slate-950 shadow-sm transition placeholder:text-slate-400 focus:border-sky-300 focus:outline-none focus:ring-4 focus:ring-sky-50"
                placeholder="Record the bank result, customer decision, or supporting detail."
              />
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setLoanFallbackModal(null)}
                disabled={Boolean(stageActionLoading)}
                className="rounded-md px-4 py-2.5 text-[13px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitLoanFallbackAction}
                disabled={!loanFallbackModal.reason.trim() || Boolean(stageActionLoading)}
                className="rounded-md bg-slate-950 px-4 py-2.5 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {stageActionLoading?.startsWith('LOAN:') ? 'Submitting...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {overrideModal && (
        <OverrideModal
          modal={overrideModal}
          approvalLoading={approvalLoading}
          stageTitle={(stage) => stageDisplay(stage).title}
          onChangeReason={(reason) => setOverrideModal({ ...overrideModal, reason })}
          onClose={() => setOverrideModal(null)}
          onConfirm={handleRequestOverride}
        />
      )}

      <CreateProjectModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSuccess={() => fetchProjects()} />
    </div>
  );
}

function DriveImageThumb({
  fileId,
  onOpen,
  className = "h-6 w-6 rounded",
  fallbackLabel = "IMG",
}: {
  fileId: string;
  onOpen: (fileId: string) => void;
  className?: string;
  fallbackLabel?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function loadImage() {
      try {
        const response = await apiFetch(`/api/drive/image?fileId=${encodeURIComponent(fileId)}`);
        if (!response.ok) throw new Error("Image request failed.");

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setSrc(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    loadImage();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId]);

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen(fileId);
      }}
      className={`flex items-center justify-center overflow-hidden border-2 border-white bg-slate-100 text-[9px] font-bold text-slate-400 shadow-sm transition-transform hover:scale-[1.02] ${className}`}
      aria-label="Open evidence image"
    >
      {src && !failed ? <img src={src} alt="" className="h-full w-full object-cover" /> : fallbackLabel}
    </button>
  );
}

function NetworkProgress({ pending, label }: { pending: number; label: string }) {
  if (!pending) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[200]">
      <div className="h-1 w-full overflow-hidden bg-emerald-100">
        <div className="h-full w-2/3 animate-pulse bg-gradient-to-r from-emerald-500 via-teal-400 to-sky-500 shadow-sm shadow-emerald-200"></div>
      </div>
      <div className="absolute right-3 top-3 rounded-md border border-emerald-100 bg-white/95 px-3 py-2 text-[11px] font-bold text-slate-700 shadow-lg shadow-slate-950/10 backdrop-blur">
        <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500"></span>
        {label || "Working with server"}
        {pending > 1 ? ` (${pending})` : ""}
      </div>
    </div>
  );
}
