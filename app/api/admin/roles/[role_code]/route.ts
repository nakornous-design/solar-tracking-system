import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeRequest } from "@/lib/api-permissions";
import { PERMISSION_DEFINITIONS } from "@/lib/permissions";

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

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    return [candidate.message, candidate.details, candidate.hint, candidate.code].filter(Boolean).join(" | ") || JSON.stringify(error);
  }
  return String(error || "Unknown error");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ role_code: string }> },
) {
  try {
    const permission = await requireAdmin(request);
    if (!permission.ok) return permission.response;

    const { role_code: roleCode } = await params;

    const [
      { data: role, error: roleError },
      { data: rolePermissions, error: permissionsError },
      { data: stageOwnership, error: stagesError },
    ] = await Promise.all([
      supabaseAdmin
        .from("roles")
        .select("role_code, role_name, role_group, description, is_system_role, is_active")
        .eq("role_code", roleCode)
        .maybeSingle(),
      supabaseAdmin
        .from("role_permissions")
        .select("permission_key, is_allowed")
        .eq("role_code", roleCode)
        .eq("is_allowed", true)
        .order("permission_key", { ascending: true }),
      supabaseAdmin
        .from("workflow_stages")
        .select("id, workflow_version_id, code, name, order_index, owner_role, is_active")
        .eq("owner_role", roleCode)
        .eq("is_active", true)
        .order("order_index", { ascending: true }),
    ]);

    if (roleError) throw roleError;
    if (!role) return NextResponse.json({ error: "Role was not found." }, { status: 404 });
    if (permissionsError) throw permissionsError;
    if (stagesError) throw stagesError;

    const workflowVersionIds = Array.from(new Set((stageOwnership || []).map((stage: any) => stage.workflow_version_id).filter(Boolean)));
    let workflowVersionById = new Map<string, any>();
    if (workflowVersionIds.length > 0) {
      const { data: workflowVersions, error: workflowVersionsError } = await supabaseAdmin
        .from("workflow_versions")
        .select("id, code, name, status")
        .in("id", workflowVersionIds);
      if (workflowVersionsError) {
        const { data: fallbackVersions, error: fallbackError } = await supabaseAdmin
          .from("workflow_versions")
          .select("id, name, status")
          .in("id", workflowVersionIds);
        if (fallbackError) throw fallbackError;
        workflowVersionById = new Map((fallbackVersions || []).map((version: any) => [version.id, version]));
      } else {
        workflowVersionById = new Map((workflowVersions || []).map((version: any) => [version.id, version]));
      }
    }

    const allowedKeys = new Set((rolePermissions || []).map((item: any) => item.permission_key));
    const permissions = PERMISSION_DEFINITIONS.map((definition) => ({
      ...definition,
      is_allowed: allowedKeys.has(definition.key) || roleCode === "system_admin",
    }));

    return NextResponse.json({
      role,
      permissions,
      stageOwnership: (stageOwnership || []).map((stage: any) => ({
        id: stage.id,
        code: stage.code,
        name: stage.name,
        orderIndex: stage.order_index,
        workflowCode: workflowVersionById.get(stage.workflow_version_id)?.code || null,
        workflowName: workflowVersionById.get(stage.workflow_version_id)?.name || null,
        workflowStatus: workflowVersionById.get(stage.workflow_version_id)?.status || null,
      })),
    });
  } catch (error: unknown) {
    const message = errorMessage(error);
    console.error("Admin role detail API Error:", message);
    return NextResponse.json({ error: `Fetch role detail failed: ${message}` }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ role_code: string }> },
) {
  try {
    const permission = await requireAdmin(request);
    if (!permission.ok) return permission.response;

    const { role_code: roleCode } = await params;
    const body = await request.json();

    const { data: beforeRole, error: beforeError } = await supabaseAdmin
      .from("roles")
      .select("role_code, role_name, role_group, description, is_system_role, is_active")
      .eq("role_code", roleCode)
      .maybeSingle();

    if (beforeError) throw beforeError;
    if (!beforeRole) return NextResponse.json({ error: "Role was not found." }, { status: 404 });

    if (roleCode === "system_admin" && body.isActive === false) {
      return NextResponse.json({ error: "system_admin cannot be disabled." }, { status: 400 });
    }

    if (body.isActive === false) {
      const { count, error: countError } = await supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", roleCode)
        .eq("is_active", true);

      if (countError) throw countError;
      if (Number(count || 0) > 0) {
        return NextResponse.json(
          { error: "บทบาทนี้ถูกใช้งานอยู่ กรุณาย้ายผู้ใช้งานไปบทบาทอื่นก่อนปิดใช้งาน" },
          { status: 409 },
        );
      }
    }

    const updatePayload: Record<string, unknown> = {
      role_name: body.roleName ?? beforeRole.role_name,
      role_group: body.roleGroup ?? beforeRole.role_group,
      description: body.description ?? beforeRole.description,
      is_active: body.isActive ?? beforeRole.is_active,
    };

    if (roleCode === "system_admin") updatePayload.is_active = true;

    const { data: role, error } = await supabaseAdmin
      .from("roles")
      .update(updatePayload)
      .eq("role_code", roleCode)
      .select("role_code, role_name, role_group, description, is_system_role, is_active, created_at, updated_at")
      .single();

    if (error) throw error;

    await supabaseAdmin.from("activity_logs").insert({
      actor_id: permission.userId,
      action: "ADMIN_ROLE_UPDATED",
      before_state: beforeRole,
      after_state: role,
      related_entity_type: "roles",
      related_entity_id: roleCode,
      metadata: { source: "admin_users_page" },
    });

    return NextResponse.json({ role });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Admin role update API Error:", message);
    return NextResponse.json({ error: `Update role failed: ${message}` }, { status: 500 });
  }
}
