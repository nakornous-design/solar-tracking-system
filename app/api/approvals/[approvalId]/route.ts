import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decideApprovalRequest } from "../../../../services/workflow/approvalEngine";
import { authorizeRequest } from "@/lib/api-permissions";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ approvalId: string }> },
) {
  try {
    const permission = await authorizeRequest(supabaseAdmin, request, ["admin", "supervisor", "exec"]);
    if (!permission.ok) return permission.response;

    const { approvalId } = await params;
    const { decision, decisionReason } = await request.json();

    if (!decision || !["APPROVED", "REJECTED", "CANCELLED"].includes(decision)) {
      return NextResponse.json({ error: "decision must be APPROVED, REJECTED, or CANCELLED." }, { status: 400 });
    }

    const result = await decideApprovalRequest(
      supabaseAdmin,
      approvalId,
      decision,
      decisionReason,
      permission.userId,
    );

    if (!result.ok) {
      return NextResponse.json(result, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Approval decision API Error:", message);
    return NextResponse.json({ error: `Approval decision failed: ${message}` }, { status: 500 });
  }
}
