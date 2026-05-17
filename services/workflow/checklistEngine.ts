type SupabaseClientLike = {
  from: (table: string) => any;
};

type ChecklistPassResult =
  | {
      ok: true;
      checklistId: string;
      projectId: string;
      projectStageId: string;
      status: "PASSED";
      alreadyPassed: boolean;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

type ChecklistUpdateResult =
  | {
      ok: true;
      checklistId: string;
      projectId: string;
      projectStageId: string;
      status: "PENDING" | "PASSED" | "FAILED" | "WAIVED";
      notes: string | null;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

function normalizeChecklistStatus(status?: string | null) {
  const normalized = String(status || "").trim().toUpperCase();
  if (!normalized) return null;
  if (["PENDING", "PASSED", "FAILED", "WAIVED"].includes(normalized)) return normalized as "PENDING" | "PASSED" | "FAILED" | "WAIVED";
  return "UNSUPPORTED";
}

export async function passProjectChecklist(
  supabase: SupabaseClientLike,
  checklistId: string,
  actorUserId?: string | null,
): Promise<ChecklistPassResult> {
  if (!checklistId) {
    return { ok: false, status: 400, error: "checklistId is required." };
  }

  const { data: checklist, error: checklistError } = await supabase
    .from("project_checklists")
    .select("id, project_id, project_stage_id, code, label, status, notes, metadata")
    .eq("id", checklistId)
    .single();

  if (checklistError || !checklist) {
    return { ok: false, status: 404, error: "Project checklist was not found." };
  }

  const previousStatus = checklist.status;

  if (previousStatus === "PASSED") {
    return {
      ok: true,
      checklistId,
      projectId: checklist.project_id,
      projectStageId: checklist.project_stage_id,
      status: "PASSED",
      alreadyPassed: true,
    };
  }

  if (checklist.code === "SCHEDULE_CONFIRMED") {
    const { data: stage, error: stageError } = await supabase
      .from("project_stages")
      .select("id, metadata")
      .eq("id", checklist.project_stage_id)
      .single();

    if (stageError || !stage?.metadata?.scheduled_at) {
      return {
        ok: false,
        status: 400,
        error: "Installation schedule must be saved before this checklist can pass.",
      };
    }
  }

  const now = new Date().toISOString();
  const nextMetadata = {
    ...(checklist.metadata || {}),
    passed_source: "project_checklist_api",
    passed_at: now,
  };

  const { error: updateError } = await supabase
    .from("project_checklists")
    .update({
      status: "PASSED",
      notes: null,
      completed_at: now,
      completed_by: actorUserId || null,
      metadata: nextMetadata,
    })
    .eq("id", checklistId);

  if (updateError) throw updateError;

  const { error: activityError } = await supabase.from("activity_logs").insert({
    project_id: checklist.project_id,
    project_stage_id: checklist.project_stage_id,
    related_entity_type: "project_checklists",
    related_entity_id: checklistId,
    action: "CHECKLIST_PASSED",
    actor_id: actorUserId || null,
    before_state: { status: previousStatus, notes: checklist.notes || null },
    after_state: { status: "PASSED", notes: null },
    metadata: {
      code: checklist.code,
      label: checklist.label,
    },
  });

  if (activityError) throw activityError;

  return {
    ok: true,
    checklistId,
    projectId: checklist.project_id,
    projectStageId: checklist.project_stage_id,
    status: "PASSED",
    alreadyPassed: false,
  };
}

export async function updateProjectChecklist(
  supabase: SupabaseClientLike,
  checklistId: string,
  input: { status?: string | null; notes?: string | null },
  actorUserId?: string | null,
): Promise<ChecklistUpdateResult> {
  if (!checklistId) {
    return { ok: false, status: 400, error: "checklistId is required." };
  }

  const { data: checklist, error: checklistError } = await supabase
    .from("project_checklists")
    .select("id, project_id, project_stage_id, code, label, status, notes, metadata")
    .eq("id", checklistId)
    .single();

  if (checklistError || !checklist) {
    return { ok: false, status: 404, error: "Project checklist was not found." };
  }

  const nextStatus = normalizeChecklistStatus(input.status) || checklist.status;
  if (nextStatus === "UNSUPPORTED") {
    return { ok: false, status: 400, error: "Unsupported checklist status." };
  }

  const previousStatus = checklist.status;
  const previousNotes = checklist.notes || null;
  const hasNotes = Object.prototype.hasOwnProperty.call(input, "notes");
  const nextNotes = hasNotes ? String(input.notes || "").trim() || null : previousNotes;
  const now = new Date().toISOString();
  const updatePayload: any = {
    status: nextStatus,
    notes: nextNotes,
    metadata: {
      ...(checklist.metadata || {}),
      updated_source: "project_checklist_api",
      updated_at: now,
    },
  };

  if (nextStatus === "PASSED" && checklist.status !== "PASSED") {
    updatePayload.completed_at = now;
    updatePayload.completed_by = actorUserId || null;
    updatePayload.metadata.passed_source = "project_checklist_api";
    updatePayload.metadata.passed_at = now;
  }

  if (nextStatus !== "PASSED") {
    updatePayload.completed_at = null;
    updatePayload.completed_by = null;
  }

  const { error: updateError } = await supabase
    .from("project_checklists")
    .update(updatePayload)
    .eq("id", checklistId);

  if (updateError) throw updateError;

  const { error: activityError } = await supabase.from("activity_logs").insert({
    project_id: checklist.project_id,
    project_stage_id: checklist.project_stage_id,
    related_entity_type: "project_checklists",
    related_entity_id: checklistId,
    action: "CHECKLIST_UPDATED",
    actor_id: actorUserId || null,
    reason: nextNotes,
    before_state: { status: previousStatus, notes: previousNotes },
    after_state: { status: nextStatus, notes: nextNotes },
    metadata: {
      code: checklist.code,
      label: checklist.label,
    },
  });

  if (activityError) throw activityError;

  return {
    ok: true,
    checklistId,
    projectId: checklist.project_id,
    projectStageId: checklist.project_stage_id,
    status: nextStatus,
    notes: nextNotes,
  };
}
