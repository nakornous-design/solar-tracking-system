import { NextResponse } from "next/server.js";
import { routePermissionForRequest } from "./permissions.ts";

type SupabaseClientLike = {
  auth: {
    getUser: (token: string) => Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  };
  from: (table: string) => any;
};

export type UserRole =
  | "system_admin"
  | "admin"
  | string;

type PermissionResult =
  | {
      ok: true;
      userId: string | null;
      role: string | null;
      roles: string[];
      enforced: boolean;
      permissionKey?: string | null;
    }
  | {
      ok: false;
      response: NextResponse;
    };

function isStrictAuth() {
  return process.env.AUTH_ENFORCEMENT === "strict" || process.env.VERCEL_ENV === "production";
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function normalizeRole(role?: string | null) {
  return String(role || "").trim();
}

function activeAdditionalRole(row: any) {
  if (!row || row.revoked_at) return false;
  if (!row.expires_at) return true;
  const expiresAt = new Date(row.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export async function getEffectiveRoles(
  supabaseAdmin: SupabaseClientLike,
  userId: string,
  primaryRole?: string | null,
) {
  const roles = new Set<string>();
  const normalizedPrimary = normalizeRole(primaryRole);
  if (normalizedPrimary) roles.add(normalizedPrimary);

  try {
    const { data, error } = await supabaseAdmin
      .from("user_roles")
      .select("role_id, expires_at, revoked_at")
      .eq("user_id", userId);

    if (error) return [...roles];
    for (const row of data || []) {
      const role = normalizeRole(row.role_id);
      if (role && activeAdditionalRole(row)) roles.add(role);
    }
  } catch {
    return [...roles];
  }

  return [...roles];
}

export async function authorizeRequest(
  supabaseAdmin: SupabaseClientLike,
  request: Request,
  allowedRoles: string[],
): Promise<PermissionResult> {
  const strict = isStrictAuth();
  const token = getBearerToken(request);

  if (!token) {
    if (!strict) {
      return { ok: true, userId: null, role: null, roles: [], enforced: false };
    }

    return {
      ok: false,
      response: NextResponse.json({ error: "Authentication is required." }, { status: 401 }),
    };
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid or expired session." }, { status: 401 }),
    };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profile || !profile.is_active) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Active user profile was not found." }, { status: 403 }),
    };
  }

  const role = String(profile.role || "");
  const effectiveRoles = await getEffectiveRoles(supabaseAdmin, userData.user.id, role);
  const permissionKey = routePermissionForRequest(request);
  let allowed = effectiveRoles.includes("system_admin") || effectiveRoles.some((item) => allowedRoles.includes(item));

  if (!allowed && permissionKey) {
    const { data: rolePermissions } = await supabaseAdmin
      .from("role_permissions")
      .select("role_code, permission_key, is_allowed")
      .in("role_code", effectiveRoles)
      .eq("permission_key", permissionKey)
      .eq("is_allowed", true)
      .limit(1);
    allowed = Boolean(rolePermissions?.length);
  }

  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json({ error: "You do not have permission to perform this action." }, { status: 403 }),
    };
  }

  return {
    ok: true,
    userId: userData.user.id,
    role,
    roles: effectiveRoles,
    enforced: true,
    permissionKey,
  };
}
