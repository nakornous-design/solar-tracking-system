import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeRequest } from "@/lib/api-permissions";
import { writeAuditLog } from "@/lib/audit-log";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type RouteContext = {
  params: Promise<{ checklistId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const permission = await authorizeRequest(supabaseAdmin, request, ["admin", "ops"]);
    if (!permission.ok) return permission.response;

    const { checklistId } = await context.params;
    const { data: item, error: itemError } = await supabaseAdmin
      .from("workflow_checklists")
      .select("id, workflow_stages!inner(workflow_versions!inner(status))")
      .eq("id", checklistId)
      .single();
    if (itemError) throw itemError;
    const stage = Array.isArray(item.workflow_stages) ? item.workflow_stages[0] : item.workflow_stages;
    const version = Array.isArray(stage.workflow_versions) ? stage.workflow_versions[0] : stage.workflow_versions;
    if (version?.status !== "DRAFT") {
      return NextResponse.json({ error: "Only draft workflow checklist items can be edited." }, { status: 409 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(body, "label")) {
      const label = String(body.label || "").trim();
      if (!label) return NextResponse.json({ error: "label cannot be empty." }, { status: 400 });
      updates.label = label;
    }
    if (Object.prototype.hasOwnProperty.call(body, "gateSeverity")) updates.gate_severity = body.gateSeverity || "HARD";
    if (Object.prototype.hasOwnProperty.call(body, "isRequired")) updates.is_required = Boolean(body.isRequired);

    const { data, error } = await supabaseAdmin
      .from("workflow_checklists")
      .update(updates)
      .eq("id", checklistId)
      .select("id, workflow_stage_id, code, label, gate_severity, is_required, order_index")
      .single();
    if (error) throw error;

    await writeAuditLog(supabaseAdmin, {
      actorId: permission.userId,
      action: "WORKFLOW_CHECKLIST_UPDATED",
      relatedEntityType: "workflow_checklists",
      relatedEntityId: checklistId,
      beforeState: { id: checklistId },
      afterState: data,
      metadata: { changed_fields: Object.keys(updates) },
    });

    return NextResponse.json({ checklist: data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Update workflow checklist API Error:", message);
    return NextResponse.json({ error: `Update workflow checklist failed: ${message}` }, { status: 500 });
  }
}
