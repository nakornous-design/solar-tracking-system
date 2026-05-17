import { validateStageGates } from "./gateValidation.ts";
import { notifyExceptionOwner, notifyStageOwner } from "./notificationEngine.ts";
import {
  dueAtFromNow,
  forwardTransitionError,
  slaHoursFromRelatedStage,
  transitionMatchesProject,
  workflowVersionIdFromStage,
} from "./transitionRules.ts";

type SupabaseClientLike = {
  from: (table: string) => any;
};

type TransitionResult =
  | {
      ok: true;
      projectStatus: "IN_PROGRESS" | "COMPLETED";
      completedStageId: string;
      nextStageId: string | null;
    }
  | {
      ok: false;
      status: number;
      error: string;
      violations?: Awaited<ReturnType<typeof validateStageGates>>["violations"];
    };

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

function ownerRoleError(currentStage: any, actorRole?: string | null) {
  if (!actorRole || actorRole === "admin" || actorRole === "supervisor" || actorRole === "sbc") return null;

  const ownerRole = normalizeStageOwnerRole(currentStage?.owner_role);
  if (!ownerRole || ownerRole === normalizeStageOwnerRole(actorRole)) return null;

  return `Only the ${currentStage.owner_role || "stage owner"} role can complete this stage.`;
}

async function completeTerminalStage(
  supabase: SupabaseClientLike,
  projectId: string,
  currentStage: any,
  actorUserId?: string | null,
): Promise<TransitionResult> {
  const gateResult = await validateStageGates(supabase, currentStage.id);

  if (!gateResult.passed) {
    await Promise.all([
      supabase
        .from("project_stages")
        .update({ status: "BLOCKED", blocked_at: new Date().toISOString() })
        .eq("id", currentStage.id),
      supabase
        .from("project_exceptions")
        .insert({
          project_id: projectId,
          project_stage_id: currentStage.id,
          category: "WORKFLOW",
          severity: "HIGH",
          status: "OPEN",
          title: `Hard gate blocked: ${currentStage.name}`,
          description: gateResult.violations.map((violation) => `${violation.code}: ${violation.status}`).join("\n"),
          owner_role: currentStage.owner_role,
          metadata: {
            terminal_stage: true,
            violations: gateResult.violations,
          },
        })
        .select("id")
        .single(),
      supabase.from("activity_logs").insert({
        project_id: projectId,
        project_stage_id: currentStage.id,
        actor_id: actorUserId || null,
        action: "TRANSITION_BLOCKED",
        reason: "Required gates are incomplete.",
        metadata: {
          terminal_stage: true,
          violations: gateResult.violations,
        },
      }),
    ]);

    try {
      await notifyExceptionOwner(supabase, {
        projectId,
        projectStageId: currentStage.id,
        ownerRole: currentStage.owner_role,
        severity: "HIGH",
        title: `Hard gate blocked: ${currentStage.name}`,
        message: gateResult.violations.map((violation) => `${violation.code}: ${violation.status}`).join("\n"),
        metadata: {
          event: "TRANSITION_BLOCKED",
          terminal_stage: true,
          violations: gateResult.violations,
        },
      });
    } catch (notificationError: any) {
      console.warn("Notification creation failed:", notificationError.message);
    }

    return {
      ok: false,
      status: 409,
      error: "Required gates are incomplete.",
      violations: gateResult.violations,
    };
  }

  const now = new Date().toISOString();

  await Promise.all([
    supabase
      .from("project_stages")
      .update({ completed_at: now, status: "COMPLETED", sla_status: "ON_TRACK" })
      .eq("id", currentStage.id),
    supabase
      .from("projects")
      .update({
        status: "COMPLETED",
        current_stage_id: null,
        sla_status: "ON_TRACK",
      })
      .eq("id", projectId),
    supabase.from("activity_logs").insert({
      project_id: projectId,
      project_stage_id: currentStage.id,
      actor_id: actorUserId || null,
      action: "PROJECT_CLOSED",
      before_state: { stage_id: currentStage.id, status: currentStage.status },
      after_state: { stage_id: null, status: "COMPLETED" },
      metadata: { terminal_stage: true },
    }),
  ]);

  return {
    ok: true,
    projectStatus: "COMPLETED",
    completedStageId: currentStage.id,
    nextStageId: null,
  };
}

export async function transitionStageForward(
  supabase: SupabaseClientLike,
  projectId: string,
  projectStageId: string,
  actorUserId?: string | null,
  actorRole?: string | null,
): Promise<TransitionResult> {
  const { data: currentStage, error: currentStageError } = await supabase
    .from("project_stages")
    .select(
      "id, project_id, workflow_stage_id, code, order_index, name, owner_role, status, metadata, workflow_stages!inner(workflow_version_id)",
    )
    .eq("id", projectStageId)
    .eq("project_id", projectId)
    .single();

  if (currentStageError || !currentStage) return { ok: false, status: 404, error: "Current project stage was not found." };

  const transitionValidationError = forwardTransitionError(currentStage);
  if (transitionValidationError) return { ok: false, status: 400, error: transitionValidationError };

  const roleError = ownerRoleError(currentStage, actorRole);
  if (roleError) return { ok: false, status: 403, error: roleError };

  const workflowVersionId = workflowVersionIdFromStage(currentStage);

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, payment_type, finance_state")
    .eq("id", projectId)
    .single();

  if (projectError || !project) return { ok: false, status: 404, error: "Project was not found." };

  const { data: transitions, error: transitionError } = await supabase
    .from("workflow_transitions")
    .select("id, to_stage_id, gate_severity, rule_config")
    .eq("workflow_version_id", workflowVersionId)
    .eq("from_stage_id", currentStage.workflow_stage_id)
    .eq("type", "FORWARD")
    .eq("is_active", true);

  const transition = (transitions || []).find((item: any) => transitionMatchesProject(item, project));

  if (!transitionError && !transition && currentStage.code === "CLOSURE") {
    return completeTerminalStage(supabase, projectId, currentStage, actorUserId);
  }

  if (transitionError || !transition) {
    return { ok: false, status: 400, error: "No configured forward transition exists for this stage." };
  }

  const gateResult = await validateStageGates(supabase, projectStageId);

  if (!gateResult.passed) {
    await Promise.all([
      supabase
        .from("project_stages")
        .update({ status: "BLOCKED", blocked_at: new Date().toISOString() })
        .eq("id", projectStageId),
      supabase
        .from("project_exceptions")
        .insert({
          project_id: projectId,
          project_stage_id: projectStageId,
          category: "WORKFLOW",
          severity: "HIGH",
          status: "OPEN",
          title: `Hard gate blocked: ${currentStage.name}`,
          description: gateResult.violations.map((violation) => `${violation.code}: ${violation.status}`).join("\n"),
          owner_role: currentStage.owner_role,
          metadata: {
            transition_id: transition.id,
            violations: gateResult.violations,
          },
        })
        .select("id")
        .single(),
      supabase.from("activity_logs").insert({
        project_id: projectId,
        project_stage_id: projectStageId,
        actor_id: actorUserId || null,
        action: "TRANSITION_BLOCKED",
        reason: "Required gates are incomplete.",
        metadata: {
          transition_id: transition.id,
          violations: gateResult.violations,
        },
      }),
    ]);

    try {
      await notifyExceptionOwner(supabase, {
        projectId,
        projectStageId,
        ownerRole: currentStage.owner_role,
        severity: "HIGH",
        title: `Hard gate blocked: ${currentStage.name}`,
        message: gateResult.violations.map((violation) => `${violation.code}: ${violation.status}`).join("\n"),
        metadata: {
          event: "TRANSITION_BLOCKED",
          transition_id: transition.id,
          violations: gateResult.violations,
        },
      });
    } catch (notificationError: any) {
      console.warn("Notification creation failed:", notificationError.message);
    }

    return {
      ok: false,
      status: 409,
      error: "Required gates are incomplete.",
      violations: gateResult.violations,
    };
  }

  const { data: nextStage } = await supabase
    .from("project_stages")
    .select("id, workflow_stage_id, order_index, name, owner_role, workflow_stages!inner(sla_hours)")
    .eq("project_id", projectId)
    .eq("workflow_stage_id", transition.to_stage_id)
    .maybeSingle();

  const now = new Date().toISOString();
  const nextSlaHours = slaHoursFromRelatedStage(nextStage);

  const updates = [
    supabase
      .from("project_stages")
      .update({ completed_at: now, status: "COMPLETED", sla_status: "ON_TRACK" })
      .eq("id", projectStageId),
  ];

  if (nextStage) {
    const { data: skippedStages, error: skippedStagesError } = await supabase
      .from("project_stages")
      .select("id, order_index, status")
      .eq("project_id", projectId);

    if (skippedStagesError) throw skippedStagesError;

    const branchSkippedStageIds = (skippedStages || [])
      .filter((stage: any) =>
        stage.order_index > currentStage.order_index &&
        stage.order_index < (nextStage as any).order_index &&
        stage.status !== "COMPLETED" &&
        stage.status !== "SKIPPED",
      )
      .map((stage: any) => stage.id);

    if (branchSkippedStageIds.length) {
      updates.push(
        supabase
          .from("project_stages")
          .update({
            status: "SKIPPED",
            metadata: {
              skipped_reason: "Skipped by conditional finance path.",
              skipped_transition_id: transition.id,
            },
          })
          .in("id", branchSkippedStageIds),
      );
    }

    updates.push(
      supabase
        .from("project_stages")
        .update({
          status: "IN_PROGRESS",
          started_at: now,
          due_at: dueAtFromNow(nextSlaHours),
          sla_status: "ON_TRACK",
          blocked_at: null,
        })
        .eq("id", nextStage.id),
    );
  }

  await Promise.all(updates);

  const projectStatus = nextStage ? "IN_PROGRESS" : "COMPLETED";
  const financeStateByCompletedStage: Record<string, string> = {
    PAYMENT: "CASH_PAID",
    LOAN_DOCUMENT_COLLECTION: "LOAN_DOC_COLLECTION",
    LOAN_SUBMISSION: "LOAN_SUBMITTED",
    LOAN_APPROVAL: "LOAN_APPROVED",
    DOWN_PAYMENT: "LOAN_APPROVED",
  };
  const nextFinanceState = financeStateByCompletedStage[currentStage.code];

  await Promise.all([
    supabase
      .from("projects")
      .update({
        status: projectStatus,
        current_stage_id: nextStage?.id || null,
        sla_status: "ON_TRACK",
        ...(nextFinanceState ? { finance_state: nextFinanceState } : {}),
      })
      .eq("id", projectId),
    supabase.from("activity_logs").insert({
      project_id: projectId,
      project_stage_id: projectStageId,
      actor_id: actorUserId || null,
      action: "STAGE_TRANSITIONED_FORWARD",
      before_state: { stage_id: projectStageId, status: currentStage.status },
      after_state: { stage_id: nextStage?.id || null, status: projectStatus },
      metadata: { transition_id: transition.id },
    }),
  ]);

  if (nextStage) {
    try {
      await notifyStageOwner(supabase, {
        projectId,
        projectStageId: nextStage.id,
        ownerRole: nextStage.owner_role,
        severity: "INFO",
        title: `Stage ready: ${nextStage.name || "Next stage"}`,
        message: `Project moved forward from ${currentStage.name}.`,
        metadata: {
          event: "STAGE_TRANSITIONED_FORWARD",
          from_stage_id: projectStageId,
          to_stage_id: nextStage.id,
          transition_id: transition.id,
        },
      });
    } catch (notificationError: any) {
      console.warn("Notification creation failed:", notificationError.message);
    }
  }

  return {
    ok: true,
    projectStatus,
    completedStageId: projectStageId,
    nextStageId: nextStage?.id || null,
  };
}

export async function transitionStageRework(
  supabase: SupabaseClientLike,
  projectId: string,
  projectStageId: string,
  reason: string,
  actorUserId?: string | null,
): Promise<TransitionResult> {
  const { data: currentStage, error: currentStageError } = await supabase
    .from("project_stages")
    .select(
      "id, project_id, workflow_stage_id, order_index, name, owner_role, status, metadata, workflow_stages!inner(workflow_version_id)",
    )
    .eq("id", projectStageId)
    .eq("project_id", projectId)
    .single();

  if (currentStageError || !currentStage) {
    return { ok: false, status: 404, error: "Current project stage was not found." };
  }

  const workflowVersionId = workflowVersionIdFromStage(currentStage);

  const { data: transition, error: transitionError } = await supabase
    .from("workflow_transitions")
    .select("id, to_stage_id, rule_config")
    .eq("workflow_version_id", workflowVersionId)
    .eq("from_stage_id", currentStage.workflow_stage_id)
    .eq("type", "REWORK")
    .eq("is_active", true)
    .single();

  if (transitionError || !transition) {
    return { ok: false, status: 400, error: "No configured rework transition exists for this stage." };
  }

  const { data: reworkStage } = await supabase
    .from("project_stages")
    .select("id, workflow_stage_id, name, owner_role, workflow_stages!inner(sla_hours)")
    .eq("project_id", projectId)
    .eq("workflow_stage_id", transition.to_stage_id)
    .maybeSingle();

  if (!reworkStage) {
    return { ok: false, status: 400, error: "Configured rework target stage was not found." };
  }

  const now = new Date().toISOString();
  const reworkSlaHours = slaHoursFromRelatedStage(reworkStage);

  await Promise.all([
    supabase
      .from("project_stages")
      .update({
        status: "BLOCKED",
        blocked_at: now,
        metadata: {
          ...(currentStage.metadata || {}),
          rework_reason: reason,
          rework_transition_id: transition.id,
        },
      })
      .eq("id", projectStageId),
    supabase
      .from("project_stages")
      .update({
        status: "IN_PROGRESS",
        started_at: now,
        due_at: dueAtFromNow(reworkSlaHours),
        completed_at: null,
        blocked_at: null,
        sla_status: "ON_TRACK",
      })
      .eq("id", reworkStage.id),
  ]);

  await Promise.all([
    supabase
      .from("projects")
      .update({
        status: "IN_PROGRESS",
        current_stage_id: reworkStage.id,
        sla_status: "ON_TRACK",
      })
      .eq("id", projectId),
    supabase.from("activity_logs").insert({
      project_id: projectId,
      project_stage_id: projectStageId,
      actor_id: actorUserId || null,
      action: "STAGE_TRANSITIONED_REWORK",
      reason,
      before_state: { stage_id: projectStageId, status: currentStage.status },
      after_state: { stage_id: reworkStage.id, status: "IN_PROGRESS" },
      metadata: { transition_id: transition.id },
    }),
  ]);

  try {
    await notifyStageOwner(supabase, {
      projectId,
      projectStageId: reworkStage.id,
      ownerRole: reworkStage.owner_role,
      severity: "WARNING",
      title: `Rework required: ${currentStage.name}`,
      message: reason,
      metadata: {
        event: "STAGE_TRANSITIONED_REWORK",
        from_stage_id: projectStageId,
        to_stage_id: reworkStage.id,
        transition_id: transition.id,
      },
    });
  } catch (notificationError: any) {
    console.warn("Notification creation failed:", notificationError.message);
  }

  return {
    ok: true,
    projectStatus: "IN_PROGRESS",
    completedStageId: projectStageId,
    nextStageId: reworkStage.id,
  };
}
