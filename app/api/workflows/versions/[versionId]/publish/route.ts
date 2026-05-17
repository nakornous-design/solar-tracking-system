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
    const { data: version, error: versionError } = await supabaseAdmin
      .from("workflow_versions")
      .select("id, workflow_template_id, status")
      .eq("id", versionId)
      .single();
    if (versionError) throw versionError;

    if (version.status !== "DRAFT") {
      return NextResponse.json({ error: "Only draft workflow versions can be published." }, { status: 409 });
    }

    const { data: activeStages, error: activeStagesError } = await supabaseAdmin
      .from("workflow_stages")
      .select("id, name, code, is_start, is_terminal")
      .eq("workflow_version_id", versionId)
      .eq("is_active", true);
    if (activeStagesError) throw activeStagesError;
    if (!activeStages?.length) {
      return NextResponse.json({ error: "Workflow version must contain at least one active stage." }, { status: 400 });
    }

    const startStages = activeStages.filter((stage) => stage.is_start);
    if (startStages.length !== 1) {
      return NextResponse.json({ error: "Workflow version must contain exactly one start stage." }, { status: 400 });
    }

    const activeStageIds = new Set(activeStages.map((stage) => stage.id));
    const { data: activeTransitions, error: transitionError } = await supabaseAdmin
      .from("workflow_transitions")
      .select("id, from_stage_id, to_stage_id, type, is_active")
      .eq("workflow_version_id", versionId)
      .eq("is_active", true);
    if (transitionError) throw transitionError;

    const missingForwardStages = activeStages.filter((stage) => {
      if (stage.is_terminal) return false;
      return !(activeTransitions || []).some((transition) =>
        transition.type === "FORWARD"
        && transition.from_stage_id === stage.id
        && transition.to_stage_id
        && activeStageIds.has(transition.to_stage_id),
      );
    });

    if (missingForwardStages.length) {
      return NextResponse.json({
        error: `Every non-terminal active stage needs an active FORWARD transition. Missing: ${missingForwardStages.map((stage) => stage.code || stage.name).join(", ")}`,
      }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { error: deactivateError } = await supabaseAdmin
      .from("workflow_versions")
      .update({ is_active: false, updated_at: now })
      .eq("workflow_template_id", version.workflow_template_id)
      .eq("is_active", true);
    if (deactivateError) throw deactivateError;

    const { data: published, error: publishError } = await supabaseAdmin
      .from("workflow_versions")
      .update({
        status: "PUBLISHED",
        is_active: true,
        published_at: now,
        published_by: permission.userId || null,
        updated_at: now,
      })
      .eq("id", versionId)
      .select("id, workflow_template_id, version_number, name, status, is_active, published_at")
      .single();
    if (publishError) throw publishError;

    await writeAuditLog(supabaseAdmin, {
      actorId: permission.userId,
      action: "WORKFLOW_VERSION_PUBLISHED",
      relatedEntityType: "workflow_versions",
      relatedEntityId: versionId,
      beforeState: { status: version.status, is_active: false },
      afterState: published,
      metadata: {
        workflow_template_id: version.workflow_template_id,
        stage_count: activeStages.length,
        transition_count: activeTransitions?.length || 0,
      },
    });

    return NextResponse.json({ version: published });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Publish workflow version API Error:", message);
    return NextResponse.json({ error: `Publish workflow version failed: ${message}` }, { status: 500 });
  }
}
