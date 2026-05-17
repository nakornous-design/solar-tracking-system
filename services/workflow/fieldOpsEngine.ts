type SupabaseClientLike = {
  from: (table: string) => any;
};

type FieldCheckInResult =
  | {
      ok: true;
      projectId: string;
      projectStageId: string;
      checkedInAt: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

type StageEvidenceInput = {
  projectStageId: string;
  fileId: string;
  name: string;
  webViewLink?: string | null;
  folderId?: string | null;
  mimeType?: string | null;
  actorUserId?: string | null;
};

type StageEvidenceResult =
  | {
      ok: true;
      projectId: string;
      projectStageId: string;
      evidenceCount: number;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export async function attachStageEvidence(
  supabase: SupabaseClientLike,
  input: StageEvidenceInput,
): Promise<StageEvidenceResult> {
  if (!input.projectStageId) {
    return { ok: false, status: 400, error: "projectStageId is required." };
  }
  if (!input.fileId || !input.name?.trim()) {
    return { ok: false, status: 400, error: "Evidence file id and name are required." };
  }

  const { data: stage, error: stageError } = await supabase
    .from("project_stages")
    .select("id, project_id, code, name, metadata")
    .eq("id", input.projectStageId)
    .single();

  if (stageError || !stage) {
    return { ok: false, status: 404, error: "Project stage was not found." };
  }

  const existingFiles = Array.isArray(stage.metadata?.evidence_files) ? stage.metadata.evidence_files : [];
  const evidenceFile = {
    fileId: input.fileId,
    name: input.name.trim(),
    webViewLink: input.webViewLink || null,
    folderId: input.folderId || null,
    mimeType: input.mimeType || null,
    uploadedAt: new Date().toISOString(),
    uploadedBy: input.actorUserId || null,
  };
  const nextFiles = [...existingFiles, evidenceFile];

  const { error: updateError } = await supabase
    .from("project_stages")
    .update({
      metadata: {
        ...(stage.metadata || {}),
        evidence_files: nextFiles,
      },
    })
    .eq("id", input.projectStageId);

  if (updateError) throw updateError;

  const { error: activityError } = await supabase.from("activity_logs").insert({
    project_id: stage.project_id,
    project_stage_id: input.projectStageId,
    related_entity_type: "project_stages",
    related_entity_id: input.projectStageId,
    action: "STAGE_EVIDENCE_UPLOADED",
    actor_id: input.actorUserId || null,
    before_state: { evidence_count: existingFiles.length },
    after_state: { evidence_count: nextFiles.length, file_id: input.fileId },
    metadata: {
      code: stage.code,
      name: stage.name,
      file_name: input.name.trim(),
      mime_type: input.mimeType || null,
      web_view_link: input.webViewLink || null,
    },
  });

  if (activityError) throw activityError;

  return {
    ok: true,
    projectId: stage.project_id,
    projectStageId: input.projectStageId,
    evidenceCount: nextFiles.length,
  };
}

export async function checkInProjectStage(
  supabase: SupabaseClientLike,
  projectStageId: string,
  actorUserId?: string | null,
): Promise<FieldCheckInResult> {
  if (!projectStageId) {
    return { ok: false, status: 400, error: "projectStageId is required." };
  }

  const { data: stage, error: stageError } = await supabase
    .from("project_stages")
    .select("id, project_id, code, name, status, metadata")
    .eq("id", projectStageId)
    .single();

  if (stageError || !stage) {
    return { ok: false, status: 404, error: "Project stage was not found." };
  }

  if (stage.status === "CANCELLED" || stage.status === "COMPLETED") {
    return { ok: false, status: 409, error: "Only active field stages can be checked in." };
  }

  const now = new Date().toISOString();
  const checkIn = {
    checked_in_at: now,
    checked_in_by: actorUserId || null,
    source: "field_ops_api",
  };

  const nextMetadata = {
    ...(stage.metadata || {}),
    field_check_in: checkIn,
  };

  const { error: updateError } = await supabase
    .from("project_stages")
    .update({ metadata: nextMetadata })
    .eq("id", projectStageId);

  if (updateError) throw updateError;

  const { error: activityError } = await supabase.from("activity_logs").insert({
    project_id: stage.project_id,
    project_stage_id: projectStageId,
    related_entity_type: "project_stages",
    related_entity_id: projectStageId,
    action: "FIELD_CHECKED_IN",
    actor_id: actorUserId || null,
    before_state: { field_check_in: stage.metadata?.field_check_in || null },
    after_state: { field_check_in: checkIn },
    metadata: {
      code: stage.code,
      name: stage.name,
    },
  });

  if (activityError) throw activityError;

  return {
    ok: true,
    projectId: stage.project_id,
    projectStageId,
    checkedInAt: now,
  };
}
