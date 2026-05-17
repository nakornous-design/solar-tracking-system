type SupabaseClientLike = {
  from: (table: string) => any;
};

type GenerateRuntimeResult =
  | {
      ok: true;
      projectId: string;
      created: boolean;
      stageCount: number;
      currentStageId: string | null;
      workflowVersionId: string;
      appliedStandardId: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

type WorkflowStageRow = {
  id: string;
  code: string;
  name: string;
  order_index: number;
  owner_role: string | null;
  sla_hours: number | null;
  is_start: boolean;
};

type ProjectStageRuntimeRow = {
  id: string;
  workflow_stage_id: string;
  order_index: number;
};

type WorkflowChecklistRow = {
  id: string;
  workflow_stage_id: string;
  code: string;
  label: string;
  is_required: boolean;
  gate_severity: string;
};

type WorkflowDocumentRow = {
  id: string;
  workflow_stage_id: string;
  code: string;
  name: string;
  is_required: boolean;
  requires_verification: boolean;
  gate_severity: string;
  drive_folder_key: string | null;
};

function dueAtFromNow(slaHours: number | null) {
  if (!slaHours) return null;
  return new Date(Date.now() + slaHours * 60 * 60 * 1000).toISOString();
}

const LOAN_STAGE_CODES = new Set([
  "LOAN_DOCUMENT_COLLECTION",
  "LOAN_SUBMISSION",
  "LOAN_REVIEW",
  "LOAN_APPROVAL",
  "DOWN_PAYMENT",
]);

function inactiveFinanceStageReason(stageCode: string, paymentType?: string | null) {
  if (paymentType === "CASH" && LOAN_STAGE_CODES.has(stageCode)) {
    return "Inactive for CASH finance path.";
  }
  if (paymentType === "LOAN" && stageCode === "PAYMENT") {
    return "Inactive for LOAN finance path.";
  }
  return null;
}

function inferActiveStage(workflowStages: WorkflowStageRow[], legacyStatus?: string | null) {
  if (!legacyStatus) return workflowStages.find((stage) => stage.is_start) || workflowStages[0];

  const normalizedStatus = legacyStatus.toLowerCase();
  const matchedStage = workflowStages.find((stage) => {
    const code = String(stage.code || "").toLowerCase();
    const name = String(stage.name || "").toLowerCase();
    return normalizedStatus.includes(code.replaceAll("_", " ")) || normalizedStatus.includes(name);
  });

  return matchedStage || workflowStages.find((stage) => stage.is_start) || workflowStages[0];
}

export async function generateRuntimeForExistingProject(
  supabase: SupabaseClientLike,
  projectId: string,
): Promise<GenerateRuntimeResult> {
  const { count: existingStageCount, error: existingStageError } = await supabase
    .from("project_stages")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  if (existingStageError) throw existingStageError;

  if ((existingStageCount || 0) > 0) {
    const { data: currentProject, error: currentProjectError } = await supabase
      .from("projects")
      .select("workflow_version_id, applied_standard_id, current_stage_id")
      .eq("id", projectId)
      .single();

    if (currentProjectError || !currentProject) {
      return { ok: false, status: 404, error: "Project was not found." };
    }

    const { data: existingProjectStages, error: existingProjectStagesError } = await supabase
      .from("project_stages")
      .select("id, workflow_stage_id, order_index, status")
      .eq("project_id", projectId)
      .order("order_index", { ascending: true });

    if (existingProjectStagesError) throw existingProjectStagesError;

    const typedProjectStages = (existingProjectStages || []) as (ProjectStageRuntimeRow & { status: string })[];
    const projectStageByWorkflowStageId = new Map(
      typedProjectStages.map((stage) => [stage.workflow_stage_id, stage]),
    );
    const activeRuntimeStage =
      typedProjectStages.find((stage) => stage.id === currentProject.current_stage_id) ||
      typedProjectStages.find((stage) => stage.status === "IN_PROGRESS" || stage.status === "BLOCKED") ||
      typedProjectStages[0];

    if (!currentProject.current_stage_id && activeRuntimeStage) {
      const { error: currentStageUpdateError } = await supabase
        .from("projects")
        .update({ current_stage_id: activeRuntimeStage.id })
        .eq("id", projectId);

      if (currentStageUpdateError) throw currentStageUpdateError;
    }

    const workflowStageIds = typedProjectStages.map((stage) => stage.workflow_stage_id);
    const [
      { count: existingChecklistCount, error: existingChecklistError },
      { count: existingDocumentCount, error: existingDocumentError },
      { data: checklists, error: checklistsError },
      { data: documents, error: documentsError },
    ] = await Promise.all([
      supabase
        .from("project_checklists")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId),
      supabase
        .from("project_documents")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId),
      supabase
        .from("workflow_checklists")
        .select("id, workflow_stage_id, code, label, is_required, gate_severity")
        .in("workflow_stage_id", workflowStageIds),
      supabase
        .from("workflow_required_documents")
        .select("id, workflow_stage_id, code, name, is_required, requires_verification, gate_severity, drive_folder_key")
        .in("workflow_stage_id", workflowStageIds),
    ]);

    if (existingChecklistError) throw existingChecklistError;
    if (existingDocumentError) throw existingDocumentError;
    if (checklistsError) throw checklistsError;
    if (documentsError) throw documentsError;

    const typedChecklists = (checklists || []) as WorkflowChecklistRow[];
    const typedDocuments = (documents || []) as WorkflowDocumentRow[];

    if ((existingChecklistCount || 0) === 0 && typedChecklists.length) {
      const { error: runtimeChecklistError } = await supabase.from("project_checklists").insert(
        typedChecklists.map((checklist) => ({
          project_id: projectId,
          project_stage_id: projectStageByWorkflowStageId.get(checklist.workflow_stage_id)?.id,
          workflow_checklist_id: checklist.id,
          code: checklist.code,
          label: checklist.label,
          is_required: checklist.is_required,
          gate_severity: checklist.gate_severity,
          status: "PENDING",
        })),
      );

      if (runtimeChecklistError) throw runtimeChecklistError;
    }

    if ((existingDocumentCount || 0) === 0 && typedDocuments.length) {
      const { error: runtimeDocumentError } = await supabase.from("project_documents").insert(
        typedDocuments.map((document) => ({
          project_id: projectId,
          project_stage_id: projectStageByWorkflowStageId.get(document.workflow_stage_id)?.id,
          workflow_required_document_id: document.id,
          code: document.code,
          name: document.name,
          is_required: document.is_required,
          requires_verification: document.requires_verification,
          gate_severity: document.gate_severity,
          status: "REQUIRED",
          metadata: { drive_folder_key: document.drive_folder_key },
        })),
      );

      if (runtimeDocumentError) throw runtimeDocumentError;
    }

    return {
      ok: true,
      projectId,
      created: false,
      stageCount: existingStageCount || 0,
      currentStageId: currentProject.current_stage_id || activeRuntimeStage?.id || null,
      workflowVersionId: currentProject.workflow_version_id || "",
      appliedStandardId: currentProject.applied_standard_id || "",
    };
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, project_type, payment_type, workflow_version_id, applied_standard_id, status")
    .eq("id", projectId)
    .single();

  if (projectError || !project) {
    return { ok: false, status: 404, error: "Project was not found." };
  }

  let workflowVersionId = project.workflow_version_id;

  if (!workflowVersionId) {
    const { data: workflowVersion, error: workflowVersionError } = await supabase
      .from("workflow_versions")
      .select("id, workflow_templates!inner(code, project_type, payment_type)")
      .eq("status", "PUBLISHED")
      .eq("is_active", true)
      .eq("workflow_templates.code", "RES-S-STANDARD")
      .limit(1)
      .single();

    const fallbackWorkflowVersion = workflowVersion || (await supabase
      .from("workflow_versions")
      .select("id, workflow_templates!inner(project_type, payment_type)")
      .eq("status", "PUBLISHED")
      .eq("is_active", true)
      .eq("workflow_templates.project_type", project.project_type || "RES-S")
      .eq("workflow_templates.payment_type", project.payment_type || "CASH")
      .limit(1)
      .single()).data;

    if (workflowVersionError && !fallbackWorkflowVersion) {
      return { ok: false, status: 400, error: "No active workflow version matched this project." };
    }

    workflowVersionId = (workflowVersion || fallbackWorkflowVersion).id;
  }

  let appliedStandardId = project.applied_standard_id;

  if (!appliedStandardId) {
    const { data: standard, error: standardError } = await supabase
      .from("installation_standards")
      .select("id")
      .eq("status", "PUBLISHED")
      .eq("is_active", true)
      .eq("code", "V8R2")
      .limit(1)
      .single();

    if (standardError || !standard) {
      return { ok: false, status: 400, error: "No active V8R2 installation standard was found." };
    }

    appliedStandardId = standard.id;
  }

  const { data: workflowStages, error: workflowStagesError } = await supabase
    .from("workflow_stages")
    .select("id, code, name, order_index, owner_role, sla_hours, is_start")
    .eq("workflow_version_id", workflowVersionId)
    .eq("is_active", true)
    .order("order_index", { ascending: true });

  if (workflowStagesError || !workflowStages?.length) {
    return { ok: false, status: 400, error: "Workflow version has no active stages." };
  }

  const typedWorkflowStages = workflowStages as WorkflowStageRow[];
  const activeWorkflowStages = typedWorkflowStages.filter((stage) => !inactiveFinanceStageReason(stage.code, project.payment_type));
  const activeWorkflowStage = inferActiveStage(activeWorkflowStages.length ? activeWorkflowStages : typedWorkflowStages, project.status);
  const now = new Date().toISOString();

  const { data: projectStages, error: projectStagesError } = await supabase
    .from("project_stages")
    .insert(
      typedWorkflowStages.map((stage) => {
        const inactiveFinanceReason = inactiveFinanceStageReason(stage.code, project.payment_type);
        const isCompleted = stage.order_index < activeWorkflowStage.order_index;
        const isActive = stage.id === activeWorkflowStage.id;

        return {
          project_id: projectId,
          workflow_stage_id: stage.id,
          order_index: stage.order_index,
          code: stage.code,
          name: stage.name,
          owner_role: stage.owner_role,
          status: inactiveFinanceReason ? "SKIPPED" : isCompleted ? "COMPLETED" : isActive ? "IN_PROGRESS" : "PENDING",
          sla_status: "ON_TRACK",
          started_at: isActive && !inactiveFinanceReason ? now : null,
          completed_at: isCompleted && !inactiveFinanceReason ? now : null,
          due_at: isActive && !inactiveFinanceReason ? dueAtFromNow(stage.sla_hours) : null,
          metadata: inactiveFinanceReason
            ? {
                backfilled_from_legacy: true,
                skipped_reason: inactiveFinanceReason,
                skipped_source: "INITIAL_FINANCE_PATH",
                payment_type: project.payment_type,
              }
            : { backfilled_from_legacy: true },
        };
      }),
    )
    .select("id, workflow_stage_id, order_index");

  if (projectStagesError) throw projectStagesError;

  const typedProjectStages = projectStages as ProjectStageRuntimeRow[];
  const projectStageByWorkflowStageId = new Map(
    typedProjectStages.map((stage) => [stage.workflow_stage_id, stage]),
  );
  const currentStage = projectStageByWorkflowStageId.get(activeWorkflowStage.id);

  const workflowStageIds = typedWorkflowStages.map((stage) => stage.id);
  const [{ data: checklists, error: checklistsError }, { data: documents, error: documentsError }] =
    await Promise.all([
      supabase
        .from("workflow_checklists")
        .select("id, workflow_stage_id, code, label, is_required, gate_severity")
        .in("workflow_stage_id", workflowStageIds),
      supabase
        .from("workflow_required_documents")
        .select("id, workflow_stage_id, code, name, is_required, requires_verification, gate_severity, drive_folder_key")
        .in("workflow_stage_id", workflowStageIds),
    ]);

  if (checklistsError) throw checklistsError;
  if (documentsError) throw documentsError;

  const typedChecklists = (checklists || []) as WorkflowChecklistRow[];
  const typedDocuments = (documents || []) as WorkflowDocumentRow[];

  if (typedChecklists.length) {
    const { error: runtimeChecklistError } = await supabase.from("project_checklists").insert(
      typedChecklists.map((checklist) => ({
        project_id: projectId,
        project_stage_id: projectStageByWorkflowStageId.get(checklist.workflow_stage_id)?.id,
        workflow_checklist_id: checklist.id,
        code: checklist.code,
        label: checklist.label,
        is_required: checklist.is_required,
        gate_severity: checklist.gate_severity,
        status: "PENDING",
      })),
    );

    if (runtimeChecklistError) throw runtimeChecklistError;
  }

  if (typedDocuments.length) {
    const { error: runtimeDocumentError } = await supabase.from("project_documents").insert(
      typedDocuments.map((document) => ({
        project_id: projectId,
        project_stage_id: projectStageByWorkflowStageId.get(document.workflow_stage_id)?.id,
        workflow_required_document_id: document.id,
        code: document.code,
        name: document.name,
        is_required: document.is_required,
        requires_verification: document.requires_verification,
        gate_severity: document.gate_severity,
        status: "REQUIRED",
        metadata: { drive_folder_key: document.drive_folder_key },
      })),
    );

    if (runtimeDocumentError) throw runtimeDocumentError;
  }

  await Promise.all([
    supabase
      .from("projects")
      .update({
        workflow_version_id: workflowVersionId,
        applied_standard_id: appliedStandardId,
        current_stage_id: currentStage?.id || null,
        status: "IN_PROGRESS",
        sla_status: "ON_TRACK",
      })
      .eq("id", projectId),
    supabase.from("activity_logs").insert({
      project_id: projectId,
      project_stage_id: currentStage?.id || null,
      action: "RUNTIME_WORKFLOW_BACKFILLED",
      before_state: { legacy_status: project.status },
      after_state: {
        workflow_version_id: workflowVersionId,
        applied_standard_id: appliedStandardId,
        current_stage_id: currentStage?.id || null,
        active_stage_code: activeWorkflowStage.code,
      },
    }),
  ]);

  return {
    ok: true,
    projectId,
    created: true,
    stageCount: typedProjectStages.length,
    currentStageId: currentStage?.id || null,
    workflowVersionId,
    appliedStandardId,
  };
}
