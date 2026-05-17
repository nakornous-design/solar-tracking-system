import { notifyExceptionOwner } from "./notificationEngine.ts";

type SupabaseClientLike = {
  from: (table: string) => any;
};

type ExceptionStatus = "ACKNOWLEDGED" | "IN_PROGRESS" | "RESOLVED" | "WAIVED" | "CLOSED";

type TransitionExceptionResult =
  | {
      ok: true;
      exceptionId: string;
      status: ExceptionStatus;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

const ALLOWED_NEXT_STATUSES: ExceptionStatus[] = ["ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "WAIVED", "CLOSED"];

export async function transitionExceptionStatus(
  supabase: SupabaseClientLike,
  exceptionId: string,
  nextStatus: ExceptionStatus,
  resolutionNotes?: string,
  actorUserId?: string | null,
): Promise<TransitionExceptionResult> {
  if (!ALLOWED_NEXT_STATUSES.includes(nextStatus)) {
    return { ok: false, status: 400, error: "Unsupported exception status." };
  }

  const { data: exception, error: exceptionError } = await supabase
    .from("project_exceptions")
    .select("id, project_id, project_stage_id, status, title, owner_role, severity")
    .eq("id", exceptionId)
    .single();

  if (exceptionError || !exception) {
    return { ok: false, status: 404, error: "Exception was not found." };
  }

  const beforeStatus = exception.status;
  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = { status: nextStatus };

  if (nextStatus === "ACKNOWLEDGED") updatePayload.acknowledged_at = now;
  if (nextStatus === "RESOLVED") {
    updatePayload.resolved_at = now;
    updatePayload.resolution_notes = resolutionNotes || "Resolved from exception panel.";
  }
  if (nextStatus === "WAIVED") {
    updatePayload.waived_at = now;
    updatePayload.resolution_notes = resolutionNotes || "Waived from exception panel.";
  }
  if (nextStatus === "CLOSED") updatePayload.closed_at = now;

  const { error: updateError } = await supabase
    .from("project_exceptions")
    .update(updatePayload)
    .eq("id", exceptionId);

  if (updateError) throw updateError;

  await supabase.from("activity_logs").insert({
    project_id: exception.project_id,
    project_stage_id: exception.project_stage_id,
    actor_id: actorUserId || null,
    action: "EXCEPTION_STATUS_CHANGED",
    before_state: { exception_id: exceptionId, status: beforeStatus },
    after_state: { exception_id: exceptionId, status: nextStatus },
    related_entity_type: "project_exceptions",
    related_entity_id: exceptionId,
    metadata: { title: exception.title },
  });

  try {
    await notifyExceptionOwner(supabase, {
      projectId: exception.project_id,
      projectStageId: exception.project_stage_id,
      exceptionId,
      ownerRole: exception.owner_role,
      severity: exception.severity,
      title: `Exception ${nextStatus.toLowerCase()}: ${exception.title}`,
      message: resolutionNotes || null,
      metadata: {
        event: "EXCEPTION_STATUS_CHANGED",
        before_status: beforeStatus,
        next_status: nextStatus,
      },
    });
  } catch (notificationError: any) {
    console.warn("Notification creation failed:", notificationError.message);
  }

  return {
    ok: true,
    exceptionId,
    status: nextStatus,
  };
}
