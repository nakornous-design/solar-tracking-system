import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeRequest } from "@/lib/api-permissions";
import { switchFinancePath } from "@/services/workflow/financePathEngine";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const permission = await authorizeRequest(supabaseAdmin, request, ["admin", "supervisor", "sales", "finance", "ops", "rcm", "sbc"]);
    if (!permission.ok) return permission.response;

    const { projectId } = await params;
    const { action, reason, projectStageId } = await request.json();
    const result = await switchFinancePath(supabaseAdmin, projectId, action, reason, permission.userId, projectStageId);

    if (!result.ok) {
      return NextResponse.json(result, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Finance path API Error:", message);
    return NextResponse.json({ error: `Finance path change failed: ${message}` }, { status: 500 });
  }
}
