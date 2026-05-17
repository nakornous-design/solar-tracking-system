import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeRequest } from "@/lib/api-permissions";
import { createDriveClient } from "@/lib/google-drive";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const maybeError = error as { message?: string; details?: string; hint?: string; code?: string };
    return [maybeError.message, maybeError.details, maybeError.hint, maybeError.code].filter(Boolean).join(" | ") || JSON.stringify(error);
  }
  return "Unknown error";
}

async function deleteDriveFile(fileId: string, label: string) {
  const drive = createDriveClient();

  try {
    await drive.files.delete({ fileId });
    return { id: fileId, label, status: "DELETED" };
  } catch (error: any) {
    if (error?.code === 404) return { id: fileId, label, status: "NOT_FOUND" };
    throw error;
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const permission = await authorizeRequest(supabaseAdmin, request, ["system_admin"]);
    if (!permission.ok) return permission.response;
    if (!permission.enforced || permission.role !== "system_admin") {
      return NextResponse.json({ error: "System admin session is required." }, { status: 403 });
    }

    const { projectId } = await params;
    if (!projectId) return NextResponse.json({ error: "projectId is required." }, { status: 400 });

    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("id, customer_code, customer_name, google_drive_folder_id, drive_metadata, status, created_at")
      .eq("id", projectId)
      .maybeSingle();

    if (projectError) throw projectError;
    if (!project) return NextResponse.json({ error: "Project was not found." }, { status: 404 });

    const { data: documents, error: documentsError } = await supabaseAdmin
      .from("project_documents")
      .select("id, code, name, google_drive_file_id")
      .eq("project_id", projectId);

    if (documentsError) throw documentsError;

    const rootFolderId = project.google_drive_folder_id || project.drive_metadata?.root?.id || null;
    const driveDeletes = [];

    if (rootFolderId) {
      driveDeletes.push(await deleteDriveFile(rootFolderId, "project_root_folder"));
    } else {
      const fileIds = [...new Set((documents || []).map((document: any) => document.google_drive_file_id).filter(Boolean))];
      for (const fileId of fileIds) {
        driveDeletes.push(await deleteDriveFile(fileId, "project_document_file"));
      }
    }

    const { error: deleteError } = await supabaseAdmin
      .from("projects")
      .delete()
      .eq("id", projectId);

    if (deleteError) throw deleteError;

    await supabaseAdmin.from("activity_logs").insert({
      actor_id: permission.userId,
      action: "PROJECT_DELETED",
      before_state: {
        project,
        document_count: (documents || []).length,
      },
      after_state: {
        deleted_project_id: projectId,
        drive_deletes: driveDeletes,
      },
      related_entity_type: "projects",
      related_entity_id: projectId,
      metadata: {
        source: "system_admin_project_delete",
        customer_code: project.customer_code,
        customer_name: project.customer_name,
      },
    });

    return NextResponse.json({
      success: true,
      deletedProjectId: projectId,
      driveDeletes,
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error("Delete Project API Error:", message, error);
    return NextResponse.json({ error: `Delete project failed: ${message}` }, { status: 500 });
  }
}
