import { SupabaseClient } from '@supabase/supabase-js';
import { createDriveClient } from '../../lib/google-drive.ts';

export async function createProjectFolders(
  supabaseAdmin: SupabaseClient,
  customerCode: string,
  projectId?: string
) {
  if (!customerCode) {
    throw new Error('Missing customerCode');
  }

  const drive = createDriveClient();

  // Create Root Folder
  const parentFolderId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;
  const rootFolderMetadata: any = {
    name: customerCode,
    mimeType: 'application/vnd.google-apps.folder',
  };
  
  if (parentFolderId) {
    rootFolderMetadata.parents = [parentFolderId];
  }

  const rootFolder = await drive.files.create({
    requestBody: rootFolderMetadata,
    fields: 'id, name, webViewLink',
  });

  const rootFolderId = rootFolder.data.id;

  // Create Sub Folders
  const subFolders = [
    "01_Sales_Commercial",
    "02_Survey_TSSR",
    "03_Loan_Documents",
    "04_Installation_Photos",
    "05_Site_Folder_Handover",
    "06_Billing_Finance"
  ];

  const createdSubFolders: Record<string, { id: string; name: string }> = {};
  
  await Promise.all(
    subFolders.map(async (folderName) => {
      const sub = await drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [rootFolderId!],
        },
        fields: 'id, name',
      });
      if (sub.data.id && sub.data.name) {
        createdSubFolders[folderName] = {
          id: sub.data.id,
          name: sub.data.name,
        };
      }
    })
  );

  const driveMetadata = {
    root: {
      id: rootFolderId,
      name: rootFolder.data.name,
      webViewLink: rootFolder.data.webViewLink,
    },
    folders: createdSubFolders,
  };

  // If projectId is provided, update Supabase metadata
  if (projectId) {
    const { error: projectUpdateError } = await supabaseAdmin
      .from('projects')
      .update({
        google_drive_folder_id: rootFolderId,
        drive_metadata: driveMetadata,
      })
      .eq('id', projectId);

    if (projectUpdateError) throw projectUpdateError;

    const { data: projectDocuments, error: projectDocumentsError } = await supabaseAdmin
      .from('project_documents')
      .select('id, metadata')
      .eq('project_id', projectId);

    if (projectDocumentsError) throw projectDocumentsError;

    await Promise.all(
      (projectDocuments || []).map(async (document) => {
        const driveFolderKey = document.metadata?.drive_folder_key;
        const folderId = driveFolderKey ? createdSubFolders[driveFolderKey]?.id : null;

        if (!folderId) return;

        const { error: documentUpdateError } = await supabaseAdmin
          .from('project_documents')
          .update({ google_drive_folder_id: folderId })
          .eq('id', document.id);

        if (documentUpdateError) throw documentUpdateError;
      }),
    );

    const { error: activityLogError } = await supabaseAdmin.from('activity_logs').insert({
      project_id: projectId,
      action: 'GOOGLE_DRIVE_FOLDERS_CREATED',
      after_state: driveMetadata,
    });

    if (activityLogError) {
      console.warn('Google Drive folder audit log failed:', activityLogError.message);
    }
  }

  return {
    rootFolderId,
    driveMetadata,
    subFolders: createdSubFolders
  };
}
