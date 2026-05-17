import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export async function POST(request: Request) {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
    }

    const { count: profileCount, error: countError } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true });
    if (countError) throw countError;

    const { count: adminCount, error: adminCountError } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("is_active", true);
    if (adminCountError) throw adminCountError;

    const body = await request.json().catch(() => ({}));
    const providedSecret = String(body.bootstrapSecret || request.headers.get("x-bootstrap-secret") || "");
    const expectedSecret = process.env.PROFILE_BOOTSTRAP_SECRET || "";
    const canUseSecret = Boolean(expectedSecret && providedSecret === expectedSecret);
    const canBootstrapFirstAdmin = Number(profileCount || 0) === 0 || Number(adminCount || 0) === 0;

    if (!canBootstrapFirstAdmin && !canUseSecret) {
      return NextResponse.json({ error: "Admin profile already exists. Bootstrap secret is required." }, { status: 403 });
    }

    const { data: profile, error: upsertError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: userData.user.id,
        email: userData.user.email || null,
        full_name: body.fullName || userData.user.user_metadata?.full_name || null,
        role: "admin",
        is_active: true,
      })
      .select("id, email, full_name, role, is_active, created_at, updated_at")
      .single();
    if (upsertError) throw upsertError;

    await supabaseAdmin.from("activity_logs").insert({
      actor_id: userData.user.id,
      action: "PROFILE_BOOTSTRAPPED_ADMIN",
      after_state: profile,
      related_entity_type: "profiles",
      related_entity_id: userData.user.id,
      metadata: {
        source: "profile_bootstrap",
        used_secret: canUseSecret,
        profile_count_before: profileCount || 0,
        admin_count_before: adminCount || 0,
      },
    });

    return NextResponse.json({ profile });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Bootstrap profile API Error:", message);
    return NextResponse.json({ error: `Bootstrap profile failed: ${message}` }, { status: 500 });
  }
}
