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
      response: NextResponse.json({ error: "Admin profile is required." }, { status: 403 }),
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

export async function GET(request: Request) {
  try {
    const permission = await requireAdmin(request);
    if (!permission.ok) return permission.response;

    const [{ data: authUsers, error: authError }, { data: profiles, error: profileError }] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      supabaseAdmin.from("profiles").select("id, email, full_name, role, is_active, created_at, updated_at").order("email", { ascending: true }),
    ]);

    if (authError) throw authError;
    if (profileError) throw profileError;

    const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]));
    const users = (authUsers.users || []).map((user) => ({
      id: user.id,
      email: user.email || profilesById.get(user.id)?.email || null,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
      profile: profilesById.get(user.id) || null,
    }));

    return NextResponse.json({ users });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Profiles API Error:", message);
    return NextResponse.json({ error: `Fetch profiles failed: ${message}` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const permission = await requireAdmin(request);
    if (!permission.ok) return permission.response;

    const body = await request.json();
    const mode = String(body.mode || "upsert").trim();
    if (mode === "createUser") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "").trim();
      const fullName = String(body.fullName || "").trim();
      const role = String(body.role || "ops").trim();
      const emailConfirmed = body.emailConfirmed ?? true;

      if (!email) return NextResponse.json({ error: "email is required." }, { status: 400 });
      if (!password || password.length < 8) {
        return NextResponse.json({ error: "password must be at least 8 characters." }, { status: 400 });
      }
      const targetRole = await getAssignableRole(role);
      if (!targetRole || targetRole.is_active === false) return NextResponse.json({ error: "Unsupported role." }, { status: 400 });

      const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: Boolean(emailConfirmed),
        user_metadata: {
          full_name: fullName || null,
          role,
          created_from: "profile_admin",
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
        })
        .select("id, email, full_name, role, is_active, created_at, updated_at")
        .single();

      if (profileError) throw profileError;

      await supabaseAdmin.from("activity_logs").insert({
        actor_id: permission.userId,
        action: "AUTH_USER_CREATED",
        after_state: profile,
        related_entity_type: "profiles",
        related_entity_id: user.id,
        metadata: {
          source: "profile_admin",
          email,
          email_confirmed: Boolean(emailConfirmed),
        },
      });

      return NextResponse.json({ user: { id: user.id, email: user.email }, profile }, { status: 201 });
    }

    const userId = String(body.userId || "").trim();
    const email = String(body.email || "").trim() || null;
    const role = String(body.role || "ops").trim();
    if (!userId) return NextResponse.json({ error: "userId is required." }, { status: 400 });
    const targetRole = await getAssignableRole(role);
    if (!targetRole || targetRole.is_active === false) return NextResponse.json({ error: "Unsupported role." }, { status: 400 });

    const { data: beforeProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, role, is_active")
      .eq("id", userId)
      .maybeSingle();

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: userId,
        email,
        full_name: body.fullName || null,
        role,
        is_active: body.isActive ?? true,
      })
      .select("id, email, full_name, role, is_active, created_at, updated_at")
      .single();

    if (error) throw error;

    await supabaseAdmin.from("activity_logs").insert({
      actor_id: permission.userId,
      action: "PROFILE_UPSERTED",
      before_state: beforeProfile || null,
      after_state: data,
      related_entity_type: "profiles",
      related_entity_id: userId,
      metadata: {
        source: "profile_admin",
      },
    });

    return NextResponse.json({ profile: data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Upsert profile API Error:", message);
    return NextResponse.json({ error: `Upsert profile failed: ${message}` }, { status: 500 });
  }
}
