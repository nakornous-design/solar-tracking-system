import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeRequest } from "@/lib/api-permissions";
import { writeAuditLog } from "@/lib/audit-log";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type RouteContext = {
  params: Promise<{ transitionId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const permission = await authorizeRequest(supabaseAdmin, request, ["admin", "ops"]);
    if (!permission.ok) return permission.response;

    const { transitionId } = await context.params;
    const { data: transition, error: transitionError } = await supabaseAdmin
      .from("workflow_transitions")
      .select("id, workflow_versions!inner(status)")
      .eq("id", transitionId)
      .single();
    if (transitionError) throw transitionError;
    const version = Array.isArray(transition.workflow_versions) ? transition.workflow_versions[0] : transition.workflow_versions;
    if (version?.status !== "DRAFT") {
      return NextResponse.json({ error: "Only draft workflow transitions can be edited." }, { status: 409 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(body, "toStageId")) updates.to_stage_id = body.toStageId || null;
    if (Object.prototype.hasOwnProperty.call(body, "type")) updates.type = body.type || "FORWARD";
    if (Object.prototype.hasOwnProperty.call(body, "name")) updates.name = body.name || null;
    if (Object.prototype.hasOwnProperty.call(body, "requiresApproval")) updates.requires_approval = Boolean(body.requiresApproval);
    if (Object.prototype.hasOwnProperty.call(body, "gateSeverity")) updates.gate_severity = body.gateSeverity || "HARD";
    if (Object.prototype.hasOwnProperty.call(body, "isActive")) updates.is_active = Boolean(body.isActive);

    const { data, error } = await supabaseAdmin
      .from("workflow_transitions")
      .update(updates)
      .eq("id", transitionId)
      .select("id, workflow_version_id, from_stage_id, to_stage_id, type, name, requires_approval, gate_severity, is_active")
      .single();
    if (error) throw error;

    await writeAuditLog(supabaseAdmin, {
      actorId: permission.userId,
      action: "WORKFLOW_TRANSITION_UPDATED",
      relatedEntityType: "workflow_transitions",
      relatedEntityId: transitionId,
      beforeState: { id: transitionId },
      afterState: data,
      metadata: { changed_fields: Object.keys(updates) },
    });

    return NextResponse.json({ transition: data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Update workflow transition API Error:", message);
    return NextResponse.json({ error: `Update workflow transition failed: ${message}` }, { status: 500 });
  }
}
