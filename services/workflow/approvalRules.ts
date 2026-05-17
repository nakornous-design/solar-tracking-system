export type ApprovalDecision = "APPROVED" | "REJECTED" | "CANCELLED";

export function normalizeApprovalReason(reason?: string) {
  return reason?.trim() || "";
}

export function gateOverrideRequestError(reason?: string) {
  return normalizeApprovalReason(reason) ? null : "Approval reason is required.";
}

export function approvalDecisionError(approval: { status?: string } | null | undefined) {
  if (!approval) return "Approval request was not found.";
  if (approval.status !== "PENDING") return "Only pending approval requests can be decided.";
  return null;
}

export function gateOverrideScope(projectStageId: string) {
  return {
    project_stage_id: projectStageId,
    applies_to: "OVERRIDEABLE_GATES",
  };
}

export function approvalDecisionSeverity(decision: ApprovalDecision) {
  return decision === "APPROVED" ? "INFO" : "WARNING";
}
