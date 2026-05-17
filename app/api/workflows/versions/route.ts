import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeRequest } from "@/lib/api-permissions";
import { writeAuditLog } from "@/lib/audit-log";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(request: Request) {
  try {
    const permission = await authorizeRequest(supabaseAdmin, request, ["admin", "ops"]);
    if (!permission.ok) return permission.response;

    const body = await request.json();
    const sourceVersionId = String(body.sourceVersionId || "");
    if (!sourceVersionId) {
      return NextResponse.json({ error: "sourceVersionId is required." }, { status: 400 });
    }

    const { data: sourceVersion, error: sourceError } = await supabaseAdmin
      .from("workflow_versions")
      .select("id, workflow_template_id, version_number, name")
      .eq("id", sourceVersionId)
      .single();
    if (sourceError) throw sourceError;

    const { data: latestVersion } = await supabaseAdmin
      .from("workflow_versions")
      .select("version_number")
      .eq("workflow_template_id", sourceVersion.workflow_template_id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersionNumber = Number(latestVersion?.version_number || sourceVersion.version_number || 0) + 1;
    const { data: draftVersion, error: draftError } = await supabaseAdmin
      .from("workflow_versions")
      .insert({
        workflow_template_id: sourceVersion.workflow_template_id,
        version_number: nextVersionNumber,
        name: body.name || `${sourceVersion.name} Draft V${nextVersionNumber}`,
        status: "DRAFT",
        is_active: false,
      })
      .select("id, workflow_template_id, version_number, name, status, is_active, published_at")
      .single();
    if (draftError) throw draftError;

    const { data: sourceStages, error: stagesError } = await supabaseAdmin
      .from("workflow_stages")
      .select("id, code, name, order_index, owner_role, sla_hours, is_start, is_terminal, is_active, metadata")
      .eq("workflow_version_id", sourceVersionId)
      .order("order_index", { ascending: true });
    if (stagesError) throw stagesError;

    const { data: newStages, error: insertStagesError } = await supabaseAdmin
      .from("workflow_stages")
      .insert((sourceStages || []).map((stage) => ({
        workflow_version_id: draftVersion.id,
        code: stage.code,
        name: stage.name,
        order_index: stage.order_index,
        owner_role: stage.owner_role,
        sla_hours: stage.sla_hours,
        is_start: stage.is_start,
        is_terminal: stage.is_terminal,
        is_active: stage.is_active,
        metadata: stage.metadata || {},
      })))
      .select("id, code");
    if (insertStagesError) throw insertStagesError;

    const stageIdMap = new Map<string, string>();
    for (const sourceStage of sourceStages || []) {
      const created = (newStages || []).find((stage) => stage.code === sourceStage.code);
      if (created) stageIdMap.set(sourceStage.id, created.id);
    }

    const [{ data: checklists, error: checklistError }, { data: documents, error: documentError }, { data: transitions, error: transitionError }] = await Promise.all([
      supabaseAdmin.from("workflow_checklists").select("*").in("workflow_stage_id", [...stageIdMap.keys()]),
      supabaseAdmin.from("workflow_required_documents").select("*").in("workflow_stage_id", [...stageIdMap.keys()]),
      supabaseAdmin.from("workflow_transitions").select("*").eq("workflow_version_id", sourceVersionId),
    ]);
    if (checklistError) throw checklistError;
    if (documentError) throw documentError;
    if (transitionError) throw transitionError;

    if (checklists?.length) {
      const { error } = await supabaseAdmin.from("workflow_checklists").insert(checklists.map((item) => ({
        workflow_stage_id: stageIdMap.get(item.workflow_stage_id),
        code: item.code,
        label: item.label,
        description: item.description,
        is_required: item.is_required,
        gate_severity: item.gate_severity,
        order_index: item.order_index,
        metadata: item.metadata || {},
      })));
      if (error) throw error;
    }

    if (documents?.length) {
      const { error } = await supabaseAdmin.from("workflow_required_documents").insert(documents.map((item) => ({
        workflow_stage_id: stageIdMap.get(item.workflow_stage_id),
        code: item.code,
        name: item.name,
        description: item.description,
        drive_folder_key: item.drive_folder_key,
        is_required: item.is_required,
        requires_verification: item.requires_verification,
        gate_severity: item.gate_severity,
        order_index: item.order_index,
        metadata: item.metadata || {},
      })));
      if (error) throw error;
    }

    if (transitions?.length) {
      const { error } = await supabaseAdmin.from("workflow_transitions").insert(transitions.map((item) => ({
        workflow_version_id: draftVersion.id,
        from_stage_id: item.from_stage_id ? stageIdMap.get(item.from_stage_id) : null,
        to_stage_id: item.to_stage_id ? stageIdMap.get(item.to_stage_id) : null,
        type: item.type,
        name: item.name,
        requires_approval: item.requires_approval,
        gate_severity: item.gate_severity,
        rule_config: item.rule_config || {},
        is_active: item.is_active,
      })));
      if (error) throw error;
    }

    await writeAuditLog(supabaseAdmin, {
      actorId: permission.userId,
      action: "WORKFLOW_DRAFT_CREATED",
      relatedEntityType: "workflow_versions",
      relatedEntityId: draftVersion.id,
      beforeState: { source_version_id: sourceVersionId },
      afterState: draftVersion,
      metadata: {
        source_version_id: sourceVersionId,
        stage_count: newStages?.length || 0,
        checklist_count: checklists?.length || 0,
        document_count: documents?.length || 0,
        transition_count: transitions?.length || 0,
      },
    });

    return NextResponse.json({ version: draftVersion }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Create workflow draft API Error:", message);
    return NextResponse.json({ error: `Create workflow draft failed: ${message}` }, { status: 500 });
  }
}
