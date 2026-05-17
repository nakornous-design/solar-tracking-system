import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { productionReadinessSummary } from "@/lib/readiness";
import { createDriveClient, googleDriveAuthErrorMessage, isGoogleDriveAuthError } from "@/lib/google-drive";

export async function GET() {
  const env = productionReadinessSummary();
  if (!env.ok) {
    return NextResponse.json(
      {
        ok: false,
        status: "misconfigured",
        missingEnv: env.missing,
        warnings: env.warnings,
        driveCredentialMode: env.driveCredentialMode,
        deferred: env.deferred,
      },
      { status: 503 },
    );
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const startedAt = Date.now();
  const { error } = await supabaseAdmin
    .from("workflow_versions")
    .select("id")
    .limit(1);

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "database_unavailable",
        error: error.message,
        warnings: env.warnings,
        driveCredentialMode: env.driveCredentialMode,
        deferred: env.deferred,
      },
      { status: 503 },
    );
  }

  try {
    const drive = createDriveClient();
    await drive.files.get({
      fileId: process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID!,
      fields: "id,name,mimeType",
    });
  } catch (driveError: unknown) {
    const errorMessage = driveError instanceof Error ? driveError.message : "Unknown Drive error";
    return NextResponse.json(
      {
        ok: false,
        status: "drive_unavailable",
        error: isGoogleDriveAuthError(driveError) ? googleDriveAuthErrorMessage() : errorMessage,
        warnings: env.warnings,
        driveCredentialMode: env.driveCredentialMode,
        deferred: env.deferred,
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    status: "ready",
    checks: {
      env: "ok",
      database: "ok",
      drive: "ok",
    },
    warnings: env.warnings,
    driveCredentialMode: env.driveCredentialMode,
    latencyMs: Date.now() - startedAt,
    deferred: env.deferred,
  });
}
