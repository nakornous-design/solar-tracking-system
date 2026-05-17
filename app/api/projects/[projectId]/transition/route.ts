import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { transitionStageForward } from "../../../../../services/workflow/transitionEngine";
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
    const permission = await authorizeRequest(supabaseAdmin, request, ["admin", "supervisor", "ops", "sales", "engineer", "finance", "qa", "contractor", "rcm", "sbc"]);
    if (!permission.ok) return permission.response;

    const { projectId } = await params;
    const { projectStageId, type = "FORWARD" } = await request.json();

    if (!projectStageId) {
      return NextResponse.json({ error: "projectStageId is required." }, { status: 400 });
    }

    if (type !== "FORWARD") {
      return NextResponse.json({ error: "Only FORWARD transitions are implemented in this MVP step." }, { status: 400 });
    }

    const result = await transitionStageForward(supabaseAdmin, projectId, projectStageId, permission.userId, permission.roles);

    if (!result.ok) {
      return NextResponse.json(result, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Transition API Error:", message);
    return NextResponse.json({ error: `Transition failed: ${message}` }, { status: 500 });
  }
}
