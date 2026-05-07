import { NextResponse } from 'next/server';
import { google } from 'googleapis';

// 1. ตั้งค่าการยืนยันตัวตนด้วย Google OAuth2 (สวมรอยเป็นผู้ใช้จริง)
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
    const body = await request.json();
    const { customerCode } = body;

    // ตรวจสอบว่ามีการส่ง Customer Code มาหรือไม่
    if (!customerCode) {
      return NextResponse.json(
        { error: 'Bad Request: Missing customerCode' }, 
        { status: 400 }
      );
    }

    // 2. สร้าง Root Folder โดยใช้ชื่อเป็น Customer Code
    const parentFolderId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;
    const rootFolderMetadata: any = {
      name: customerCode,
      mimeType: 'application/vnd.google-apps.folder',
    };
    
    // หากมีการระบุ Parent Folder ให้ไปสร้างไว้ในนั้น
    if (parentFolderId) {
      rootFolderMetadata.parents = [parentFolderId];
    }

    const rootFolder = await drive.files.create({
      requestBody: rootFolderMetadata,
      fields: 'id',
    });

    const rootFolderId = rootFolder.data.id;

    // 3. กำหนดรายชื่อ 6 โฟลเดอร์ย่อยตามโครงสร้างที่ออกแบบไว้
    const subFolders = [
      "01_Sales_Commercial",
      "02_Survey_TSSR",
      "03_Loan_Documents",
      "04_Installation_Photos",
      "05_Site_Folder_Handover",
      "06_Billing_Finance"
    ];

    // 4. วนลูปเพื่อสร้างโฟลเดอร์ย่อยทั้งหมดเข้าไปใน Root Folder
    const createdSubFolders: any[] = [];
    
    // ใช้ Promise.all เพื่อสร้างโฟลเดอร์พร้อมกัน (เร็วกว่าสร้างทีละอัน)
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
        createdSubFolders.push(sub.data);
      })
    );

    // 5. ส่ง ID ของ Root Folder กลับไป เพื่อนำไปอัปเดตลงตาราง projects ใน Supabase
    return NextResponse.json({
      success: true,
      rootFolderId: rootFolderId,
      subFolders: createdSubFolders
    }, { status: 200 });

  } catch (error: any) {
    console.error('Google Drive API Error:', error.message);
    return NextResponse.json(
      { error: 'Internal Server Error: Failed to create folders - ' + error.message }, 
      { status: 500 }
    );
  }
}