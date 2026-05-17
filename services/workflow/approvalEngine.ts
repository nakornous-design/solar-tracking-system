import { createNotification } from "./notificationEngine.ts";
import {
  approvalDecisionError,
  approvalDecisionSeverity,
  gateOverrideRequestError,
  gateOverrideScope,
  normalizeApprovalReason,
  type ApprovalDecision,
} from "./approvalRules.ts";

type SupabaseClientLike = {
  from: (table: string) => any;
};

type ApprovalResult =
  | {
      ok: true;
      approvalId: string;
      status: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export async function createGateOverrideRequest(
  supabase: SupabaseClientLike,
  projectId: string,
  projectStageId: string,
  reason: string,
  evidence: unknown[] = [],
  actorUserId?: string | null,
): Promise<ApprovalResult> {
  const normalizedReason = normalizeApprovalReason(reason);

  const validationError = gateOverrideRequestError(normalizedReason);
  if (validationError) return { ok: false, status: 400, error: validationError };

  const { data: approval, error: approvalError } = await supabase
    .from("approval_requests")
    .insert({
      project_id: projectId,
      project_stage_id: projectStageId,
      type: "GATE_OVERRIDE",
      status: "PENDING",
      reason: normalizedReason,
      evidence,
      requested_by: actorUserId || null,
      scope: gateOverrideScope(projectStageId),
    })
    .select("id, status")
    .single();

  if (approvalError) throw approvalError;

  await supabase.from("activity_logs").insert({
    project_id: projectId,
    project_stage_id: projectStageId,
    actor_id: actorUserId || null,
    action: "APPROVAL_REQUEST_CREATED",
    reason: normalizedReason,
    evidence,
    related_entity_type: "approval_requests",
    related_entity_id: approval.id,
    after_state: { status: approval.status, type: "GATE_OVERRIDE" },
  });

  try {
    await createNotification(supabase, {
      projectId,
      projectStageId,
      approvalRequestId: approval.id,
      recipientRole: "admin",
      severity: "WARNING",
      title: "Approval required: Gate override",
      message: normalizedReason,
      metadata: {
        event: "APPROVAL_REQUEST_CREATED",
        type: "GATE_OVERRIDE",
      },
    });
  } catch (notificationError: any) {
    console.warn("Notification creation failed:", notificationError.message);
  }

  return {
    ok: true,
    approvalId: approval.id,
    status: approval.status,
  };
}

export async function decideApprovalRequest(
  supabase: SupabaseClientLike,
  approvalId: string,
  decision: ApprovalDecision,
  decisionReason?: string,
  actorUserId?: string | null,
): Promise<ApprovalResult> {
  const { data: approval, error: approvalError } = await supabase
    .from("approval_requests")
    .select("id, project_id, project_stage_id, status, type")
    .eq("id", approvalId)
    .single();

  if (approvalError || !approval) {
    return { ok: false, status: 404, error: "Approval request was not found." };
  }

  const validationError = approvalDecisionError(approval);
  if (validationError) return { ok: false, status: validationError.includes("not found") ? 404 : 400, error: validationError };

  const { error: updateError } = await supabase
    .from("approval_requests")
    .update({
      status: decision,
      decision_reason: decisionReason || null,
      approver_id: actorUserId || null,
      decided_at: new Date().toISOString(),
    })
    .eq("id", approvalId);

  if (updateError) throw updateError;

  await supabase.from("activity_logs").insert({
    project_id: approval.project_id,
    project_stage_id: approval.project_stage_id,
    actor_id: actorUserId || null,
    action: "APPROVAL_REQUEST_DECIDED",
    reason: decisionReason || null,
    related_entity_type: "approval_requests",
    related_entity_id: approvalId,
    before_state: { status: approval.status },
    after_state: { status: decision, type: approval.type },
  });

  try {
    await createNotification(supabase, {
      projectId: approval.project_id,
      projectStageId: approval.project_stage_id,
      approvalRequestId: approvalId,
      recipientRole: "ops",
      severity: approvalDecisionSeverity(decision),
      title: `Approval ${decision.toLowerCase()}: ${approval.type}`,
      message: decisionReason || null,
      metadata: {
        event: "APPROVAL_REQUEST_DECIDED",
        decision,
        type: approval.type,
      },
    });
  } catch (notificationError: any) {
    console.warn("Notification creation failed:", notificationError.message);
  }

  return {
    ok: true,
    approvalId,
    status: decision,
  };
}
