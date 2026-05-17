import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeRequest } from "@/lib/api-permissions";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ADMIN_ROLES = ["system_admin", "admin"] as const;

async function requireAdmin(request: Request) {
  const permission = await authorizeRequest(supabaseAdmin, request, [...ADMIN_ROLES]);
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

function activeAdditionalRole(row: any) {
  if (!row || row.revoked_at) return false;
  if (!row.expires_at) return true;
  const expiresAt = new Date(row.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

async function fetchAdditionalRoles(userIds: string[]) {
  if (!userIds.length) return new Map<string, any[]>();
  try {
    const { data, error } = await supabaseAdmin
      .from("user_roles")
      .select("id, user_id, role_id, assigned_by, assigned_at, expires_at, reason, revoked_at")
      .in("user_id", userIds);
    if (error) return new Map<string, any[]>();
    return (data || []).reduce((acc: Map<string, any[]>, row: any) => {
      if (!activeAdditionalRole(row)) return acc;
      const list = acc.get(row.user_id) || [];
      list.push({
        id: row.id,
        role: row.role_id,
        assignedBy: row.assigned_by,
        assignedAt: row.assigned_at,
        expiresAt: row.expires_at,
        reason: row.reason,
      });
      acc.set(row.user_id, list);
      return acc;
    }, new Map<string, any[]>());
  } catch {
    return new Map<string, any[]>();
  }
}

export async function GET(request: Request) {
  try {
    const permission = await requireAdmin(request);
    if (!permission.ok) return permission.response;

    const [{ data: authUsers, error: authError }, { data: profiles, error: profileError }] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      supabaseAdmin
        .from("profiles")
        .select("id, email, full_name, role, is_active, team_department, notes, created_at, updated_at")
        .order("email", { ascending: true }),
    ]);

    if (authError) throw authError;
    if (profileError) throw profileError;

    const profilesById = new Map((profiles || []).map((profile: any) => [profile.id, profile]));
    const additionalRolesByUserId = await fetchAdditionalRoles((authUsers.users || []).map((user) => user.id));
    const users = (authUsers.users || []).map((user) => {
      const profile: any = profilesById.get(user.id) || {};
      const additionalRoles = additionalRolesByUserId.get(user.id) || [];
      return {
        id: user.id,
        email: user.email || profile.email || null,
        fullName: profile.full_name || user.user_metadata?.full_name || "",
        role: profile.role || user.user_metadata?.role || "ops",
        additionalRoles,
        effectiveRoles: [...new Set([profile.role || user.user_metadata?.role || "ops", ...additionalRoles.map((item) => item.role)].filter(Boolean))],
        isActive: profile.is_active !== false,
        teamDepartment: profile.team_department || "",
        notes: profile.notes || "",
        createdAt: user.created_at || profile.created_at,
        updatedAt: profile.updated_at || null,
        lastSignInAt: user.last_sign_in_at || null,
      };
    });

    return NextResponse.json({
      currentUser: {
        id: permission.userId,
        role: permission.role,
        roles: permission.roles,
      },
      users,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Admin users API Error:", message);
    return NextResponse.json({ error: `Fetch users failed: ${message}` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const permission = await requireAdmin(request);
    if (!permission.ok) return permission.response;

    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "").trim();
    const fullName = String(body.fullName || "").trim();
    const role = String(body.role || "ops").trim();

    if (!email) return NextResponse.json({ error: "email is required." }, { status: 400 });
    if (!password || password.length < 8) {
      return NextResponse.json({ error: "password must be at least 8 characters." }, { status: 400 });
    }
    const targetRole = await getAssignableRole(role);
    if (!targetRole || targetRole.is_active === false) {
      return NextResponse.json({ error: "Unsupported role for profile assignment." }, { status: 400 });
    }
    if (role === "system_admin" && !permission.roles.includes("system_admin")) {
      return NextResponse.json(
        { error: "เฉพาะ system_admin เท่านั้นที่สามารถมอบสิทธิ์ system_admin ให้ผู้อื่นได้" },
        { status: 403 },
      );
    }

    const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: body.emailConfirmed ?? true,
      user_metadata: {
        full_name: fullName || null,
        role,
        created_from: "admin_users_page",
      },
    });

    if (createUserError) throw createUserError;
    const user = createdUser.user;
    if (!user) return NextResponse.json({ error: "Auth user was not created." }, { status: 500 });

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: user.id,
        email,
        full_name: fullName || null,
        role,
        is_active: body.isActive ?? true,
        team_department: body.teamDepartment || null,
        notes: body.notes || null,
      })
      .select("id, email, full_name, role, is_active, team_department, notes, created_at, updated_at")
      .single();

    if (profileError) throw profileError;

    const additionalRoles: string[] = Array.isArray(body.additionalRoles)
      ? Array.from(new Set<string>(body.additionalRoles
        .map((item: unknown) => String(item || "").trim())
        .filter((item: string): item is string => Boolean(item))))
      : [];
    const invalidAdditionalRoles = additionalRoles.filter((item) => item === role);
    if (invalidAdditionalRoles.length) {
      return NextResponse.json({ error: "Additional roles should not duplicate the primary role." }, { status: 400 });
    }
    for (const additionalRole of additionalRoles) {
      const targetRole = await getAssignableRole(additionalRole);
      if (!targetRole || targetRole.is_active === false) {
        return NextResponse.json({ error: `Unsupported additional role: ${additionalRole}` }, { status: 400 });
      }
      if (additionalRole === "system_admin" && !permission.roles.includes("system_admin")) {
        return NextResponse.json({ error: "Only system_admin can assign system_admin." }, { status: 403 });
      }
    }
    if (additionalRoles.length) {
      await supabaseAdmin.from("user_roles").upsert(
        additionalRoles.map((additionalRole) => ({
          user_id: user.id,
          role_id: additionalRole,
          assigned_by: permission.userId,
          assigned_at: new Date().toISOString(),
          expires_at: body.expiresAt || null,
          reason: body.reason || null,
          revoked_at: null,
        })),
        { onConflict: "user_id,role_id" },
      );
    }

    await supabaseAdmin.from("activity_logs").insert({
      actor_id: permission.userId,
      action: "ADMIN_USER_CREATED",
      after_state: profile,
      related_entity_type: "profiles",
      related_entity_id: user.id,
      metadata: {
        source: "admin_users_page",
        email_confirmed: Boolean(body.emailConfirmed ?? true),
      },
    });

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email || email,
        fullName: profile.full_name || "",
        role: profile.role,
        additionalRoles: additionalRoles.map((roleCode) => ({ role: roleCode })),
        effectiveRoles: [...new Set([profile.role, ...additionalRoles].filter(Boolean))],
        isActive: profile.is_active !== false,
        teamDepartment: profile.team_department || "",
        notes: profile.notes || "",
        lastSignInAt: user.last_sign_in_at || null,
      },
    }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Admin user create API Error:", message);
    return NextResponse.json({ error: `Create user failed: ${message}` }, { status: 500 });
  }
}
