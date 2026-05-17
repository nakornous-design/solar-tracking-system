import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeRequest } from "@/lib/api-permissions";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ALLOWED_STATUSES = new Set(["PENDING", "SENT", "READ", "FAILED", "CANCELLED"]);
const ALLOWED_SEVERITIES = new Set(["INFO", "WARNING", "HIGH", "CRITICAL"]);
const ALLOWED_CHANNELS = new Set(["IN_APP", "EMAIL", "LINE"]);

export async function GET(request: Request) {
  try {
    const permission = await authorizeRequest(supabaseAdmin, request, ["admin", "supervisor", "exec", "sales", "ops", "engineer", "qa", "contractor", "finance", "rcm", "sbc"]);
    if (!permission.ok) return permission.response;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const projectId = searchParams.get("projectId");
    const recipientRole = searchParams.get("recipientRole");
    const severity = searchParams.get("severity");
    const channel = searchParams.get("channel");
    const limit = Math.min(Number(searchParams.get("limit") || 40), 100);

    let query = supabaseAdmin
      .from("notifications")
      .select(
        [
          "id",
          "project_id",
          "project_stage_id",
          "exception_id",
          "approval_request_id",
          "recipient_role",
          "recipient_id",
          "channel",
          "status",
          "severity",
          "title",
          "message",
          "action_url",
          "escalation_level",
          "metadata",
          "scheduled_at",
          "sent_at",
          "read_at",
          "created_at",
          "projects(customer_code, customer_name)",
          "project_stages(code, name, status, sla_status)",
        ].join(", "),
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!status || status === "ACTIVE") {
      query = query.in("status", ["PENDING", "SENT"]);
    } else if (status !== "ALL") {
      if (!ALLOWED_STATUSES.has(status)) {
        return NextResponse.json({ error: "Unsupported notification status." }, { status: 400 });
      }
      query = query.eq("status", status);
    }

    if (projectId) query = query.eq("project_id", projectId);
    if (recipientRole) query = query.eq("recipient_role", recipientRole);
    if (severity && severity !== "ALL") {
      if (!ALLOWED_SEVERITIES.has(severity)) {
        return NextResponse.json({ error: "Unsupported notification severity." }, { status: 400 });
      }
      query = query.eq("severity", severity);
    }
    if (channel && channel !== "ALL") {
      if (!ALLOWED_CHANNELS.has(channel)) {
        return NextResponse.json({ error: "Unsupported notification channel." }, { status: 400 });
      }
      query = query.eq("channel", channel);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({ notifications: data || [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Notifications API Error:", message);
    return NextResponse.json({ error: `Fetch notifications failed: ${message}` }, { status: 500 });
  }
}
