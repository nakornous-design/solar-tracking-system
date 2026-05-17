import { transitionStageForward, transitionStageRework } from "./transitionEngine.ts";
import { billingBlockedMetadata, billingDecisionError, normalizeRequiredReason } from "./reviewDecisionRules.ts";

type SupabaseClientLike = {
  from: (table: string) => any;
};

type BillingDecision = "APPROVE" | "REJECT";

type BillingResult =
  | {
      ok: true;
      decision: BillingDecision;
      projectStageId: string;
      nextStageId?: string | null;
    }
  | {
      ok: false;
      status: number;
      error: string;
      violations?: unknown[];
    };

export async function submitBillingDecision(
  supabase: SupabaseClientLike,
  projectId: string,
  projectStageId: string,
  decision: BillingDecision,
  reason?: string,
  evidence: unknown[] = [],
  actorUserId?: string | null,
): Promise<BillingResult> {
  const { data: billingStage, error: billingStageError } = await supabase
    .from("project_stages")
    .select("id, code, name, status")
    .eq("id", projectStageId)
    .eq("project_id", projectId)
    .single();

  if (billingStageError || !billingStage) {
    return { ok: false, status: 404, error: "Billing stage was not found." };
  }

  const validationError = billingDecisionError(billingStage, decision, reason);
  if (validationError) return { ok: false, status: validationError.includes("not found") ? 404 : 400, error: validationError };

  if (decision === "APPROVE") {
    const { error: checklistError } = await supabase
      .from("project_checklists")
      .update({
        status: "PASSED",
        completed_at: new Date().toISOString(),
        completed_by: actorUserId || null,
      })
      .eq("project_stage_id", projectStageId)
      .eq("code", "BILLING_REVIEW_COMPLETE");

    if (checklistError) throw checklistError;

    const transitionResult = await transitionStageForward(supabase, projectId, projectStageId, actorUserId);

    if (!transitionResult.ok) {
      return {
        ok: false,
        status: transitionResult.status,
        error: transitionResult.error,
        violations: transitionResult.violations,
      };
    }

    return {
      ok: true,
      decision,
      projectStageId,
      nextStageId: transitionResult.nextStageId,
    };
  }

  const normalizedReason = normalizeRequiredReason(reason);

  const now = new Date().toISOString();

  const { error: stageUpdateError } = await supabase
    .from("project_stages")
    .update({
      status: "BLOCKED",
      blocked_at: now,
      metadata: billingBlockedMetadata(decision, normalizedReason, evidence),
    })
    .eq("id", projectStageId);

  if (stageUpdateError) throw stageUpdateError;

  const { error: exceptionError } = await supabase.from("project_exceptions").insert({
    project_id: projectId,
    project_stage_id: projectStageId,
    category: "BILLING",
    severity: "HIGH",
    status: "OPEN",
    title: "Billing rejected",
    description: normalizedReason,
    owner_role: "finance",
    metadata: {
      decision,
      evidence,
    },
  });

  if (exceptionError) throw exceptionError;

  await supabase.from("activity_logs").insert({
    project_id: projectId,
    project_stage_id: projectStageId,
    actor_id: actorUserId || null,
    action: "BILLING_DECISION_SUBMITTED",
    reason: normalizedReason,
    evidence,
    after_state: {
      decision,
      stage_status: "BLOCKED",
    },
  });

  const reworkResult = await transitionStageRework(supabase, projectId, projectStageId, normalizedReason, actorUserId);

  if (!reworkResult.ok) {
    return {
      ok: false,
      status: reworkResult.status,
      error: reworkResult.error,
      violations: reworkResult.violations,
    };
  }

  return {
    ok: true,
    decision,
    projectStageId,
    nextStageId: reworkResult.nextStageId,
  };
}
