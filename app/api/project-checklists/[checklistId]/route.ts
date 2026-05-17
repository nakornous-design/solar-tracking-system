import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeRequest } from "@/lib/api-permissions";
import { updateProjectChecklist } from "@/services/workflow/checklistEngine";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ checklistId: string }> },
) {
  try {
    const permission = await authorizeRequest(supabaseAdmin, request, [
      "admin",
      "supervisor",
      "ops",
      "sales",
      "engineer",
      "qa",
      "contractor",
      "finance",
      "rcm",
      "sbc",
    ]);
    if (!permission.ok) return permission.response;

    const { checklistId } = await params;
    const body = await request.json();
    const result = await updateProjectChecklist(
      supabaseAdmin,
      checklistId,
      { status: body.status, notes: body.notes },
      permission.userId,
    );

    if (!result.ok) {
      return NextResponse.json(result, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Project checklist update API Error:", message);
    return NextResponse.json({ error: `Checklist update failed: ${message}` }, { status: 500 });
  }
}
