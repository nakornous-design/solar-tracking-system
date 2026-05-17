-- Expand Lead / customer intake gates into auditable checklist items.
-- Payment path is intentionally decided later at Quotation.

do $$
declare
  stage_rec record;
  checklist_rec record;
begin
  for stage_rec in
    select id
    from workflow_stages
    where code = 'LEAD'
      and is_active = true
  loop
    for checklist_rec in
      select * from (values
        ('CUSTOMER_PROFILE_CAPTURED', 'ข้อมูลลูกค้าครบถ้วน: ชื่อลูกค้า / ผู้ติดต่อ / เบอร์โทร', 1, 'HARD'),
        ('CONTACT_VERIFIED', 'ยืนยันเบอร์ติดต่อและช่องทางติดต่อแล้ว', 2, 'HARD'),
        ('SITE_ADDRESS_CAPTURED', 'บันทึกที่อยู่ติดตั้ง / จังหวัด / พิกัด หรือ Google Maps แล้ว', 3, 'HARD'),
        ('PROJECT_TYPE_CONFIRMED', 'ยืนยันประเภทโครงการ RES-S และขอบเขตงานเบื้องต้นแล้ว', 4, 'HARD'),
        ('DUPLICATE_CHECKED', 'ตรวจสอบ customer code / เบอร์โทร ไม่ซ้ำกับโครงการเดิมแล้ว', 5, 'HARD'),
        ('INITIAL_REQUIREMENT_CAPTURED', 'บันทึก requirement เบื้องต้น เช่น ขนาดที่สนใจ ค่าไฟ หรือหมายเหตุฝ่ายขายแล้ว', 6, 'HARD')
      ) as c(code, label, order_index, gate_severity)
    loop
      insert into workflow_checklists (
        workflow_stage_id,
        code,
        label,
        is_required,
        gate_severity,
        order_index
      )
      values (
        stage_rec.id,
        checklist_rec.code,
        checklist_rec.label,
        true,
        checklist_rec.gate_severity::gate_severity,
        checklist_rec.order_index
      )
      on conflict (workflow_stage_id, code) do update
      set
        label = excluded.label,
        is_required = excluded.is_required,
        gate_severity = excluded.gate_severity,
        order_index = excluded.order_index,
        updated_at = now();
    end loop;

    update workflow_checklists
    set
      label = 'ข้อมูลลูกค้าเริ่มต้นถูกสร้างในระบบแล้ว',
      order_index = 0,
      updated_at = now()
    where workflow_stage_id = stage_rec.id
      and code = 'CUSTOMER_REGISTERED';
  end loop;
end $$;

insert into project_checklists (
  project_id,
  project_stage_id,
  workflow_checklist_id,
  code,
  label,
  is_required,
  gate_severity,
  status
)
select
  ps.project_id,
  ps.id,
  wc.id,
  wc.code,
  wc.label,
  wc.is_required,
  wc.gate_severity,
  'PENDING'::checklist_status
from project_stages ps
join workflow_checklists wc
  on wc.workflow_stage_id = ps.workflow_stage_id
where ps.code = 'LEAD'
  and not exists (
    select 1
    from project_checklists existing
    where existing.project_stage_id = ps.id
      and existing.workflow_checklist_id = wc.id
  );
