type SupabaseClientLike = {
  from: (table: string) => any;
};

export type GateViolation = {
  type: "CHECKLIST" | "DOCUMENT";
  severity: "HARD" | "OVERRIDEABLE";
  id: string;
  code: string;
  label: string;
  status: string;
};

export type GateValidationResult = {
  passed: boolean;
  violations: GateViolation[];
};

export async function validateStageGates(
  supabase: SupabaseClientLike,
  projectStageId: string,
): Promise<GateValidationResult> {
  const [{ data: checklists, error: checklistsError }, { data: documents, error: documentsError }] =
    await Promise.all([
      supabase
        .from("project_checklists")
        .select("id, code, label, status, gate_severity, is_required")
        .eq("project_stage_id", projectStageId)
        .eq("is_required", true)
        .in("gate_severity", ["HARD", "OVERRIDEABLE"]),
      supabase
        .from("project_documents")
        .select("id, code, name, status, gate_severity, is_required, requires_verification")
        .eq("project_stage_id", projectStageId)
        .eq("is_required", true)
        .in("gate_severity", ["HARD", "OVERRIDEABLE"]),
    ]);

  if (checklistsError) throw checklistsError;
  if (documentsError) throw documentsError;

  const { data: projectStage, error: projectStageError } = await supabase
    .from("project_stages")
    .select("project_id")
    .eq("id", projectStageId)
    .single();

  if (projectStageError) throw projectStageError;

  const { data: approvedOverrides, error: approvedOverridesError } = await supabase
    .from("approval_requests")
    .select("id")
    .eq("project_id", projectStage.project_id)
    .eq("project_stage_id", projectStageId)
    .eq("type", "GATE_OVERRIDE")
    .eq("status", "APPROVED")
    .limit(1);

  if (approvedOverridesError) throw approvedOverridesError;

  const hasApprovedOverride = Boolean(approvedOverrides?.length);

  const checklistViolations =
    checklists
      ?.filter((item: any) => item.status !== "PASSED" && item.status !== "WAIVED")
      .map((item: any) => ({
        type: "CHECKLIST" as const,
        severity: item.gate_severity,
        id: item.id,
        code: item.code,
        label: item.label,
        status: item.status,
      })) || [];

  const documentViolations =
    documents
      ?.filter((item: any) => {
        if (item.requires_verification) return item.status !== "VERIFIED";
        return item.status === "REQUIRED" || item.status === "REJECTED";
      })
      .map((item: any) => ({
        type: "DOCUMENT" as const,
        severity: item.gate_severity,
        id: item.id,
        code: item.code,
        label: item.name,
        status: item.status,
      })) || [];

  const violations = [...checklistViolations, ...documentViolations].filter(
    (violation) => violation.severity !== "OVERRIDEABLE" || !hasApprovedOverride,
  );

  return {
    passed: violations.length === 0,
    violations,
  };
}
