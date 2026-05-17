type SupabaseClientLike = {
  from: (table: string) => any;
};

type DocumentVersionResult =
  | {
      ok: true;
      documentId: string;
      status: string;
      versionNumber: number;
      supersedesDocumentId?: string | null;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

type ProjectDocumentRecord = {
  id: string;
  project_id: string;
  project_stage_id: string | null;
  workflow_required_document_id: string | null;
  code: string;
  name: string;
  is_required: boolean;
  requires_verification: boolean;
  gate_severity: string;
  status: string;
  version_number: number;
  google_drive_folder_id: string | null;
  metadata: Record<string, unknown>;
    };

export async function verifyProjectDocument(
  supabase: SupabaseClientLike,
  documentId: string,
  actorUserId?: string | null,
): Promise<DocumentVersionResult> {
  if (!documentId) {
    return { ok: false, status: 400, error: "documentId is required." };
  }

  const { data: document, error: documentError } = await supabase
    .from("project_documents")
    .select("id, project_id, project_stage_id, code, name, status, version_number")
    .eq("id", documentId)
    .single();

  if (documentError || !document) {
    return { ok: false, status: 404, error: "Project document was not found." };
  }

  const previousStatus = document.status;

  if (previousStatus === "SUPERSEDED") {
    return { ok: false, status: 400, error: "Superseded documents cannot be verified." };
  }

  if (previousStatus === "REJECTED") {
    return { ok: false, status: 400, error: "Rejected documents require a new version before verification." };
  }

  if (previousStatus === "VERIFIED") {
    return {
      ok: true,
      documentId: document.id,
      status: document.status,
      versionNumber: document.version_number,
      supersedesDocumentId: null,
    };
  }

  if (previousStatus !== "UPLOADED" && previousStatus !== "PENDING_VERIFY") {
    return { ok: false, status: 400, error: "Only uploaded documents can be verified." };
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("project_documents")
    .update({
      status: "VERIFIED",
      verified_by: actorUserId || null,
      verified_at: now,
    })
    .eq("id", documentId);

  if (updateError) throw updateError;

  await supabase.from("activity_logs").insert({
    project_id: document.project_id,
    project_stage_id: document.project_stage_id,
    action: "DOCUMENT_VERIFIED",
    actor_id: actorUserId || null,
    before_state: { document_id: documentId, status: previousStatus },
    after_state: { document_id: documentId, status: "VERIFIED" },
    related_entity_type: "project_documents",
    related_entity_id: documentId,
    metadata: {
      code: document.code,
      name: document.name,
      version_number: document.version_number,
    },
  });

  return {
    ok: true,
    documentId: document.id,
    status: "VERIFIED",
    versionNumber: document.version_number,
    supersedesDocumentId: null,
  };
}

export async function rejectProjectDocument(
  supabase: SupabaseClientLike,
  documentId: string,
  reason: string,
  actorUserId?: string | null,
): Promise<DocumentVersionResult> {
  const normalizedReason = reason?.trim();

  if (!normalizedReason) {
    return { ok: false, status: 400, error: "Rejection reason is required." };
  }

  const { data: document, error: documentError } = await supabase
    .from("project_documents")
    .select("id, project_id, project_stage_id, code, name, status, version_number")
    .eq("id", documentId)
    .single();

  if (documentError || !document) {
    return { ok: false, status: 404, error: "Project document was not found." };
  }

  if (document.status === "SUPERSEDED") {
    return { ok: false, status: 400, error: "Superseded documents cannot be rejected." };
  }

  if (document.status === "REJECTED") {
    return {
      ok: true,
      documentId: document.id,
      status: document.status,
      versionNumber: document.version_number,
      supersedesDocumentId: null,
    };
  }

  const { error: updateError } = await supabase
    .from("project_documents")
    .update({
      status: "REJECTED",
      rejection_reason: normalizedReason,
      verified_by: null,
      verified_at: null,
    })
    .eq("id", documentId);

  if (updateError) throw updateError;

  await supabase.from("activity_logs").insert({
    project_id: document.project_id,
    project_stage_id: document.project_stage_id,
    action: "DOCUMENT_REJECTED",
    actor_id: actorUserId || null,
    reason: normalizedReason,
    before_state: { document_id: documentId, status: document.status },
    after_state: { document_id: documentId, status: "REJECTED" },
    related_entity_type: "project_documents",
    related_entity_id: documentId,
    metadata: {
      code: document.code,
      name: document.name,
      version_number: document.version_number,
    },
  });

  return {
    ok: true,
    documentId: document.id,
    status: "REJECTED",
    versionNumber: document.version_number,
    supersedesDocumentId: null,
  };
}

export async function createProjectDocumentVersion(
  supabase: SupabaseClientLike,
  documentId: string,
  actorUserId?: string | null,
): Promise<DocumentVersionResult> {
  const { data: document, error: documentError } = await supabase
    .from("project_documents")
    .select(
      [
        "id",
        "project_id",
        "project_stage_id",
        "workflow_required_document_id",
        "code",
        "name",
        "is_required",
        "requires_verification",
        "gate_severity",
        "status",
        "version_number",
        "google_drive_folder_id",
        "metadata",
      ].join(", "),
    )
    .eq("id", documentId)
    .single();

  if (documentError || !document) {
    return { ok: false, status: 404, error: "Project document was not found." };
  }

  const oldDocument = document as ProjectDocumentRecord;

  if (oldDocument.status !== "REJECTED" && oldDocument.status !== "SUPERSEDED") {
    return { ok: false, status: 400, error: "Only rejected documents can create a new version." };
  }

  const { data: existingNextVersion, error: existingError } = await supabase
    .from("project_documents")
    .select("id, status, version_number, supersedes_document_id")
    .eq("supersedes_document_id", documentId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existingNextVersion) {
    if (oldDocument.status !== "SUPERSEDED") {
      const { error: supersedeError } = await supabase
        .from("project_documents")
        .update({ status: "SUPERSEDED" })
        .eq("id", documentId);

      if (supersedeError) throw supersedeError;
    }

    return {
      ok: true,
      documentId: existingNextVersion.id,
      status: existingNextVersion.status,
      versionNumber: existingNextVersion.version_number,
      supersedesDocumentId: existingNextVersion.supersedes_document_id,
    };
  }

  if (oldDocument.status !== "REJECTED") {
    return { ok: false, status: 400, error: "Only rejected documents can create a new version." };
  }

  const { data: nextVersion, error: insertError } = await supabase
    .from("project_documents")
    .insert({
      project_id: oldDocument.project_id,
      project_stage_id: oldDocument.project_stage_id,
      workflow_required_document_id: oldDocument.workflow_required_document_id,
      code: oldDocument.code,
      name: oldDocument.name,
      is_required: oldDocument.is_required,
      requires_verification: oldDocument.requires_verification,
      gate_severity: oldDocument.gate_severity,
      status: "REQUIRED",
      version_number: oldDocument.version_number + 1,
      supersedes_document_id: oldDocument.id,
      google_drive_folder_id: oldDocument.google_drive_folder_id,
      metadata: oldDocument.metadata || {},
    })
    .select("id, status, version_number, supersedes_document_id")
    .single();

  if (insertError) throw insertError;

  const { error: supersedeError } = await supabase
    .from("project_documents")
    .update({ status: "SUPERSEDED" })
    .eq("id", documentId);

  if (supersedeError) throw supersedeError;

  await supabase.from("activity_logs").insert({
    project_id: oldDocument.project_id,
    project_stage_id: oldDocument.project_stage_id,
    action: "DOCUMENT_VERSION_CREATED",
    actor_id: actorUserId || null,
    before_state: {
      document_id: oldDocument.id,
      status: oldDocument.status,
      version_number: oldDocument.version_number,
    },
    after_state: {
      document_id: nextVersion.id,
      status: nextVersion.status,
      version_number: nextVersion.version_number,
      supersedes_document_id: nextVersion.supersedes_document_id,
    },
    related_entity_type: "project_documents",
    related_entity_id: nextVersion.id,
    metadata: {
      code: oldDocument.code,
      name: oldDocument.name,
    },
  });

  return {
    ok: true,
    documentId: nextVersion.id,
    status: nextVersion.status,
    versionNumber: nextVersion.version_number,
    supersedesDocumentId: nextVersion.supersedes_document_id,
  };
}
