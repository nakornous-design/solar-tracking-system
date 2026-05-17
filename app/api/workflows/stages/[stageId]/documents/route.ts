import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeRequest } from "@/lib/api-permissions";
import { writeAuditLog } from "@/lib/audit-log";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type RouteContext = {
  params: Promise<{ stageId: string }>;
};

async function ensureDraftStage(stageId: string) {
  const { data, error } = await supabaseAdmin
    .from("workflow_stages")
    .select("id, workflow_versions!inner(status)")
    .eq("id", stageId)
    .single();
  if (error) throw error;
  const version = Array.isArray(data.workflow_versions) ? data.workflow_versions[0] : data.workflow_versions;
  return version?.status === "DRAFT";
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const permission = await authorizeRequest(supabaseAdmin, request, ["admin", "ops"]);
    if (!permission.ok) return permission.response;

    const { stageId } = await context.params;
    if (!(await ensureDraftStage(stageId))) {
      return NextResponse.json({ error: "Only draft workflow stages can be edited." }, { status: 409 });
    }

    const body = await request.json();
    const code = String(body.code || "").trim().toUpperCase().replace(/\s+/g, "_");
    const name = String(body.name || "").trim();
    if (!code || !name) {
      return NextResponse.json({ error: "code and name are required." }, { status: 400 });
    }

    const { data: lastItem } = await supabaseAdmin
      .from("workflow_required_documents")
      .select("order_index")
      .eq("workflow_stage_id", stageId)
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabaseAdmin
      .from("workflow_required_documents")
      .insert({
        workflow_stage_id: stageId,
        code,
        name,
        description: body.description || null,
        drive_folder_key: body.driveFolderKey || null,
        is_required: body.isRequired ?? true,
        requires_verification: body.requiresVerification ?? true,
        gate_severity: body.gateSeverity || "HARD",
        order_index: Number(lastItem?.order_index || 0) + 1,
        metadata: body.metadata || {},
      })
      .select("id, workflow_stage_id, code, name, gate_severity, is_required, requires_verification, order_index")
      .single();
    if (error) throw error;

    await writeAuditLog(supabaseAdmin, {
      actorId: permission.userId,
      action: "WORKFLOW_REQUIRED_DOCUMENT_CREATED",
      relatedEntityType: "workflow_required_documents",
      relatedEntityId: data.id,
      afterState: data,
      metadata: { workflow_stage_id: stageId, code: data.code },
    });

    return NextResponse.json({ document: data }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Create workflow document API Error:", message);
    return NextResponse.json({ error: `Create workflow document failed: ${message}` }, { status: 500 });
  }
}
