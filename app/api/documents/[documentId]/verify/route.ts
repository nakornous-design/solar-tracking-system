import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeRequest } from "@/lib/api-permissions";
import { verifyProjectDocument } from "@/services/documents/documentEngine";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const permission = await authorizeRequest(supabaseAdmin, request, [
      "admin",
      "supervisor",
      "ops",
      "qa",
      "finance",
      "engineer",
      "sales",
      "rcm",
      "sbc",
    ]);
    if (!permission.ok) return permission.response;

    const { documentId } = await params;
    const result = await verifyProjectDocument(supabaseAdmin, documentId, permission.userId);

    if (!result.ok) {
      return NextResponse.json(result, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Document verify API Error:", message);
    return NextResponse.json({ error: `Document verify failed: ${message}` }, { status: 500 });
  }
}
