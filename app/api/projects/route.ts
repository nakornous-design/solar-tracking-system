import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CreateProjectEngine } from "@/services/workflow/createProjectEngine";
import { authorizeRequest } from "@/lib/api-permissions";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const maybeError = error as { message?: string; details?: string; hint?: string; code?: string };
    return [maybeError.message, maybeError.details, maybeError.hint, maybeError.code]
      .filter(Boolean)
      .join(" | ") || JSON.stringify(error);
  }
  return "Unknown error";
}

export async function POST(request: Request) {
  try {
    const permission = await authorizeRequest(supabaseAdmin, request, ["admin", "supervisor", "sales", "ops", "sbc"]);
    if (!permission.ok) return permission.response;

    const body = await request.json();
    
    const engine = new CreateProjectEngine(supabaseAdmin);
    const project = await engine.execute({ ...body, actorUserId: permission.userId });

    return NextResponse.json(
      {
        success: true,
        project,
        message: "Project runtime workflow created successfully.",
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error("Create Project API Error:", message, error);
    return NextResponse.json(
      { error: `Create project failed: ${message}` },
      { status: 400 }, // Changed to 400 to reflect bad request / validation error correctly based on error types
    );
  }
}

export async function GET(request: Request) {
  try {
    const permission = await authorizeRequest(supabaseAdmin, request, [
      "admin",
      "supervisor",
      "exec",
      "sales",
      "ops",
      "engineer",
      "qa",
      "contractor",
      "finance",
      "rcm",
      "sbc",
    ]);
    if (!permission.ok) return permission.response;

    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || 50)));
    const search = String(url.searchParams.get("search") || "").trim();
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabaseAdmin
      .from("projects")
      .select("*, current_stage:project_stages!projects_current_stage_id_fkey(id, name, code, order_index, status, sla_status, started_at, due_at, owner_role, metadata)", { count: "exact" })
      .order("created_at", { ascending: false });

    if (search) {
      const pattern = `%${search.replace(/[,%]/g, " ")}%`;
      query = query.or(`customer_code.ilike.${pattern},customer_name.ilike.${pattern}`);
    }

    const { data, error, count } = await query.range(from, to);

    if (error) throw error;

    const projects = data || [];
    const summary = projects.reduce(
      (acc: any, project: any) => {
        const stage = Array.isArray(project.current_stage) ? project.current_stage[0] : project.current_stage;
        const stageCode = stage?.code || "NO_STAGE";
        acc.total += 1;
        acc.byStage[stageCode] = acc.byStage[stageCode] || {
          code: stageCode,
          name: stage?.name || "No stage",
          total: 0,
          active: 0,
          completed: 0,
          blocked: 0,
          nearSla: 0,
          overSla: 0,
        };
        acc.byStage[stageCode].total += 1;
        if (project.status === "COMPLETED") {
          acc.completed += 1;
          acc.byStage[stageCode].completed += 1;
        } else {
          acc.active += 1;
          acc.byStage[stageCode].active += 1;
        }
        if (stage?.status === "BLOCKED") {
          acc.blocked += 1;
          acc.byStage[stageCode].blocked += 1;
        }
        if (stage?.sla_status === "NEAR_SLA" || project.sla_status === "NEAR_SLA") {
          acc.nearSla += 1;
          acc.byStage[stageCode].nearSla += 1;
        }
        if (stage?.sla_status === "OVER_SLA" || project.sla_status === "OVER_SLA") {
          acc.overSla += 1;
          acc.byStage[stageCode].overSla += 1;
        }
        return acc;
      },
      { total: 0, active: 0, completed: 0, blocked: 0, nearSla: 0, overSla: 0, byStage: {} },
    );

    return NextResponse.json({
      projects,
      summary: {
        ...summary,
        byStage: Object.values(summary.byStage),
      },
      pagination: {
        page,
        pageSize,
        total: count || 0,
      },
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error("Projects API Error:", message, error);
    return NextResponse.json({ error: `Fetch projects failed: ${message}` }, { status: 500 });
  }
}
