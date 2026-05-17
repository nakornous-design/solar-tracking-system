import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeRequest } from "@/lib/api-permissions";
import { writeAuditLog } from "@/lib/audit-log";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(request: Request) {
  try {
    const permission = await authorizeRequest(supabaseAdmin, request, ["admin", "supervisor", "ops", "contractor", "rcm"]);
    if (!permission.ok) return permission.response;

    const { data, error } = await supabaseAdmin
      .from("resource_teams")
      .select("id, name, owner_role, territory, daily_capacity, skills, is_active, metadata, created_at")
      .order("name", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ teams: data || [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Resource teams API Error:", message);
    return NextResponse.json({ error: `Fetch resource teams failed: ${message}` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const permission = await authorizeRequest(supabaseAdmin, request, ["admin", "ops"]);
    if (!permission.ok) return permission.response;

    const body = await request.json();
    const name = String(body.name || "").trim();

    if (!name) {
      return NextResponse.json({ error: "name is required." }, { status: 400 });
    }

    const skills = Array.isArray(body.skills)
      ? body.skills
      : String(body.skills || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);

    const { data, error } = await supabaseAdmin
      .from("resource_teams")
      .insert({
        name,
        owner_role: body.ownerRole || "contractor",
        territory: body.territory || null,
        daily_capacity: Number(body.dailyCapacity || 1),
        skills,
        is_active: body.isActive ?? true,
        metadata: body.metadata || {},
      })
      .select("id, name, owner_role, territory, daily_capacity, skills, is_active, metadata, created_at")
      .single();

    if (error) throw error;

    await writeAuditLog(supabaseAdmin, {
      actorId: permission.userId,
      action: "RESOURCE_TEAM_CREATED",
      relatedEntityType: "resource_teams",
      relatedEntityId: data.id,
      afterState: data,
      metadata: { name: data.name },
    });

    return NextResponse.json({ team: data }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Create resource team API Error:", message);
    return NextResponse.json({ error: `Create resource team failed: ${message}` }, { status: 500 });
  }
}
