import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeRequest } from "@/lib/api-permissions";
import { writeAuditLog } from "@/lib/audit-log";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type RouteContext = {
  params: Promise<{ teamId: string }>;
};

function parseSkills(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return undefined;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const permission = await authorizeRequest(supabaseAdmin, request, ["admin", "ops"]);
    if (!permission.ok) return permission.response;

    const { teamId } = await context.params;
    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      const name = String(body.name || "").trim();
      if (!name) return NextResponse.json({ error: "name cannot be empty." }, { status: 400 });
      updates.name = name;
    }

    if (Object.prototype.hasOwnProperty.call(body, "ownerRole")) {
      updates.owner_role = body.ownerRole || "contractor";
    }

    if (Object.prototype.hasOwnProperty.call(body, "territory")) {
      updates.territory = body.territory || null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "dailyCapacity")) {
      const capacity = Number(body.dailyCapacity || 1);
      updates.daily_capacity = Math.max(1, Number.isFinite(capacity) ? capacity : 1);
    }

    if (Object.prototype.hasOwnProperty.call(body, "skills")) {
      updates.skills = parseSkills(body.skills) || [];
    }

    if (Object.prototype.hasOwnProperty.call(body, "isActive")) {
      updates.is_active = Boolean(body.isActive);
    }

    if (Object.prototype.hasOwnProperty.call(body, "metadata")) {
      updates.metadata = body.metadata || {};
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No updates provided." }, { status: 400 });
    }

    const { data: beforeTeam, error: beforeError } = await supabaseAdmin
      .from("resource_teams")
      .select("id, name, owner_role, territory, daily_capacity, skills, is_active, metadata")
      .eq("id", teamId)
      .single();
    if (beforeError) throw beforeError;

    const { data, error } = await supabaseAdmin
      .from("resource_teams")
      .update(updates)
      .eq("id", teamId)
      .select("id, name, owner_role, territory, daily_capacity, skills, is_active, metadata, created_at")
      .single();

    if (error) throw error;

    await writeAuditLog(supabaseAdmin, {
      actorId: permission.userId,
      action: "RESOURCE_TEAM_UPDATED",
      relatedEntityType: "resource_teams",
      relatedEntityId: teamId,
      beforeState: beforeTeam,
      afterState: data,
      metadata: { changed_fields: Object.keys(updates) },
    });

    return NextResponse.json({ team: data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Update resource team API Error:", message);
    return NextResponse.json({ error: `Update resource team failed: ${message}` }, { status: 500 });
  }
}
