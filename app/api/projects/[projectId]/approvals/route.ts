import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createGateOverrideRequest } from "../../../../../services/workflow/approvalEngine";
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
    const permission = await authorizeRequest(supabaseAdmin, request, ["admin", "supervisor", "ops", "sales", "finance", "qa", "rcm", "sbc"]);
    if (!permission.ok) return permission.response;

    const { projectId } = await params;
    const { projectStageId, reason, evidence = [] } = await request.json();

    if (!projectStageId) {
      return NextResponse.json({ error: "projectStageId is required." }, { status: 400 });
    }

    const result = await createGateOverrideRequest(
      supabaseAdmin,
      projectId,
      projectStageId,
      reason,
      evidence,
      permission.userId,
    );

    if (!result.ok) {
      return NextResponse.json(result, { status: result.status });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Approval create API Error:", message);
    return NextResponse.json({ error: `Approval request failed: ${message}` }, { status: 500 });
  }
}
