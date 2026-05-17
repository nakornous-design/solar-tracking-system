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

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const permission = await authorizeRequest(supabaseAdmin, request, ["admin", "ops"]);
    if (!permission.ok) return permission.response;

    const { stageId } = await context.params;
    const body = await request.json();

    const { data: stage, error: stageError } = await supabaseAdmin
      .from("workflow_stages")
      .select("id, workflow_version_id, workflow_versions!inner(status)")
      .eq("id", stageId)
      .single();
    if (stageError) throw stageError;

    const version = Array.isArray(stage.workflow_versions) ? stage.workflow_versions[0] : stage.workflow_versions;
    if (version?.status !== "DRAFT") {
      return NextResponse.json({ error: "Only draft workflow stages can be edited." }, { status: 409 });
    }

    const updates: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      const name = String(body.name || "").trim();
      if (!name) return NextResponse.json({ error: "name cannot be empty." }, { status: 400 });
      updates.name = name;
    }
    if (Object.prototype.hasOwnProperty.call(body, "ownerRole")) {
      updates.owner_role = body.ownerRole || null;
    }
    if (Object.prototype.hasOwnProperty.call(body, "slaHours")) {
      const slaHours = Number(body.slaHours || 0);
      updates.sla_hours = Math.max(0, Number.isFinite(slaHours) ? Math.round(slaHours) : 0);
    }
    if (Object.prototype.hasOwnProperty.call(body, "isActive")) {
      updates.is_active = Boolean(body.isActive);
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("workflow_stages")
      .update(updates)
      .eq("id", stageId)
      .select("id, code, name, order_index, owner_role, sla_hours, is_start, is_terminal, is_active")
      .single();
    if (error) throw error;

    await writeAuditLog(supabaseAdmin, {
      actorId: permission.userId,
      action: "WORKFLOW_STAGE_UPDATED",
      relatedEntityType: "workflow_stages",
      relatedEntityId: stageId,
      beforeState: { id: stageId },
      afterState: data,
      metadata: { changed_fields: Object.keys(updates) },
    });

    return NextResponse.json({ stage: data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Update workflow stage API Error:", message);
    return NextResponse.json({ error: `Update workflow stage failed: ${message}` }, { status: 500 });
  }
}
