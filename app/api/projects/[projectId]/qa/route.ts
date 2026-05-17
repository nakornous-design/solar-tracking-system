import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { submitQaOutcome } from "../../../../../services/workflow/qaEngine";
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
    const permission = await authorizeRequest(supabaseAdmin, request, ["admin", "supervisor", "qa", "ops", "sbc"]);
    if (!permission.ok) return permission.response;

    const { projectId } = await params;
    const { projectStageId, outcome, reason, evidence = [] } = await request.json();

    if (!projectStageId) {
      return NextResponse.json({ error: "projectStageId is required." }, { status: 400 });
    }

    if (!outcome || !["PASS", "FAIL", "REWORK"].includes(outcome)) {
      return NextResponse.json({ error: "outcome must be PASS, FAIL, or REWORK." }, { status: 400 });
    }

    const result = await submitQaOutcome(
      supabaseAdmin,
      projectId,
      projectStageId,
      outcome,
      reason,
      evidence,
      permission.userId,
    );

    if (!result.ok) {
      return NextResponse.json(result, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("QA API Error:", message);
    return NextResponse.json({ error: `QA submission failed: ${message}` }, { status: 500 });
  }
}
