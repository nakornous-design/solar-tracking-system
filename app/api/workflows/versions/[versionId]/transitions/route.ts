import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeRequest } from "@/lib/api-permissions";
import { writeAuditLog } from "@/lib/audit-log";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type RouteContext = {
  params: Promise<{ versionId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const permission = await authorizeRequest(supabaseAdmin, request, ["admin", "ops"]);
    if (!permission.ok) return permission.response;

    const { versionId } = await context.params;
    const body = await request.json();
    const fromStageId = body.fromStageId || null;
    const toStageId = body.toStageId || null;
    const type = body.type || "FORWARD";

    if (!toStageId || !type) {
      return NextResponse.json({ error: "toStageId and type are required." }, { status: 400 });
    }

    const { data: version, error: versionError } = await supabaseAdmin
      .from("workflow_versions")
      .select("id, status")
      .eq("id", versionId)
      .single();
    if (versionError) throw versionError;
    if (version?.status !== "DRAFT") {
      return NextResponse.json({ error: "Only draft workflow versions can be edited." }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin
      .from("workflow_transitions")
      .insert({
        workflow_version_id: versionId,
        from_stage_id: fromStageId,
        to_stage_id: toStageId,
        type,
        name: body.name || `${type} transition`,
        requires_approval: body.requiresApproval ?? false,
        gate_severity: body.gateSeverity || "HARD",
        rule_config: body.ruleConfig || {},
        is_active: body.isActive ?? true,
      })
      .select("id, workflow_version_id, from_stage_id, to_stage_id, type, name, requires_approval, gate_severity, is_active")
      .single();
    if (error) throw error;

    await writeAuditLog(supabaseAdmin, {
      actorId: permission.userId,
      action: "WORKFLOW_TRANSITION_CREATED",
      relatedEntityType: "workflow_transitions",
      relatedEntityId: data.id,
      afterState: data,
      metadata: { workflow_version_id: versionId, type: data.type },
    });

    return NextResponse.json({ transition: data }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Create workflow transition API Error:", message);
    return NextResponse.json({ error: `Create workflow transition failed: ${message}` }, { status: 500 });
  }
}
