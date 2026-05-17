import { notifyExceptionOwner } from "./notificationEngine.ts";
import { calculateStageSlaStatus, maxSlaStatus, type ProjectStageSlaRow, type SlaStatus } from "./slaRules.ts";

type SupabaseClientLike = {
  from: (table: string) => any;
};

type SlaRefreshResult =
  | {
      ok: true;
      projectId: string;
      projectSlaStatus: SlaStatus;
      checkedStageCount: number;
      updatedStageCount: number;
      openSlaExceptionCount: number;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

type SlaActionResult =
  | {
      ok: true;
      projectId: string;
      projectStageId: string;
      slaStatus: SlaStatus;
      dueAt: string | null;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export async function refreshProjectSla(
  supabase: SupabaseClientLike,
  projectId: string,
): Promise<SlaRefreshResult> {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .single();

  if (projectError || !project) {
    return { ok: false, status: 404, error: "Project was not found." };
  }

  const { data: stages, error: stagesError } = await supabase
    .from("project_stages")
    .select("id, name, owner_role, status, sla_status, due_at")
    .eq("project_id", projectId);

  if (stagesError) throw stagesError;

  const typedStages = (stages || []) as ProjectStageSlaRow[];
  const nowMs = Date.now();
  const stageUpdates = typedStages
    .map((stage) => ({ stage, nextSlaStatus: calculateStageSlaStatus(stage, nowMs) }))
    .filter(({ stage, nextSlaStatus }) => stage.sla_status !== nextSlaStatus);

  await Promise.all(
    stageUpdates.map(({ stage, nextSlaStatus }) =>
      supabase.from("project_stages").update({ sla_status: nextSlaStatus }).eq("id", stage.id),
    ),
  );

  const nextStageStatuses = typedStages.map((stage) => {
    const update = stageUpdates.find(({ stage: updatedStage }) => updatedStage.id === stage.id);
    return update?.nextSlaStatus || stage.sla_status;
  });
  const stageStatusById = new Map(typedStages.map((stage, index) => [stage.id, nextStageStatuses[index]]));
  const projectSlaStatus = maxSlaStatus(nextStageStatuses);

  const { data: existingExceptions, error: existingExceptionsError } = await supabase
    .from("project_exceptions")
    .select("id, project_stage_id, status")
    .eq("project_id", projectId)
    .eq("category", "SLA")
    .in("status", ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS"]);

  if (existingExceptionsError) throw existingExceptionsError;

  const existingOpenSlaExceptionStageIds = new Set(
    ((existingExceptions || []) as { project_stage_id: string | null }[])
      .map((exception) => exception.project_stage_id)
      .filter(Boolean),
  );
  const overSlaStages = typedStages.filter((stage) => stageStatusById.get(stage.id) === "OVER_SLA");
  const newSlaExceptions = overSlaStages.filter((stage) => !existingOpenSlaExceptionStageIds.has(stage.id));

  if (newSlaExceptions.length) {
    const { data: insertedSlaExceptions, error: slaExceptionInsertError } = await supabase.from("project_exceptions").insert(
      newSlaExceptions.map((stage) => ({
        project_id: projectId,
        project_stage_id: stage.id,
        category: "SLA",
        severity: "HIGH",
        status: "OPEN",
        title: `SLA overdue: ${stage.name}`,
        description: stage.due_at ? `Stage due date has passed: ${stage.due_at}` : "Stage SLA is overdue.",
        owner_role: stage.owner_role,
        metadata: {
          source: "sla_engine",
          due_at: stage.due_at,
          stage_status: stage.status,
        },
      })),
    ).select("id, project_stage_id, title, description, owner_role, severity");

    if (slaExceptionInsertError) throw slaExceptionInsertError;

    await Promise.all(
      (insertedSlaExceptions || []).map(async (exception: any) => {
        const stage = newSlaExceptions.find((item) => item.id === exception.project_stage_id);
        try {
          await notifyExceptionOwner(supabase, {
            projectId,
            projectStageId: exception.project_stage_id,
            exceptionId: exception.id,
            ownerRole: exception.owner_role,
            severity: exception.severity,
            title: exception.title,
            message: exception.description,
            escalationLevel: 1,
            metadata: {
              event: "SLA_OVERDUE",
              due_at: stage?.due_at,
              stage_status: stage?.status,
            },
          });
        } catch (notificationError: any) {
          console.warn("Notification creation failed:", notificationError.message);
        }
      }),
    );
  }

  const resolvedSlaExceptionIds = ((existingExceptions || []) as { id: string; project_stage_id: string | null }[])
    .filter((exception) => exception.project_stage_id && stageStatusById.get(exception.project_stage_id) !== "OVER_SLA")
    .map((exception) => exception.id);

  if (resolvedSlaExceptionIds.length) {
    const { error: slaExceptionResolveError } = await supabase
      .from("project_exceptions")
      .update({
        status: "RESOLVED",
        resolved_at: new Date().toISOString(),
        resolution_notes: "SLA status returned below OVER_SLA.",
      })
      .in("id", resolvedSlaExceptionIds);

    if (slaExceptionResolveError) throw slaExceptionResolveError;
  }

  const { error: projectUpdateError } = await supabase
    .from("projects")
    .update({ sla_status: projectSlaStatus })
    .eq("id", projectId);

  if (projectUpdateError) throw projectUpdateError;

  return {
    ok: true,
    projectId,
    projectSlaStatus,
    checkedStageCount: typedStages.length,
    updatedStageCount: stageUpdates.length,
    openSlaExceptionCount: existingOpenSlaExceptionStageIds.size + newSlaExceptions.length - resolvedSlaExceptionIds.length,
  };
}

export async function pauseStageSla(
  supabase: SupabaseClientLike,
  projectId: string,
  projectStageId: string,
  reason: string,
  actorUserId?: string | null,
): Promise<SlaActionResult> {
  const normalizedReason = reason?.trim();
  if (!normalizedReason) return { ok: false, status: 400, error: "Pause reason is required." };

  const { data: stage, error: stageError } = await supabase
    .from("project_stages")
    .select("id, project_id, status, sla_status, due_at, metadata")
    .eq("id", projectStageId)
    .eq("project_id", projectId)
    .single();

  if (stageError || !stage) return { ok: false, status: 404, error: "Project stage was not found." };
  if (stage.sla_status === "SLA_PAUSED") {
    return { ok: true, projectId, projectStageId, slaStatus: "SLA_PAUSED", dueAt: stage.due_at };
  }

  const now = new Date();
  const dueAt = stage.due_at ? new Date(stage.due_at) : null;
  const remainingMs = dueAt && Number.isFinite(dueAt.getTime()) ? Math.max(0, dueAt.getTime() - now.getTime()) : null;
  const metadata = {
    ...(stage.metadata || {}),
    sla_pause: {
      paused_at: now.toISOString(),
      reason: normalizedReason,
      previous_sla_status: stage.sla_status,
      previous_due_at: stage.due_at || null,
      remaining_ms: remainingMs,
    },
  };

  await Promise.all([
    supabase
      .from("project_stages")
      .update({ sla_status: "SLA_PAUSED", metadata })
      .eq("id", projectStageId),
    supabase
      .from("projects")
      .update({ sla_status: "SLA_PAUSED" })
      .eq("id", projectId),
    supabase.from("activity_logs").insert({
      project_id: projectId,
      project_stage_id: projectStageId,
      actor_id: actorUserId || null,
      action: "SLA_PAUSED",
      reason: normalizedReason,
      before_state: { sla_status: stage.sla_status, due_at: stage.due_at || null },
      after_state: { sla_status: "SLA_PAUSED", due_at: stage.due_at || null },
      metadata: { remaining_ms: remainingMs },
    }),
  ]);

  return { ok: true, projectId, projectStageId, slaStatus: "SLA_PAUSED", dueAt: stage.due_at || null };
}

export async function resumeStageSla(
  supabase: SupabaseClientLike,
  projectId: string,
  projectStageId: string,
  actorUserId?: string | null,
): Promise<SlaActionResult> {
  const { data: stage, error: stageError } = await supabase
    .from("project_stages")
    .select("id, project_id, status, sla_status, due_at, metadata")
    .eq("id", projectStageId)
    .eq("project_id", projectId)
    .single();

  if (stageError || !stage) return { ok: false, status: 404, error: "Project stage was not found." };
  if (stage.sla_status !== "SLA_PAUSED") {
    return { ok: true, projectId, projectStageId, slaStatus: stage.sla_status, dueAt: stage.due_at || null };
  }

  const now = new Date();
  const pauseMetadata = stage.metadata?.sla_pause || {};
  const remainingMs = typeof pauseMetadata.remaining_ms === "number" ? pauseMetadata.remaining_ms : null;
  const nextDueAt = remainingMs === null ? stage.due_at || null : new Date(now.getTime() + remainingMs).toISOString();
  const pauseHistory = Array.isArray(stage.metadata?.sla_pause_history) ? stage.metadata.sla_pause_history : [];
  const { sla_pause: _removedPause, ...restMetadata } = stage.metadata || {};
  const metadata = {
    ...restMetadata,
    sla_pause_history: [
      ...pauseHistory,
      {
        ...pauseMetadata,
        resumed_at: now.toISOString(),
        resumed_due_at: nextDueAt,
      },
    ],
  };

  await Promise.all([
    supabase
      .from("project_stages")
      .update({ sla_status: "ON_TRACK", due_at: nextDueAt, metadata })
      .eq("id", projectStageId),
    supabase.from("activity_logs").insert({
      project_id: projectId,
      project_stage_id: projectStageId,
      actor_id: actorUserId || null,
      action: "SLA_RESUMED",
      before_state: { sla_status: "SLA_PAUSED", due_at: stage.due_at || null },
      after_state: { sla_status: "ON_TRACK", due_at: nextDueAt },
      metadata: { paused_at: pauseMetadata.paused_at || null, remaining_ms: remainingMs },
    }),
  ]);

  await refreshProjectSla(supabase, projectId);

  return { ok: true, projectId, projectStageId, slaStatus: "ON_TRACK", dueAt: nextDueAt };
}
