import { NextResponse } from 'next/server';
import { Readable } from 'stream';
import { createClient } from '@supabase/supabase-js';
import { authorizeRequest } from '@/lib/api-permissions';
import { attachStageEvidence } from '@/services/workflow/fieldOpsEngine';
import { createDriveClient, googleDriveAuthErrorMessage, isGoogleDriveAuthError } from '@/lib/google-drive';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type ProjectDocumentUploadTarget = {
  id: string;
  project_id: string;
  project_stage_id: string | null;
  code: string;
  name: string;
  status: string;
  requires_verification: boolean;
  version_number: number;
  google_drive_folder_id: string | null;
  metadata: Record<string, unknown>;
};

export async function POST(request: Request) {
  try {
    const permission = await authorizeRequest(supabaseAdmin, request, ['admin', 'supervisor', 'ops', 'sales', 'engineer', 'finance', 'qa', 'contractor', 'rcm', 'sbc']);
    if (!permission.ok) return permission.response;

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const folderId = formData.get('folderId') as string;
    const milestoneName = String(formData.get('milestoneName') || 'Evidence');
    const projectDocumentId = formData.get('projectDocumentId') as string | null;
    const projectStageId = formData.get('projectStageId') as string | null;

    if (!file || !folderId) {
      return NextResponse.json({ error: 'Missing file or folderId' }, { status: 400 });
    }

    const drive = createDriveClient();

    // 1. ค้นหาโฟลเดอร์ย่อยทั้งหมดที่อยู่ใน Root Folder นี้
    const resFolders = await drive.files.list({
      q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
    });
    const subFolders = resFolders.data.files || [];

    // 2. วิเคราะห์หาโฟลเดอร์ย่อยที่เหมาะสมจากชื่อ Milestone (Keyword Matching)
    let targetFolderId = folderId; // ค่าเริ่มต้นคือ Root Folder
    let keyword = "01_Sales_Commercial"; // Default
    let documentName = milestoneName;
    let projectDocument: ProjectDocumentUploadTarget | null = null;

    if (projectDocumentId) {
      const { data: fetchedProjectDocument, error: projectDocumentError } = await supabaseAdmin
        .from('project_documents')
        .select('id, project_id, project_stage_id, code, name, status, requires_verification, version_number, google_drive_folder_id, metadata')
        .eq('id', projectDocumentId)
        .single();

      if (projectDocumentError) throw projectDocumentError;

      projectDocument = fetchedProjectDocument as ProjectDocumentUploadTarget;

      if (projectDocument.status === 'REJECTED') {
        return NextResponse.json(
          { error: 'Rejected documents require a new document version before upload.' },
          { status: 409 },
        );
      }

      if (projectDocument.status === 'SUPERSEDED') {
        return NextResponse.json(
          { error: 'Cannot upload to a superseded document version.' },
          { status: 409 },
        );
      }

      if (projectDocument.status === 'VERIFIED') {
        return NextResponse.json(
          { error: 'Verified documents cannot be overwritten.' },
          { status: 409 },
        );
      }

      documentName = projectDocument?.name || projectDocument?.code || milestoneName;
      if (projectDocument?.google_drive_folder_id) {
        targetFolderId = projectDocument.google_drive_folder_id;
      } else {
        const driveFolderKey =
          typeof projectDocument?.metadata?.drive_folder_key === 'string'
            ? projectDocument.metadata.drive_folder_key
            : null;
        const matchedDocumentFolder = driveFolderKey
          ? subFolders.find(f => f.name && f.name.includes(driveFolderKey))
          : null;

        if (matchedDocumentFolder?.id) {
          targetFolderId = matchedDocumentFolder.id;
        }
      }
    }
    
    const mName = milestoneName.toLowerCase();
    if (mName.includes("survey") || mName.includes("tssr")) {
      keyword = "02_Survey_TSSR";
    } else if (mName.includes("loan") || mName.includes("deposit") || mName.includes("contract")) {
      keyword = "03_Loan_Documents";
    } else if (mName.includes("install") || mName.includes("test") || mName.includes("ready")) {
      keyword = "04_Installation_Photos";
    } else if (mName.includes("handover")) {
      keyword = "05_Site_Folder_Handover";
    } else if (mName.includes("billing") || mName.includes("paid") || mName.includes("payment")) {
      keyword = "06_Billing_Finance";
    }

    // หา ID ของโฟลเดอร์ย่อยที่ตรงกับ Keyword
    const matchedFolder = subFolders.find(f => f.name && f.name.includes(keyword));
    if (!projectDocumentId && matchedFolder && matchedFolder.id) {
      targetFolderId = matchedFolder.id;
    }

    // แปลง File เป็น Buffer เพื่อให้ Google Drive API อัปโหลดได้
    const buffer = Buffer.from(await file.arrayBuffer());
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    // ทำการอัปโหลดเข้า Google Drive ใน Folder ย่อยที่วิเคราะห์ได้
    const driveRes = await drive.files.create({
      requestBody: {
        name: `[${documentName}] ${file.name}`,
        parents: [targetFolderId], // เปลี่ยนจาก folderId (Root) เป็น targetFolderId (Sub-folder)
      },
      media: {
        mimeType: file.type,
        body: stream,
      },
      fields: 'id, webViewLink',
    });

    if (projectDocumentId) {
      const nextDocumentStatus = projectDocument?.requires_verification ? 'PENDING_VERIFY' : 'UPLOADED';
      const { error: projectDocumentUpdateError } = await supabaseAdmin
        .from('project_documents')
        .update({
          status: nextDocumentStatus,
          google_drive_file_id: driveRes.data.id,
          google_drive_folder_id: targetFolderId,
          web_view_link: driveRes.data.webViewLink,
          mime_type: file.type,
          file_name: file.name,
          uploaded_by: permission.userId,
          uploaded_at: new Date().toISOString(),
        })
        .eq('id', projectDocumentId);

      if (projectDocumentUpdateError) throw projectDocumentUpdateError;

      if (projectDocument) {
        await supabaseAdmin.from('activity_logs').insert({
          project_id: projectDocument.project_id,
          project_stage_id: projectDocument.project_stage_id,
          action: 'DOCUMENT_UPLOADED',
          actor_id: permission.userId,
          before_state: {
            document_id: projectDocumentId,
            status: projectDocument.status,
            version_number: projectDocument.version_number,
          },
          after_state: {
            document_id: projectDocumentId,
            status: nextDocumentStatus,
            google_drive_file_id: driveRes.data.id,
          },
          related_entity_type: 'project_documents',
          related_entity_id: projectDocumentId,
          metadata: {
            code: projectDocument.code,
            name: projectDocument.name,
            file_name: file.name,
            mime_type: file.type,
          },
        });
      }
    } else if (projectStageId) {
      const evidenceResult = await attachStageEvidence(supabaseAdmin, {
        projectStageId,
        fileId: String(driveRes.data.id || ''),
        name: file.name,
        webViewLink: driveRes.data.webViewLink || null,
        folderId: targetFolderId,
        mimeType: file.type,
        actorUserId: permission.userId,
      });

      if (!evidenceResult.ok) {
        return NextResponse.json(evidenceResult, { status: evidenceResult.status });
      }
    }

    return NextResponse.json({
      success: true,
      fileId: driveRes.data.id,
      webViewLink: driveRes.data.webViewLink,
      folderId: targetFolderId,
    });
  } catch (error: any) {
    console.error('Upload API Error:', error);
    if (isGoogleDriveAuthError(error)) {
      return NextResponse.json({ error: googleDriveAuthErrorMessage() }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to upload: ' + error.message }, { status: 500 });
  }
}
