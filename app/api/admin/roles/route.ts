import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeRequest } from "@/lib/api-permissions";

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

function roleCodeFromName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_");
}

export async function GET(request: Request) {
  try {
    const permission = await requireAdmin(request);
    if (!permission.ok) return permission.response;

    const [{ data: roles, error: rolesError }, { data: profiles, error: profilesError }] = await Promise.all([
      supabaseAdmin.from("roles").select("role_code, role_name, role_group, description, is_system_role, is_active, created_at, updated_at").order("role_group", { ascending: true }).order("role_code", { ascending: true }),
      supabaseAdmin.from("profiles").select("role, is_active"),
    ]);

    if (rolesError) throw rolesError;
    if (profilesError) throw profilesError;

    const activeCounts = (profiles || []).reduce((acc: Record<string, number>, profile: any) => {
      if (profile.is_active === false) return acc;
      acc[profile.role] = (acc[profile.role] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      currentUser: { id: permission.userId, role: permission.role },
      roles: (roles || []).map((role: any) => ({
        ...role,
        users_count: activeCounts[role.role_code] || 0,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Admin roles API Error:", message);
    return NextResponse.json({ error: `Fetch roles failed: ${message}` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const permission = await requireAdmin(request);
    if (!permission.ok) return permission.response;

    const body = await request.json();
    const roleName = String(body.roleName || "").trim();
    const roleCode = roleCodeFromName(String(body.roleCode || roleName));
    if (!roleName || !roleCode) return NextResponse.json({ error: "Role name is required." }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("roles")
      .insert({
        role_code: roleCode,
        role_name: roleName,
        role_group: body.roleGroup || "Custom",
        description: body.description || null,
        is_system_role: false,
        is_active: body.isActive ?? true,
      })
      .select("role_code, role_name, role_group, description, is_system_role, is_active, created_at, updated_at")
      .single();

    if (error) throw error;

    await supabaseAdmin.from("activity_logs").insert({
      actor_id: permission.userId,
      action: "ADMIN_ROLE_CREATED",
      after_state: data,
      related_entity_type: "roles",
      related_entity_id: roleCode,
      metadata: { source: "admin_users_page", base_permission_template: body.basePermissionTemplate || "Custom Blank" },
    });

    return NextResponse.json({ role: { ...data, users_count: 0 } }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Admin role create API Error:", message);
    return NextResponse.json({ error: `Create role failed: ${message}` }, { status: 500 });
  }
}
