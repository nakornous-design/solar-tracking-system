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

export async function authorizeRequest(
  supabaseAdmin: SupabaseClientLike,
  request: Request,
  allowedRoles: string[],
): Promise<PermissionResult> {
  const strict = isStrictAuth();
  const token = getBearerToken(request);

  if (!token) {
    if (!strict) {
      return { ok: true, userId: null, role: null, enforced: false };
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
  const permissionKey = routePermissionForRequest(request);
  let allowed = role === "system_admin" || allowedRoles.includes(role);

  if (!allowed && permissionKey) {
    const { data: rolePermission } = await supabaseAdmin
      .from("role_permissions")
      .select("role_code, permission_key, is_allowed")
      .eq("role_code", role)
      .eq("permission_key", permissionKey)
      .eq("is_allowed", true)
      .maybeSingle();
    allowed = Boolean(rolePermission);
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
    enforced: true,
    permissionKey,
  };
}
