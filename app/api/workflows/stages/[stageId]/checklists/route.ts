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
    const label = String(body.label || "").trim();
    if (!code || !label) {
      return NextResponse.json({ error: "code and label are required." }, { status: 400 });
    }

    const { data: lastItem } = await supabaseAdmin
      .from("workflow_checklists")
      .select("order_index")
      .eq("workflow_stage_id", stageId)
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabaseAdmin
      .from("workflow_checklists")
      .insert({
        workflow_stage_id: stageId,
        code,
        label,
        description: body.description || null,
        is_required: body.isRequired ?? true,
        gate_severity: body.gateSeverity || "HARD",
        order_index: Number(lastItem?.order_index || 0) + 1,
        metadata: body.metadata || {},
      })
      .select("id, workflow_stage_id, code, label, gate_severity, is_required, order_index")
      .single();
    if (error) throw error;

    await writeAuditLog(supabaseAdmin, {
      actorId: permission.userId,
      action: "WORKFLOW_CHECKLIST_CREATED",
      relatedEntityType: "workflow_checklists",
      relatedEntityId: data.id,
      afterState: data,
      metadata: { workflow_stage_id: stageId, code: data.code },
    });

    return NextResponse.json({ checklist: data }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Create workflow checklist API Error:", message);
    return NextResponse.json({ error: `Create workflow checklist failed: ${message}` }, { status: 500 });
  }
}
