import { transitionStageForward, transitionStageRework } from "./transitionEngine.ts";
import { normalizeRequiredReason, qaBlockedMetadata, qaDecisionError } from "./reviewDecisionRules.ts";

type SupabaseClientLike = {
  from: (table: string) => any;
};

type QaOutcome = "PASS" | "FAIL" | "REWORK";

type QaResult =
  | {
      ok: true;
      outcome: QaOutcome;
      projectStageId: string;
      nextStageId?: string | null;
    }
  | {
      ok: false;
      status: number;
      error: string;
      violations?: unknown[];
    };

export async function submitQaOutcome(
  supabase: SupabaseClientLike,
  projectId: string,
  projectStageId: string,
  outcome: QaOutcome,
  reason?: string,
  evidence: unknown[] = [],
  actorUserId?: string | null,
): Promise<QaResult> {
  const { data: qaStage, error: qaStageError } = await supabase
    .from("project_stages")
    .select("id, code, name, status")
    .eq("id", projectStageId)
    .eq("project_id", projectId)
    .single();

  if (qaStageError || !qaStage) {
    return { ok: false, status: 404, error: "QA stage was not found." };
  }

  const validationError = qaDecisionError(qaStage, outcome, reason);
  if (validationError) return { ok: false, status: validationError.includes("not found") ? 404 : 400, error: validationError };

  if (outcome === "PASS") {
    const { error: checklistError } = await supabase
      .from("project_checklists")
      .update({
        status: "PASSED",
        completed_at: new Date().toISOString(),
        completed_by: actorUserId || null,
      })
      .eq("project_stage_id", projectStageId)
      .like("code", "QA_%");

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
      outcome,
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
      metadata: qaBlockedMetadata(outcome, normalizedReason, evidence),
    })
    .eq("id", projectStageId);

  if (stageUpdateError) throw stageUpdateError;

  const { error: exceptionError } = await supabase.from("project_exceptions").insert({
    project_id: projectId,
    project_stage_id: projectStageId,
    category: "QA",
    severity: "HIGH",
    status: "OPEN",
    title: outcome === "REWORK" ? "QA rework required" : "QA failed",
    description: normalizedReason,
    owner_role: "qa",
    metadata: {
      outcome,
      evidence,
    },
  });

  if (exceptionError) throw exceptionError;

  await supabase.from("activity_logs").insert({
    project_id: projectId,
    project_stage_id: projectStageId,
    actor_id: actorUserId || null,
    action: "QA_OUTCOME_SUBMITTED",
    reason: normalizedReason,
    evidence,
    after_state: {
      outcome,
      stage_status: "BLOCKED",
    },
  });

  if (outcome === "REWORK") {
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
      outcome,
      projectStageId,
      nextStageId: reworkResult.nextStageId,
    };
  }

  return {
    ok: true,
    outcome,
    projectStageId,
  };
}
