import { createNotification } from "./notificationEngine.ts";
import { dueAtFromNow, slaHoursFromRelatedStage } from "./transitionRules.ts";

type SupabaseClientLike = {
  from: (table: string) => any;
};

type LoanFallbackAction = "REJECT_AND_OFFER_CASH" | "ACCEPT_CASH_OFFER" | "DECLINE_CASH_OFFER";

type LoanFallbackResult =
  | {
      ok: true;
      action: LoanFallbackAction;
      projectId: string;
      projectStageId: string;
      nextStageId?: string | null;
      projectStatus: "IN_PROGRESS" | "CANCELLED";
      paymentType?: "CASH" | "LOAN";
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

const LOAN_DECISION_STAGE_CODES = new Set(["LOAN_SUBMISSION", "LOAN_REVIEW", "LOAN_APPROVAL"]);

function requiredReasonError(reason?: string) {
  return reason?.trim() ? null : "Reason is required.";
}

function stageIsWaitingForCashDecision(stage: any) {
  return stage?.metadata?.loan_fallback?.state === "CASH_OFFERED";
}

async function fetchProjectAndStage(supabase: SupabaseClientLike, projectId: string, projectStageId: string) {
  const [{ data: project, error: projectError }, { data: stage, error: stageError }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, payment_type, finance_state, payment_path_history, status, current_stage_id")
      .eq("id", projectId)
      .single(),
    supabase
      .from("project_stages")
      .select("id, project_id, workflow_stage_id, code, name, order_index, owner_role, status, metadata, workflow_stages!inner(workflow_version_id)")
      .eq("id", projectStageId)
      .eq("project_id", projectId)
      .single(),
  ]);

  if (projectError || !project) return { error: { ok: false as const, status: 404, error: "Project was not found." } };
  if (stageError || !stage) return { error: { ok: false as const, status: 404, error: "Loan stage was not found." } };
  return { project, stage };
}

function updateOpenFallbackExceptions(
  supabase: SupabaseClientLike,
  projectId: string,
  projectStageId: string,
  payload: Record<string, unknown>,
) {
  return supabase
    .from("project_exceptions")
    .update(payload)
    .eq("project_id", projectId)
    .eq("project_stage_id", projectStageId)
    .eq("category", "WORKFLOW")
    .in("status", ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS"]);
}

export async function submitLoanFallbackDecision(
  supabase: SupabaseClientLike,
  projectId: string,
  projectStageId: string,
  action: LoanFallbackAction,
  reason?: string,
  evidence: unknown[] = [],
  actorUserId?: string | null,
): Promise<LoanFallbackResult> {
  if (!["REJECT_AND_OFFER_CASH", "ACCEPT_CASH_OFFER", "DECLINE_CASH_OFFER"].includes(action)) {
    return { ok: false, status: 400, error: "Unsupported loan fallback action." };
  }

  const fetched = await fetchProjectAndStage(supabase, projectId, projectStageId);
  if (fetched.error) return fetched.error;

  const { project, stage } = fetched;
  if (project.payment_type !== "LOAN") {
    return { ok: false, status: 400, error: "Loan fallback decisions are only valid for LOAN projects." };
  }
  if (!LOAN_DECISION_STAGE_CODES.has(stage.code)) {
    return { ok: false, status: 400, error: "Loan fallback decisions must be made from a loan decision stage." };
  }

  if (action === "REJECT_AND_OFFER_CASH") {
    const reasonError = requiredReasonError(reason);
    if (reasonError) return { ok: false, status: 400, error: reasonError };

    const now = new Date().toISOString();
    const metadata = {
      ...(stage.metadata || {}),
      loan_fallback: {
        state: "CASH_OFFERED",
        loan_rejected_at: now,
        reason: reason!.trim(),
        evidence,
      },
    };

    const { data: exception, error: exceptionError } = await supabase
      .from("project_exceptions")
      .insert({
        project_id: projectId,
        project_stage_id: projectStageId,
        category: "WORKFLOW",
        severity: "HIGH",
        status: "OPEN",
        title: "Loan rejected: cash fallback required",
        description: reason!.trim(),
        owner_role: "sales",
        metadata: { action, evidence },
      })
      .select("id")
      .single();

    if (exceptionError) throw exceptionError;

    await Promise.all([
      supabase
        .from("project_stages")
        .update({ status: "WAITING", blocked_at: now, metadata })
        .eq("id", projectStageId),
      supabase.from("activity_logs").insert({
        project_id: projectId,
        project_stage_id: projectStageId,
        actor_id: actorUserId || null,
        related_entity_type: "project_exceptions",
        related_entity_id: exception.id,
        action: "LOAN_REJECTED_CASH_OFFERED",
        reason: reason!.trim(),
        evidence,
        before_state: { payment_type: "LOAN", stage_status: stage.status },
        after_state: { payment_type: "LOAN", finance_state: "LOAN_REJECTED_CASH_OFFERED", stage_status: "WAITING", fallback_state: "CASH_OFFERED" },
      }),
      supabase
        .from("projects")
        .update({
          finance_state: "LOAN_REJECTED_CASH_OFFERED",
          payment_path_history: [
            ...((project.payment_path_history as any[]) || []),
            {
              payment_type: "LOAN",
              finance_state: "LOAN_REJECTED_CASH_OFFERED",
              changed_at: now,
              reason: reason!.trim(),
              source_stage_id: projectStageId,
            },
          ],
        })
        .eq("id", projectId),
    ]);

    await createNotification(supabase, {
      projectId,
      projectStageId,
      exceptionId: exception.id,
      recipientRole: "sales",
      severity: "HIGH",
      title: "Offer CASH fallback",
      message: reason!.trim(),
      metadata: { event: "LOAN_REJECTED_CASH_OFFERED" },
    });

    return { ok: true, action, projectId, projectStageId, projectStatus: "IN_PROGRESS", paymentType: "LOAN" };
  }

  if (!stageIsWaitingForCashDecision(stage)) {
    return { ok: false, status: 400, error: "Cash fallback has not been offered for this loan stage." };
  }

  if (action === "DECLINE_CASH_OFFER") {
    const reasonError = requiredReasonError(reason);
    if (reasonError) return { ok: false, status: 400, error: reasonError };

    const now = new Date().toISOString();
    const { data: stages } = await supabase
      .from("project_stages")
      .select("id, status")
      .eq("project_id", projectId);
    const cancellableStageIds = (stages || [])
      .filter((item: any) => item.status !== "COMPLETED" && item.status !== "CANCELLED")
      .map((item: any) => item.id);

    await Promise.all([
      supabase
        .from("projects")
        .update({ status: "CANCELLED", current_stage_id: null })
        .eq("id", projectId),
      cancellableStageIds.length
        ? supabase
            .from("project_stages")
            .update({
              status: "CANCELLED",
              blocked_at: now,
              metadata: {
                cancellation_reason: reason!.trim(),
                cancellation_source: "LOAN_REJECTED_CASH_DECLINED",
              },
            })
            .in("id", cancellableStageIds)
        : Promise.resolve({ error: null }),
      updateOpenFallbackExceptions(supabase, projectId, projectStageId, {
        status: "CLOSED",
        resolved_at: now,
        resolution_notes: "Customer declined CASH fallback.",
        metadata: { action, evidence, fallback_state: "CASH_DECLINED" },
      }),
      supabase.from("activity_logs").insert({
        project_id: projectId,
        project_stage_id: projectStageId,
        actor_id: actorUserId || null,
        action: "PROJECT_CANCELLED_AFTER_LOAN_REJECTION",
        reason: reason!.trim(),
        evidence,
        before_state: { payment_type: "LOAN", project_status: project.status },
        after_state: { payment_type: "LOAN", finance_state: "CUSTOMER_DECLINED_CASH", project_status: "CANCELLED" },
      }),
    ]);

    await createNotification(supabase, {
      projectId,
      projectStageId,
      recipientRole: "ops",
      severity: "WARNING",
      title: "Project cancelled after loan rejection",
      message: reason!.trim(),
      metadata: { event: "PROJECT_CANCELLED_AFTER_LOAN_REJECTION" },
    });

    await supabase
      .from("projects")
      .update({
        finance_state: "CUSTOMER_DECLINED_CASH",
        payment_path_history: [
          ...((project.payment_path_history as any[]) || []),
          {
            payment_type: "LOAN",
            finance_state: "CUSTOMER_DECLINED_CASH",
            changed_at: now,
            reason: reason!.trim(),
            source_stage_id: projectStageId,
          },
        ],
      })
      .eq("id", projectId);

    return { ok: true, action, projectId, projectStageId, nextStageId: null, projectStatus: "CANCELLED", paymentType: "LOAN" };
  }

  const { data: allStages, error: stagesError } = await supabase
    .from("project_stages")
    .select("id, code, order_index, status, workflow_stages(sla_hours)")
    .eq("project_id", projectId)
    .order("order_index", { ascending: true });

  if (stagesError) throw stagesError;

  const targetStage = (allStages || []).find((item: any) => item.code === "DOWN_PAYMENT" || item.code === "PAYMENT");
  if (!targetStage) return { ok: false, status: 400, error: "No payment stage exists for CASH fallback." };

  const now = new Date().toISOString();
  const loanBranchCodes = new Set(["LOAN_DOCUMENT_COLLECTION", "LOAN_SUBMISSION", "LOAN_REVIEW", "LOAN_APPROVAL", "DOWN_PAYMENT"]);
  const skippedStageIds = (allStages || [])
    .filter((item: any) => {
      if (item.id === projectStageId || item.id === targetStage.id) return false;
      if (item.status === "COMPLETED") return false;
      if (targetStage.order_index < stage.order_index) return loanBranchCodes.has(item.code);
      return item.order_index > stage.order_index && item.order_index < targetStage.order_index;
    })
    .map((item: any) => item.id);

  await Promise.all([
    supabase
      .from("project_stages")
      .update({
        status: "COMPLETED",
        completed_at: now,
        sla_status: "ON_TRACK",
        metadata: {
          ...(stage.metadata || {}),
          loan_fallback: {
            ...(stage.metadata?.loan_fallback || {}),
            state: "CASH_ACCEPTED",
            cash_accepted_at: now,
            reason: reason?.trim() || null,
          },
        },
      })
      .eq("id", projectStageId),
    skippedStageIds.length
      ? supabase
          .from("project_stages")
          .update({
            status: "SKIPPED",
            metadata: {
              skipped_reason: "Customer accepted CASH fallback after loan rejection.",
              skipped_source: "LOAN_REJECTED_CASH_ACCEPTED",
            },
          })
          .in("id", skippedStageIds)
      : Promise.resolve({ error: null }),
    supabase
      .from("project_stages")
      .update({
        status: "IN_PROGRESS",
        started_at: now,
        due_at: dueAtFromNow(slaHoursFromRelatedStage(targetStage)),
        sla_status: "ON_TRACK",
        blocked_at: null,
        metadata: {
          cash_fallback_source_stage_id: projectStageId,
          cash_fallback_started_at: now,
        },
      })
      .eq("id", targetStage.id),
    supabase
      .from("projects")
      .update({
        payment_type: "CASH",
        finance_state: "CUSTOMER_ACCEPTED_CASH",
        payment_path_history: [
          ...((project.payment_path_history as any[]) || []),
          {
            payment_type: "CASH",
            finance_state: "CUSTOMER_ACCEPTED_CASH",
            changed_at: now,
            reason: reason?.trim() || "Customer accepted CASH fallback.",
            source_stage_id: projectStageId,
          },
        ],
        status: "IN_PROGRESS",
        current_stage_id: targetStage.id,
        sla_status: "ON_TRACK",
      })
      .eq("id", projectId),
    updateOpenFallbackExceptions(supabase, projectId, projectStageId, {
      status: "RESOLVED",
      resolved_at: now,
      resolution_notes: "Project converted to CASH fallback.",
      metadata: { action, target_stage_id: targetStage.id, skipped_stage_ids: skippedStageIds, evidence },
    }),
    supabase.from("activity_logs").insert({
      project_id: projectId,
      project_stage_id: projectStageId,
      actor_id: actorUserId || null,
      action: "LOAN_REJECTED_CASH_ACCEPTED",
      reason: reason?.trim() || null,
      evidence,
      before_state: { payment_type: "LOAN", stage_id: projectStageId },
      after_state: { payment_type: "CASH", finance_state: "CUSTOMER_ACCEPTED_CASH", stage_id: targetStage.id, skipped_stage_ids: skippedStageIds },
    }),
  ]);

  await createNotification(supabase, {
    projectId,
    projectStageId: targetStage.id,
    recipientRole: "finance",
    severity: "WARNING",
    title: "CASH fallback accepted",
    message: "Loan was rejected and customer accepted CASH fallback. Payment/down payment stage is ready.",
    metadata: { event: "LOAN_REJECTED_CASH_ACCEPTED", source_stage_id: projectStageId },
  });

  return { ok: true, action, projectId, projectStageId, nextStageId: targetStage.id, projectStatus: "IN_PROGRESS", paymentType: "CASH" };
}
