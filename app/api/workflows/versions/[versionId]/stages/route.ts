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

async function requireDraftVersion(versionId: string) {
  const { data, error } = await supabaseAdmin
    .from("workflow_versions")
    .select("id, status")
    .eq("id", versionId)
    .single();
  if (error) throw error;
  return data?.status === "DRAFT";
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const permission = await authorizeRequest(supabaseAdmin, request, ["admin", "ops"]);
    if (!permission.ok) return permission.response;

    const { versionId } = await context.params;
    const isDraft = await requireDraftVersion(versionId);
    if (!isDraft) {
      return NextResponse.json({ error: "Only draft workflow versions can be edited." }, { status: 409 });
    }

    const body = await request.json();
    const code = String(body.code || "").trim().toUpperCase().replace(/\s+/g, "_");
    const name = String(body.name || "").trim();
    if (!code || !name) {
      return NextResponse.json({ error: "code and name are required." }, { status: 400 });
    }

    const { data: lastStage, error: lastStageError } = await supabaseAdmin
      .from("workflow_stages")
      .select("order_index")
      .eq("workflow_version_id", versionId)
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastStageError) throw lastStageError;

    const slaHours = Number(body.slaHours || 0);
    const { data, error } = await supabaseAdmin
      .from("workflow_stages")
      .insert({
        workflow_version_id: versionId,
        code,
        name,
        order_index: Number(lastStage?.order_index || 0) + 1,
        owner_role: body.ownerRole || null,
        sla_hours: Math.max(0, Number.isFinite(slaHours) ? Math.round(slaHours) : 0),
        is_start: false,
        is_terminal: false,
        is_active: body.isActive ?? true,
        metadata: body.metadata || {},
      })
      .select("id, code, name, order_index, owner_role, sla_hours, is_start, is_terminal, is_active")
      .single();
    if (error) throw error;

    await writeAuditLog(supabaseAdmin, {
      actorId: permission.userId,
      action: "WORKFLOW_STAGE_CREATED",
      relatedEntityType: "workflow_stages",
      relatedEntityId: data.id,
      afterState: data,
      metadata: { workflow_version_id: versionId, code: data.code },
    });

    return NextResponse.json({ stage: data }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Create workflow stage API Error:", message);
    return NextResponse.json({ error: `Create workflow stage failed: ${message}` }, { status: 500 });
  }
}
