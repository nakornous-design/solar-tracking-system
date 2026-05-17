import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeRequest } from "@/lib/api-permissions";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function uniqueValues(values: Array<string | null | undefined>) {
  return [...new Set(values.filter(Boolean) as string[])];
}

export async function GET(request: Request) {
  try {
    const permission = await authorizeRequest(supabaseAdmin, request, ["system_admin", "admin"]);
    if (!permission.ok) return permission.response;

    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || 50)));
    const action = String(url.searchParams.get("action") || "ALL").trim();
    const search = String(url.searchParams.get("search") || "").trim();
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabaseAdmin
      .from("activity_logs")
      .select(
        "id, project_id, project_stage_id, actor_id, action, reason, evidence, before_state, after_state, related_entity_type, related_entity_id, metadata, created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (action !== "ALL") query = query.eq("action", action);
    if (search) {
      const pattern = `%${search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
      query = query.or(`action.ilike.${pattern},reason.ilike.${pattern},related_entity_type.ilike.${pattern}`);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    const logs = data || [];
    const [profilesResult, projectsResult, stagesResult] = await Promise.all([
      uniqueValues(logs.map((log: any) => log.actor_id)).length
        ? supabaseAdmin
            .from("profiles")
            .select("id, email, full_name, role")
            .in("id", uniqueValues(logs.map((log: any) => log.actor_id)))
        : Promise.resolve({ data: [], error: null }),
      uniqueValues(logs.map((log: any) => log.project_id)).length
        ? supabaseAdmin
            .from("projects")
            .select("id, customer_code, customer_name")
            .in("id", uniqueValues(logs.map((log: any) => log.project_id)))
        : Promise.resolve({ data: [], error: null }),
      uniqueValues(logs.map((log: any) => log.project_stage_id)).length
        ? supabaseAdmin
            .from("project_stages")
            .select("id, code, name")
            .in("id", uniqueValues(logs.map((log: any) => log.project_stage_id)))
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (projectsResult.error) throw projectsResult.error;
    if (stagesResult.error) throw stagesResult.error;

    const profilesById = new Map((profilesResult.data || []).map((profile: any) => [profile.id, profile]));
    const projectsById = new Map((projectsResult.data || []).map((project: any) => [project.id, project]));
    const stagesById = new Map((stagesResult.data || []).map((stage: any) => [stage.id, stage]));

    const actionsResult = await supabaseAdmin
      .from("activity_logs")
      .select("action")
      .order("action", { ascending: true });

    if (actionsResult.error) throw actionsResult.error;

    return NextResponse.json({
      logs: logs.map((log: any) => ({
        ...log,
        actor: log.actor_id ? profilesById.get(log.actor_id) || null : null,
        project: log.project_id ? projectsById.get(log.project_id) || null : null,
        stage: log.project_stage_id ? stagesById.get(log.project_stage_id) || null : null,
      })),
      actions: uniqueValues((actionsResult.data || []).map((row: any) => row.action)),
      pagination: {
        page,
        pageSize,
        total: count || 0,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Audit logs API Error:", message);
    return NextResponse.json({ error: `Fetch audit logs failed: ${message}` }, { status: 500 });
  }
}
