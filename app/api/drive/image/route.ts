import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get('fileId');

  if (!fileId) return new NextResponse('Missing fileId', { status: 400 });

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground"
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
  
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  try {
    // ดึงข้อมูลไฟล์แบบ Media (ดาวน์โหลดเนื้อหาไฟล์)
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    
    if (!res.data) return new NextResponse('Not found', { status: 404 });
    
    // ดึง MimeType เพื่อบอก Browser ว่าเป็นรูปประเภทไหน
    const fileMetadata = await drive.files.get({ fileId, fields: 'mimeType' });
    const mimeType = fileMetadata.data.mimeType || 'image/jpeg';
    
    // ส่งกลับไปเป็นภาพโดยตรง พร้อม Cache 1 วัน
    return new NextResponse(res.data as ArrayBuffer, {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error: any) {
    console.error('Image Proxy Error:', error.message);
    return new NextResponse('Error loading image', { status: 500 });
  }
}
