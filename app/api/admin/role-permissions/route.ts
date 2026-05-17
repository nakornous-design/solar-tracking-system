import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeRequest } from "@/lib/api-permissions";
import { isDangerPermission } from "@/lib/permissions";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function requireAdmin(request: Request) {
  const permission = await authorizeRequest(supabaseAdmin, request, ["system_admin", "admin"]);
  if (!permission.ok) return permission;
  if (!permission.enforced || !permission.role) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Admin session is required." }, { status: 401 }),
    };
  }
  return permission;
}

export async function GET(request: Request) {
  try {
    const permission = await requireAdmin(request);
    if (!permission.ok) return permission.response;

    const url = new URL(request.url);
    const roleCode = String(url.searchParams.get("role_code") || "").trim();
    if (!roleCode) return NextResponse.json({ error: "role_code is required." }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("role_permissions")
      .select("role_code, permission_key, is_allowed")
      .eq("role_code", roleCode)
      .order("permission_key", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ permissions: data || [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Admin role permissions API Error:", message);
    return NextResponse.json({ error: `Fetch permissions failed: ${message}` }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const permission = await requireAdmin(request);
    if (!permission.ok) return permission.response;

    const body = await request.json();
    const roleCode = String(body.roleCode || "").trim();
    const permissionKey = String(body.permissionKey || "").trim();
    const isAllowed = Boolean(body.isAllowed);

    if (!roleCode || !permissionKey) {
      return NextResponse.json({ error: "roleCode and permissionKey are required." }, { status: 400 });
    }

    if (roleCode === "system_admin") {
      return NextResponse.json({ error: "system_admin permissions are locked." }, { status: 400 });
    }

    if (permission.role !== "system_admin" && isDangerPermission(permissionKey)) {
      return NextResponse.json(
        { error: "Normal admin cannot grant danger zone permissions." },
        { status: 403 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("role_permissions")
      .upsert({
        role_code: roleCode,
        permission_key: permissionKey,
        is_allowed: isAllowed,
      }, { onConflict: "role_code,permission_key" })
      .select("role_code, permission_key, is_allowed")
      .single();

    if (error) throw error;

    await supabaseAdmin.from("activity_logs").insert({
      actor_id: permission.userId,
      action: "ADMIN_ROLE_PERMISSION_UPDATED",
      after_state: data,
      related_entity_type: "role_permissions",
      related_entity_id: `${roleCode}:${permissionKey}`,
      metadata: { source: "admin_users_page" },
    });

    return NextResponse.json({ permission: data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Admin role permission update API Error:", message);
    return NextResponse.json({ error: `Update permission failed: ${message}` }, { status: 500 });
  }
}
