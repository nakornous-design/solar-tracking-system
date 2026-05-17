import { createNotification } from "./notificationEngine.ts";
import { dueAtFromNow, slaHoursFromRelatedStage } from "./transitionRules.ts";

type SupabaseClientLike = {
  from: (table: string) => any;
};

type FinancePathAction = "SWITCH_TO_CASH" | "SWITCH_TO_LOAN";

type FinancePathResult =
  | {
      ok: true;
      action: FinancePathAction;
      projectId: string;
      paymentType: "CASH" | "LOAN";
      financeState: string;
      nextStageId: string | null;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

function requiredReasonError(reason?: string) {
  return reason?.trim() ? null : "Reason is required.";
}

function stageCodesForPath(action: FinancePathAction) {
  return action === "SWITCH_TO_LOAN"
    ? ["LOAN_DOCUMENT_COLLECTION", "LOAN_SUBMISSION", "LOAN_REVIEW", "LOAN_APPROVAL", "DOWN_PAYMENT"]
    : ["PAYMENT"];
}

export async function switchFinancePath(
  supabase: SupabaseClientLike,
  projectId: string,
  action: FinancePathAction,
  reason?: string,
  actorUserId?: string | null,
  decisionStageId?: string | null,
): Promise<FinancePathResult> {
  if (!["SWITCH_TO_CASH", "SWITCH_TO_LOAN"].includes(action)) {
    return { ok: false, status: 400, error: "Unsupported finance path action." };
  }

  const reasonError = requiredReasonError(reason);
  if (reasonError) return { ok: false, status: 400, error: reasonError };

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, payment_type, finance_state, payment_path_history, status, current_stage_id")
    .eq("id", projectId)
    .single();

  if (projectError || !project) return { ok: false, status: 404, error: "Project was not found." };
  if (project.status === "COMPLETED" || project.status === "CANCELLED") {
    return { ok: false, status: 400, error: "Completed or cancelled projects cannot change finance path." };
  }

  const nextPaymentType = action === "SWITCH_TO_LOAN" ? "LOAN" : "CASH";
  const nextFinanceState = action === "SWITCH_TO_LOAN" ? "LOAN_DOC_COLLECTION" : "CASH_PENDING_PAYMENT";
  if (project.payment_type === nextPaymentType && project.finance_state === nextFinanceState) {
    return { ok: false, status: 400, error: "Project is already on this finance path." };
  }

  const { data: stages, error: stagesError } = await supabase
    .from("project_stages")
    .select("id, code, order_index, status, workflow_stages(sla_hours)")
    .eq("project_id", projectId)
    .order("order_index", { ascending: true });

  if (stagesError) throw stagesError;

  const targetStage = (stages || []).find((stage: any) => stageCodesForPath(action).includes(stage.code));
  if (!targetStage) return { ok: false, status: 400, error: "Target finance stage was not found in this workflow." };

  const decisionStage = (stages || []).find((stage: any) => stage.id === decisionStageId);
  const decisionAtQuotation =
    decisionStage?.code === "QUOTATION" &&
    (decisionStage.status === "IN_PROGRESS" || decisionStage.status === "BLOCKED");

  const now = new Date().toISOString();
  const deactivateCodes = action === "SWITCH_TO_LOAN"
    ? new Set(["PAYMENT"])
    : new Set(["LOAN_DOCUMENT_COLLECTION", "LOAN_SUBMISSION", "LOAN_REVIEW", "LOAN_APPROVAL", "DOWN_PAYMENT"]);
  const deactivateStageIds = (stages || [])
    .filter((stage: any) => deactivateCodes.has(stage.code) && stage.id !== targetStage.id && stage.status !== "COMPLETED")
    .map((stage: any) => stage.id);

  await Promise.all([
    deactivateStageIds.length
      ? supabase
          .from("project_stages")
          .update({
            status: "SKIPPED",
            metadata: {
              skipped_reason: `Finance path changed to ${nextPaymentType}.`,
              skipped_source: action,
            },
          })
          .in("id", deactivateStageIds)
      : Promise.resolve({ error: null }),
    supabase
      .from("project_stages")
      .update({
        status: decisionAtQuotation ? "PENDING" : "IN_PROGRESS",
        started_at: decisionAtQuotation ? null : now,
        due_at: decisionAtQuotation ? null : dueAtFromNow(slaHoursFromRelatedStage(targetStage)),
        completed_at: null,
        blocked_at: null,
        sla_status: "ON_TRACK",
        metadata: {
          finance_path_changed_at: now,
          finance_path_action: action,
          ...(decisionAtQuotation ? { finance_path_decision_stage_id: decisionStage.id } : {}),
        },
      })
      .eq("id", targetStage.id),
    supabase
      .from("projects")
      .update({
        payment_type: nextPaymentType,
        finance_state: nextFinanceState,
        current_stage_id: decisionAtQuotation ? decisionStage.id : targetStage.id,
        status: "IN_PROGRESS",
        sla_status: "ON_TRACK",
        payment_path_history: [
          ...((project.payment_path_history as any[]) || []),
          {
            payment_type: nextPaymentType,
            finance_state: nextFinanceState,
            changed_at: now,
            reason: reason!.trim(),
            source: action,
            ...(decisionAtQuotation ? { decision_stage_code: "QUOTATION" } : {}),
          },
        ],
      })
      .eq("id", projectId),
    supabase.from("activity_logs").insert({
      project_id: projectId,
      project_stage_id: targetStage.id,
      actor_id: actorUserId || null,
      action,
      reason: reason!.trim(),
      before_state: {
        payment_type: project.payment_type,
        finance_state: project.finance_state,
        current_stage_id: project.current_stage_id,
      },
      after_state: {
        payment_type: nextPaymentType,
        finance_state: nextFinanceState,
        current_stage_id: decisionAtQuotation ? decisionStage.id : targetStage.id,
        target_stage_id: targetStage.id,
        skipped_stage_ids: deactivateStageIds,
        ...(decisionAtQuotation ? { decision_stage_code: "QUOTATION" } : {}),
      },
    }),
  ]);

  await createNotification(supabase, {
    projectId,
    projectStageId: targetStage.id,
    recipientRole: nextPaymentType === "LOAN" ? "finance" : "sales",
    severity: "WARNING",
    title: `Finance path changed to ${nextPaymentType}`,
    message: reason!.trim(),
    metadata: { event: action },
  });

  return {
    ok: true,
    action,
    projectId,
    paymentType: nextPaymentType,
    financeState: nextFinanceState,
    nextStageId: decisionAtQuotation ? decisionStage.id : targetStage.id,
  };
}
