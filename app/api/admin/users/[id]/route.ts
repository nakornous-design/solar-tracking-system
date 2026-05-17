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

async function getAssignableRole(roleCode: string) {
  const { data, error } = await supabaseAdmin
    .from("roles")
    .select("role_code, is_active")
    .eq("role_code", roleCode)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const permission = await requireAdmin(request);
    if (!permission.ok) return permission.response;

    const { id } = await params;
    const body = await request.json();
    const role = String(body.role || "").trim();

    if (role) {
      const targetRole = await getAssignableRole(role);
      if (!targetRole || targetRole.is_active === false) {
        return NextResponse.json({ error: "Unsupported role for profile assignment." }, { status: 400 });
      }
    }

    if (role === "system_admin" && permission.role !== "system_admin") {
      return NextResponse.json(
        { error: "เฉพาะ system_admin เท่านั้นที่สามารถมอบสิทธิ์ system_admin ให้ผู้อื่นได้" },
        { status: 403 },
      );
    }

    const { data: beforeProfile, error: beforeError } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, role, is_active, team_department, notes")
      .eq("id", id)
      .maybeSingle();

    if (beforeError) throw beforeError;
    if (!beforeProfile) return NextResponse.json({ error: "User profile was not found." }, { status: 404 });

    if (beforeProfile.role === "system_admin" && body.isActive === false) {
      return NextResponse.json({ error: "system_admin cannot be disabled." }, { status: 400 });
    }

    const updatePayload: Record<string, unknown> = {
      full_name: body.fullName ?? beforeProfile.full_name,
      role: role || beforeProfile.role,
      is_active: body.isActive ?? beforeProfile.is_active,
      team_department: body.teamDepartment ?? beforeProfile.team_department,
      notes: body.notes ?? beforeProfile.notes,
    };

    if (beforeProfile.role === "system_admin") {
      updatePayload.is_active = true;
    }

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .update(updatePayload)
      .eq("id", id)
      .select("id, email, full_name, role, is_active, team_department, notes, created_at, updated_at")
      .single();

    if (error) throw error;

    await supabaseAdmin.from("activity_logs").insert({
      actor_id: permission.userId,
      action: "ADMIN_USER_UPDATED",
      before_state: beforeProfile,
      after_state: profile,
      related_entity_type: "profiles",
      related_entity_id: id,
      metadata: { source: "admin_users_page" },
    });

    return NextResponse.json({ profile });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Admin user update API Error:", message);
    return NextResponse.json({ error: `Update user failed: ${message}` }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const permission = await requireAdmin(request);
    if (!permission.ok) return permission.response;
    if (permission.role !== "system_admin") {
      return NextResponse.json({ error: "System admin session is required to delete users." }, { status: 403 });
    }

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "User id is required." }, { status: 400 });
    if (id === permission.userId) {
      return NextResponse.json({ error: "system_admin cannot delete their own account." }, { status: 400 });
    }

    const { data: beforeProfile, error: beforeError } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, role, is_active, team_department, notes")
      .eq("id", id)
      .maybeSingle();

    if (beforeError) throw beforeError;
    if (!beforeProfile) return NextResponse.json({ error: "User profile was not found." }, { status: 404 });

    if (beforeProfile.role === "system_admin") {
      const { count, error: countError } = await supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "system_admin")
        .eq("is_active", true);

      if (countError) throw countError;
      if (Number(count || 0) <= 1) {
        return NextResponse.json({ error: "Cannot delete the last active system_admin." }, { status: 400 });
      }
    }

    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (deleteAuthError) throw deleteAuthError;

    await supabaseAdmin.from("activity_logs").insert({
      actor_id: permission.userId,
      action: "ADMIN_USER_DELETED",
      before_state: beforeProfile,
      after_state: { deleted_user_id: id },
      related_entity_type: "profiles",
      related_entity_id: id,
      metadata: { source: "admin_users_page" },
    });

    return NextResponse.json({ success: true, deletedUserId: id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Admin user delete API Error:", message);
    return NextResponse.json({ error: `Delete user failed: ${message}` }, { status: 500 });
  }
}
