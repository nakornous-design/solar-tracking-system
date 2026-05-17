import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createProjectFolders } from '@/services/drive/folderEngine';
import { authorizeRequest } from '@/lib/api-permissions';
import { googleDriveAuthErrorMessage, isGoogleDriveAuthError } from '@/lib/google-drive';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(request: Request) {
  try {
    const permission = await authorizeRequest(supabaseAdmin, request, ['admin', 'ops', 'sales', 'sbc']);
    if (!permission.ok) return permission.response;

    const body = await request.json();
    const { customerCode, projectId } = body;

    if (!customerCode) {
      return NextResponse.json(
        { error: 'Bad Request: Missing customerCode' }, 
        { status: 400 }
      );
    }

    let folderCustomerCode = customerCode;

    if (projectId) {
      const { data: existingProject, error: existingProjectError } = await supabaseAdmin
        .from('projects')
        .select('customer_code, google_drive_folder_id, drive_metadata')
        .eq('id', projectId)
        .single();

      if (existingProjectError || !existingProject) {
        return NextResponse.json({ error: 'Project was not found.' }, { status: 404 });
      }

      folderCustomerCode = existingProject.customer_code || customerCode;

      if (existingProject?.google_drive_folder_id) {
        return NextResponse.json({
          success: true,
          created: false,
          rootFolderId: existingProject.google_drive_folder_id,
          driveMetadata: existingProject.drive_metadata || {},
          subFolders: existingProject.drive_metadata?.folders || {},
        }, { status: 200 });
      }
    }

    const result = await createProjectFolders(supabaseAdmin, folderCustomerCode, projectId);

    return NextResponse.json({
      success: true,
      created: true,
      ...result
    }, { status: 200 });

  } catch (error: any) {
    console.error('Google Drive API Error:', error.message);
    if (isGoogleDriveAuthError(error)) {
      return NextResponse.json(
        { error: googleDriveAuthErrorMessage() },
        { status: 401 },
      );
    }
    return NextResponse.json(
      { error: 'Internal Server Error: Failed to create folders - ' + error.message }, 
      { status: 500 }
    );
  }
}
