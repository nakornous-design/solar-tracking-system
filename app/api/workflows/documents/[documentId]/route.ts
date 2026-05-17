import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeRequest } from "@/lib/api-permissions";
import { writeAuditLog } from "@/lib/audit-log";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type RouteContext = {
  params: Promise<{ documentId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const permission = await authorizeRequest(supabaseAdmin, request, ["admin", "ops"]);
    if (!permission.ok) return permission.response;

    const { documentId } = await context.params;
    const { data: item, error: itemError } = await supabaseAdmin
      .from("workflow_required_documents")
      .select("id, workflow_stages!inner(workflow_versions!inner(status))")
      .eq("id", documentId)
      .single();
    if (itemError) throw itemError;
    const stage = Array.isArray(item.workflow_stages) ? item.workflow_stages[0] : item.workflow_stages;
    const version = Array.isArray(stage.workflow_versions) ? stage.workflow_versions[0] : stage.workflow_versions;
    if (version?.status !== "DRAFT") {
      return NextResponse.json({ error: "Only draft workflow documents can be edited." }, { status: 409 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      const name = String(body.name || "").trim();
      if (!name) return NextResponse.json({ error: "name cannot be empty." }, { status: 400 });
      updates.name = name;
    }
    if (Object.prototype.hasOwnProperty.call(body, "gateSeverity")) updates.gate_severity = body.gateSeverity || "HARD";
    if (Object.prototype.hasOwnProperty.call(body, "isRequired")) updates.is_required = Boolean(body.isRequired);
    if (Object.prototype.hasOwnProperty.call(body, "requiresVerification")) updates.requires_verification = Boolean(body.requiresVerification);
    if (Object.prototype.hasOwnProperty.call(body, "driveFolderKey")) updates.drive_folder_key = body.driveFolderKey || null;

    const { data, error } = await supabaseAdmin
      .from("workflow_required_documents")
      .update(updates)
      .eq("id", documentId)
      .select("id, workflow_stage_id, code, name, gate_severity, is_required, requires_verification, drive_folder_key, order_index")
      .single();
    if (error) throw error;

    await writeAuditLog(supabaseAdmin, {
      actorId: permission.userId,
      action: "WORKFLOW_REQUIRED_DOCUMENT_UPDATED",
      relatedEntityType: "workflow_required_documents",
      relatedEntityId: documentId,
      beforeState: { id: documentId },
      afterState: data,
      metadata: { changed_fields: Object.keys(updates) },
    });

    return NextResponse.json({ document: data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Update workflow document API Error:", message);
    return NextResponse.json({ error: `Update workflow document failed: ${message}` }, { status: 500 });
  }
}
