import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeRequest } from "@/lib/api-permissions";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ notificationId: string }> },
) {
  try {
    const permission = await authorizeRequest(supabaseAdmin, request, ["admin", "supervisor", "exec", "sales", "ops", "engineer", "qa", "contractor", "finance", "rcm", "sbc"]);
    if (!permission.ok) return permission.response;

    const { notificationId } = await params;
    const { status } = await request.json();

    if (!status || !["READ", "CANCELLED"].includes(status)) {
      return NextResponse.json({ error: "status must be READ or CANCELLED." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const updatePayload =
      status === "READ"
        ? { status, read_at: now }
        : { status };

    const { data: notification, error } = await supabaseAdmin
      .from("notifications")
      .update(updatePayload)
      .eq("id", notificationId)
      .select("id, status, read_at")
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, notification });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Notification update API Error:", message);
    return NextResponse.json({ error: `Notification update failed: ${message}` }, { status: 500 });
  }
}
