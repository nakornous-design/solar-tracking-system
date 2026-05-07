import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 1. สร้างตัวเชื่อมต่อ Supabase ระดับ Admin (มีสิทธิ์จัดการตารางทั้งหมด)
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
    try {
        // รับข้อมูลจาก Frontend เมื่อผู้ใช้กดปุ่ม Submit
        const body = await request.json();
        const { customerCode, customerName, templateId, standardId } = body;

        // ตรวจสอบความถูกต้องของข้อมูลเบื้องต้น (Validation)
        if (!customerCode || !customerName) {
            return NextResponse.json(
                { error: 'กรุณากรอกรหัสลูกค้าและชื่อลูกค้าให้ครบถ้วน' },
                { status: 400 }
            );
        }

        // 2. Insert ข้อมูลลงตาราง projects
        const { data: newProject, error: projectError } = await supabaseAdmin
            .from('projects')
            .insert([
                {
                    customer_code: customerCode,
                    customer_name: customerName,
                    workflow_template_id: templateId || null,
                    applied_standard_id: standardId || 'V8R2', // Snapshot มาตรฐาน V8R2 ติดโปรเจกต์ไว้
                    status: 'Lead Registered'
                }
            ])
            .select()
            .single();

        if (projectError) throw projectError;

        // 3. 🪄 Magic Step: กาง Milestone อัตโนมัติ (Auto-Assignment)
        if (templateId) {
            // 3.1 ไปดึง "พิมพ์เขียว" (17 ขั้นตอน) จาก template ที่เลือก
            const { data: steps, error: stepsError } = await supabaseAdmin
                .from('workflow_definitions')
                .select('id, sla_hours')
                .eq('template_id', templateId);

            if (!stepsError && steps && steps.length > 0) {
                // 3.2 จับคู่ ID ของโปรเจกต์ใหม่ เข้ากับ ขั้นตอนทั้ง 17 ขั้นตอน
                const milestonesToInsert = steps.map((step) => ({
                    project_id: newProject.id,
                    step_id: step.id,
                    sla_status: 'On-track' // เริ่มต้นให้เป็นสถานะปกติทั้งหมด
                }));

                // 3.3 Insert ลงตาราง project_milestones รวดเดียว
                await supabaseAdmin.from('project_milestones').insert(milestonesToInsert);
            }
        }

        // 4. ส่งข้อมูลโปรเจกต์ใหม่กลับไปให้ Frontend
        return NextResponse.json({
            success: true,
            project: newProject,
            message: 'สร้างโปรเจกต์และกาง Milestone สำเร็จ!'
        }, { status: 201 });

    } catch (error: any) {
        console.error('Create Project API Error:', error.message);
        return NextResponse.json(
            { error: 'เกิดข้อผิดพลาดในการสร้างโปรเจกต์: ' + error.message },
            { status: 500 }
        );
    }
}