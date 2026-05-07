import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { Readable } from 'stream';

// ตั้งค่าการยืนยันตัวตนด้วย Google OAuth2 (สวมรอยเป็นผู้ใช้จริง)
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_OAUTH_CLIENT_ID,
  process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const folderId = formData.get('folderId') as string;
    const milestoneName = formData.get('milestoneName') as string;

    if (!file || !folderId) {
      return NextResponse.json({ error: 'Missing file or folderId' }, { status: 400 });
    }

    // 1. ค้นหาโฟลเดอร์ย่อยทั้งหมดที่อยู่ใน Root Folder นี้
    const resFolders = await drive.files.list({
      q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
    });
    const subFolders = resFolders.data.files || [];

    // 2. วิเคราะห์หาโฟลเดอร์ย่อยที่เหมาะสมจากชื่อ Milestone (Keyword Matching)
    let targetFolderId = folderId; // ค่าเริ่มต้นคือ Root Folder
    let keyword = "01_Sales_Commercial"; // Default
    
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
    if (matchedFolder && matchedFolder.id) {
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
        name: `[${milestoneName}] ${file.name}`,
        parents: [targetFolderId], // เปลี่ยนจาก folderId (Root) เป็น targetFolderId (Sub-folder)
      },
      media: {
        mimeType: file.type,
        body: stream,
      },
      fields: 'id, webViewLink',
    });

    return NextResponse.json({
      success: true,
      fileId: driveRes.data.id,
      webViewLink: driveRes.data.webViewLink,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Upload API Error:', message);
    return NextResponse.json({ error: 'Failed to upload: ' + message }, { status: 500 });
  }
}
