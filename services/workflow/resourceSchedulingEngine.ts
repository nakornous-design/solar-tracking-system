import { createNotification, notifyExceptionOwner } from "./notificationEngine.ts";
import { addHours, detectResourceConflict, type ResourceConflictStatus } from "./resourceSchedulingRules.ts";

type SupabaseClientLike = {
  from: (table: string) => any;
};

type ScheduleStageInput = {
  projectId: string;
  projectStageId: string;
  scheduledStart: string;
  scheduledEnd?: string | null;
  resourceTeamId?: string | null;
  requiredSkill?: string | null;
  territory?: string | null;
  notes?: string | null;
  actorUserId?: string | null;
};

type ScheduleStageResult =
  | {
      ok: true;
      assignmentId: string;
      conflictStatus: ResourceConflictStatus;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export async function scheduleProjectStage(
  supabase: SupabaseClientLike,
  input: ScheduleStageInput,
): Promise<ScheduleStageResult> {
  if (!input.projectId || !input.projectStageId || !input.scheduledStart) {
    return { ok: false, status: 400, error: "projectId, projectStageId, and scheduledStart are required." };
  }

  const scheduledStart = new Date(input.scheduledStart);
  if (!Number.isFinite(scheduledStart.getTime())) {
    return { ok: false, status: 400, error: "scheduledStart must be a valid datetime." };
  }

  const scheduledStartIso = scheduledStart.toISOString();
  const scheduledEndIso = input.scheduledEnd ? new Date(input.scheduledEnd).toISOString() : addHours(scheduledStartIso, 8);

  const { data: stage, error: stageError } = await supabase
    .from("project_stages")
    .select("id, project_id, code, name, owner_role, status, metadata")
    .eq("id", input.projectStageId)
    .eq("project_id", input.projectId)
    .single();

  if (stageError || !stage) {
    return { ok: false, status: 404, error: "Project stage was not found." };
  }

  const previousScheduledStart = stage.metadata?.scheduled_at || null;
  const previousScheduledEnd = stage.metadata?.scheduled_end || null;
  const isReschedule = Boolean(
    previousScheduledStart &&
      (new Date(previousScheduledStart).toISOString() !== scheduledStartIso ||
        (previousScheduledEnd && new Date(previousScheduledEnd).toISOString() !== scheduledEndIso)),
  );
  if (isReschedule && !input.notes?.trim()) {
    return { ok: false, status: 400, error: "Reschedule reason is required." };
  }
  const rescheduleDirection = isReschedule
    ? (() => {
        const before = previousScheduledStart ? new Date(previousScheduledStart).getTime() : NaN;
        const after = new Date(scheduledStartIso).getTime();
        if (!Number.isFinite(before) || !Number.isFinite(after) || before === after) return "RANGE_CHANGED";
        return after > before ? "MOVED_OUT" : "MOVED_IN";
      })()
    : null;
  const existingRescheduleCount = Number(stage.metadata?.reschedule_count || 0);
  const nextRescheduleCount = existingRescheduleCount + (isReschedule ? 1 : 0);

  let team: any | null = null;
  if (input.resourceTeamId) {
    const { data: fetchedTeam, error: teamError } = await supabase
      .from("resource_teams")
      .select("id, name, owner_role, territory, daily_capacity, skills, is_active")
      .eq("id", input.resourceTeamId)
      .single();

    if (teamError || !fetchedTeam) {
      return { ok: false, status: 404, error: "Resource team was not found." };
    }
    if (!fetchedTeam.is_active) {
      return { ok: false, status: 400, error: "Resource team is inactive." };
    }
    team = fetchedTeam;
  }

  let conflictStatus: ResourceConflictStatus = "NONE";
  let conflictReason: string | null = null;

  if (team) {
    const { data: assignments, error: assignmentError } = await supabase
      .from("resource_assignments")
      .select("id, project_stage_id, scheduled_start, scheduled_end, status")
      .eq("resource_team_id", team.id)
      .in("status", ["PLANNED", "CONFIRMED", "CHECKED_IN"]);

    if (assignmentError) throw assignmentError;

    const conflict = detectResourceConflict({
      team,
      scheduledStart: scheduledStartIso,
      scheduledEnd: scheduledEndIso,
      requiredSkill: input.requiredSkill,
      territory: input.territory,
      assignments: assignments || [],
      currentProjectStageId: input.projectStageId,
    });
    conflictStatus = conflict.status;
    conflictReason = conflict.reason;
  }

  const { data: assignment, error: upsertError } = await supabase
    .from("resource_assignments")
    .upsert({
      project_id: input.projectId,
      project_stage_id: input.projectStageId,
      resource_team_id: team?.id || null,
      scheduled_start: scheduledStartIso,
      scheduled_end: scheduledEndIso,
      status: conflictStatus === "NONE" ? "CONFIRMED" : "PLANNED",
      conflict_status: conflictStatus,
      conflict_reason: conflictReason,
      metadata: {
        required_skill: input.requiredSkill || null,
        territory: input.territory || null,
        notes: input.notes || null,
      },
    }, { onConflict: "project_stage_id" })
    .select("id")
    .single();

  if (upsertError) throw upsertError;

  await Promise.all([
    supabase
      .from("project_stages")
      .update({
        metadata: {
          ...(stage.metadata || {}),
          scheduled_at: scheduledStartIso,
          scheduled_end: scheduledEndIso,
          resource_team_id: team?.id || null,
          resource_team_name: team?.name || null,
          schedule_conflict_status: conflictStatus,
          reschedule_count: nextRescheduleCount,
          last_reschedule_reason: isReschedule ? input.notes || null : stage.metadata?.last_reschedule_reason || null,
          last_reschedule_direction: isReschedule ? rescheduleDirection : stage.metadata?.last_reschedule_direction || null,
        },
      })
      .eq("id", input.projectStageId),
    supabase
      .from("project_checklists")
      .update({
        status: "PASSED",
        completed_at: new Date().toISOString(),
        completed_by: input.actorUserId || null,
        notes: team
          ? `Scheduled ${scheduledStartIso} with ${team.name}.`
          : `Scheduled ${scheduledStartIso}.`,
        metadata: {
          scheduled_start: scheduledStartIso,
          scheduled_end: scheduledEndIso,
          resource_team_id: team?.id || null,
          resource_team_name: team?.name || null,
          conflict_status: conflictStatus,
          reschedule_count: nextRescheduleCount,
          reschedule_direction: rescheduleDirection,
          passed_source: "resource_scheduling_engine",
        },
      })
      .eq("project_stage_id", input.projectStageId)
      .eq("code", "SCHEDULE_CONFIRMED"),
    supabase.from("activity_logs").insert({
      project_id: input.projectId,
      project_stage_id: input.projectStageId,
      actor_id: input.actorUserId || null,
      action: "RESOURCE_SCHEDULED",
      before_state: {
        scheduled_start: previousScheduledStart,
        scheduled_end: previousScheduledEnd,
        resource_team_id: stage.metadata?.resource_team_id || null,
        conflict_status: stage.metadata?.schedule_conflict_status || null,
      },
      after_state: {
        assignment_id: assignment.id,
        scheduled_start: scheduledStartIso,
        scheduled_end: scheduledEndIso,
        resource_team_id: team?.id || null,
        conflict_status: conflictStatus,
      },
      metadata: {
        conflict_reason: conflictReason,
        is_reschedule: isReschedule,
        reschedule_count: nextRescheduleCount,
        reschedule_direction: rescheduleDirection,
        schedule_notes: input.notes || null,
      },
    }),
  ]);

  if (conflictStatus !== "NONE") {
    const { data: exception, error: exceptionError } = await supabase
      .from("project_exceptions")
      .insert({
        project_id: input.projectId,
        project_stage_id: input.projectStageId,
        category: "RESOURCE",
        severity: conflictStatus === "TIME_CONFLICT" || conflictStatus === "CAPACITY_CONFLICT" ? "HIGH" : "WARNING",
        status: "OPEN",
        title: `Schedule conflict: ${stage.name}`,
        description: conflictReason,
        owner_role: "ops",
        metadata: {
          assignment_id: assignment.id,
          conflict_status: conflictStatus,
        },
      })
      .select("id")
      .single();

    if (exceptionError) throw exceptionError;

    try {
      await notifyExceptionOwner(supabase, {
        projectId: input.projectId,
        projectStageId: input.projectStageId,
        exceptionId: exception.id,
        ownerRole: "ops",
        severity: conflictStatus === "TIME_CONFLICT" || conflictStatus === "CAPACITY_CONFLICT" ? "HIGH" : "WARNING",
        title: `Schedule conflict: ${stage.name}`,
        message: conflictReason,
        metadata: {
          event: "RESOURCE_CONFLICT",
          assignment_id: assignment.id,
          conflict_status: conflictStatus,
        },
      });
    } catch (notificationError: any) {
      console.warn("Notification creation failed:", notificationError.message);
    }
  } else {
    try {
      await createNotification(supabase, {
        projectId: input.projectId,
        projectStageId: input.projectStageId,
        recipientRole: team?.owner_role || stage.owner_role || "ops",
        severity: "INFO",
        title: `Schedule confirmed: ${stage.name}`,
        message: team ? `${team.name} assigned at ${scheduledStartIso}.` : `Scheduled at ${scheduledStartIso}.`,
        metadata: {
          event: "RESOURCE_SCHEDULED",
          assignment_id: assignment.id,
        },
      });
    } catch (notificationError: any) {
      console.warn("Notification creation failed:", notificationError.message);
    }
  }

  return {
    ok: true,
    assignmentId: assignment.id,
    conflictStatus,
  };
}
