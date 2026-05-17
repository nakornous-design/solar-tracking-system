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
    const orderedStageIds: string[] = Array.isArray(body.orderedStageIds) ? body.orderedStageIds.map(String).filter(Boolean) : [];
    if (!orderedStageIds.length) {
      return NextResponse.json({ error: "orderedStageIds is required." }, { status: 400 });
    }

    const { data: version, error: versionError } = await supabaseAdmin
      .from("workflow_versions")
      .select("id, status")
      .eq("id", versionId)
      .single();
    if (versionError) throw versionError;
    if (version?.status !== "DRAFT") {
      return NextResponse.json({ error: "Only draft workflow versions can be reordered." }, { status: 409 });
    }

    const { data: stages, error: stagesError } = await supabaseAdmin
      .from("workflow_stages")
      .select("id, order_index")
      .eq("workflow_version_id", versionId);
    if (stagesError) throw stagesError;

    const stageIds = new Set((stages || []).map((stage) => stage.id));
    if (orderedStageIds.length !== stageIds.size || orderedStageIds.some((id) => !stageIds.has(id))) {
      return NextResponse.json({ error: "orderedStageIds must include every stage in this draft version." }, { status: 400 });
    }

    // Avoid unique(workflow_version_id, order_index) collisions while moving positions.
    await Promise.all(
      orderedStageIds.map((stageId, index) =>
        supabaseAdmin.from("workflow_stages").update({ order_index: -(index + 1) }).eq("id", stageId),
      ),
    );
    await Promise.all(
      orderedStageIds.map((stageId, index) =>
        supabaseAdmin.from("workflow_stages").update({ order_index: index + 1 }).eq("id", stageId),
      ),
    );

    await writeAuditLog(supabaseAdmin, {
      actorId: permission.userId,
      action: "WORKFLOW_STAGES_REORDERED",
      relatedEntityType: "workflow_versions",
      relatedEntityId: versionId,
      beforeState: { stages },
      afterState: { ordered_stage_ids: orderedStageIds },
      metadata: { count: orderedStageIds.length },
    });

    return NextResponse.json({ reordered: orderedStageIds.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Reorder workflow stages API Error:", message);
    return NextResponse.json({ error: `Reorder workflow stages failed: ${message}` }, { status: 500 });
  }
}
