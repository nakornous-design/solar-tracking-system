import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { transitionExceptionStatus } from "../../../../services/workflow/exceptionEngine";
import { authorizeRequest } from "@/lib/api-permissions";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ exceptionId: string }> },
) {
  try {
    const permission = await authorizeRequest(supabaseAdmin, request, ["admin", "supervisor", "ops", "qa", "finance", "engineer", "rcm", "sbc"]);
    if (!permission.ok) return permission.response;

    const { exceptionId } = await params;
    const { status, resolutionNotes } = await request.json();

    if (!status) {
      return NextResponse.json({ error: "status is required." }, { status: 400 });
    }

    const result = await transitionExceptionStatus(
      supabaseAdmin,
      exceptionId,
      status,
      resolutionNotes,
      permission.userId,
    );

    if (!result.ok) {
      return NextResponse.json(result, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Exception lifecycle API Error:", message);
    return NextResponse.json({ error: `Exception update failed: ${message}` }, { status: 500 });
  }
}
