import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeRequest } from "@/lib/api-permissions";
import { createDriveClient, googleDriveAuthErrorMessage, isGoogleDriveAuthError } from "@/lib/google-drive";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(request: Request) {
  const permission = await authorizeRequest(supabaseAdmin, request, [
    "admin",
    "supervisor",
    "ops",
    "sales",
    "engineer",
    "finance",
    "qa",
    "contractor",
    "rcm",
    "sbc",
  ]);
  if (!permission.ok) return permission.response;

  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get("fileId");

  if (!fileId) return new NextResponse("Missing fileId", { status: 400 });

  try {
    const drive = createDriveClient();
    const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });

    if (!res.data) return new NextResponse("Not found", { status: 404 });

    const fileMetadata = await drive.files.get({ fileId, fields: "mimeType" });
    const mimeType = fileMetadata.data.mimeType || "image/jpeg";

    return new NextResponse(res.data as ArrayBuffer, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Image Proxy Error:", message);
    if (isGoogleDriveAuthError(error)) return new NextResponse(googleDriveAuthErrorMessage(), { status: 401 });
    return new NextResponse("Error loading image", { status: 500 });
  }
}
