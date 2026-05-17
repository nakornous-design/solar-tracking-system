import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { submitBillingDecision } from "../../../../../services/workflow/billingEngine";
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
    const permission = await authorizeRequest(supabaseAdmin, request, ["admin", "supervisor", "finance", "ops", "rcm", "sbc"]);
    if (!permission.ok) return permission.response;

    const { projectId } = await params;
    const { projectStageId, decision, reason, evidence = [] } = await request.json();

    if (!projectStageId) {
      return NextResponse.json({ error: "projectStageId is required." }, { status: 400 });
    }

    if (!decision || !["APPROVE", "REJECT"].includes(decision)) {
      return NextResponse.json({ error: "decision must be APPROVE or REJECT." }, { status: 400 });
    }

    const result = await submitBillingDecision(
      supabaseAdmin,
      projectId,
      projectStageId,
      decision,
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
    console.error("Billing API Error:", message);
    return NextResponse.json({ error: `Billing decision failed: ${message}` }, { status: 500 });
  }
}
