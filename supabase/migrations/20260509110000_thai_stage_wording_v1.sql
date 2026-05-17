-- Thai UX wording for the active unified RES-S workflow.
-- Backend rules continue to use stage code; names are presentation/admin wording.

update workflow_stages
set name = case code
  when 'LEAD' then 'รับข้อมูลลูกค้า'
  when 'SURVEY' then 'สำรวจหน้างาน'
  when 'TSSR' then 'ออกแบบทางเทคนิค'
  when 'QUOTATION' then 'ใบเสนอราคา'
  when 'PAYMENT' then 'ชำระเงินสด'
  when 'LOAN_DOCUMENT_COLLECTION' then 'เอกสารสินเชื่อ'
  when 'LOAN_SUBMISSION' then 'ยื่นสินเชื่อ'
  when 'LOAN_REVIEW' then 'ติดตามสินเชื่อ'
  when 'LOAN_APPROVAL' then 'อนุมัติสินเชื่อ'
  when 'DOWN_PAYMENT' then 'เงินดาวน์'
  when 'READY_FOR_INSTALL' then 'พร้อมติดตั้ง'
  when 'SCHEDULING' then 'จัดตารางติดตั้ง'
  when 'INSTALLATION' then 'ติดตั้งระบบ'
  when 'QA' then 'ตรวจคุณภาพ'
  when 'HANDOVER' then 'ส่งมอบงาน'
  when 'BILLING' then 'วางบิล'
  when 'CLOSURE' then 'ปิดโครงการ'
  else name
end
where workflow_version_id in (
  select wv.id
  from workflow_versions wv
  join workflow_templates wt on wt.id = wv.workflow_template_id
  where wt.code = 'RES-S-STANDARD'
);
