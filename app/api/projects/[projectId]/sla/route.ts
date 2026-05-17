import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pauseStageSla, refreshProjectSla, resumeStageSla } from "../../../../../services/workflow/slaEngine";
import { authorizeRequest } from "@/lib/api-permissions";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const permission = await authorizeRequest(supabaseAdmin, request, ["admin", "supervisor", "ops", "sbc"]);
    if (!permission.ok) return permission.response;

    const { projectId } = await params;
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const action = body.action || "REFRESH";
    const result = action === "PAUSE"
      ? await pauseStageSla(supabaseAdmin, projectId, body.projectStageId, body.reason, permission.userId)
      : action === "RESUME"
        ? await resumeStageSla(supabaseAdmin, projectId, body.projectStageId, permission.userId)
        : await refreshProjectSla(supabaseAdmin, projectId);

    if (!result.ok) {
      return NextResponse.json(result, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("SLA refresh API Error:", message);
    return NextResponse.json({ error: `SLA refresh failed: ${message}` }, { status: 500 });
  }
}
