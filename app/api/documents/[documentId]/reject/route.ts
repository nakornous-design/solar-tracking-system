import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { rejectProjectDocument } from "../../../../../services/documents/documentEngine";
import { authorizeRequest } from "@/lib/api-permissions";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const permission = await authorizeRequest(supabaseAdmin, request, ["admin", "supervisor", "ops", "qa", "finance", "engineer", "rcm", "sbc"]);
    if (!permission.ok) return permission.response;

    const { documentId } = await params;
    const { reason } = await request.json();

    const result = await rejectProjectDocument(supabaseAdmin, documentId, reason, permission.userId);

    if (!result.ok) {
      return NextResponse.json(result, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Document reject API Error:", message);
    return NextResponse.json({ error: `Document reject failed: ${message}` }, { status: 500 });
  }
}
