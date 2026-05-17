# UAT Checklist & Test Cases

Solar Project Tracking System

Version: 1.0  
Scope: MVP RES-S workflow, quotation finance branch, CASH / LOAN path, runtime gates, Drive folder, QA, billing, closure

---

## 1. Pre-Test Checklist

ก่อนเริ่มทดสอบ ให้ตรวจรายการนี้ก่อนทุกครั้ง

- [ ] Supabase มี published workflow version ที่ active
- [ ] Supabase มี installation standard ที่ active เช่น `V8R2`
- [ ] ไม่มี project test เก่าค้างในหน้า Project List
- [ ] Google Drive parent folder พร้อมใช้งาน
- [ ] `.env.local` มีค่า Supabase และ Google Drive ครบ
- [ ] ผู้ทดสอบ login ได้ หรือ local advisory mode ใช้งานได้
- [ ] Browser เปิด DevTools Console ไว้เพื่อตรวจ error
- [ ] เริ่มจากหน้า Dashboard แล้วกด refresh หนึ่งครั้ง

---

## 2. Smoke Checklist

ใช้ชุดนี้เป็น quick pass หลัง deploy หรือหลังแก้โค้ดสำคัญ

- [ ] สร้าง project ใหม่ได้
- [ ] Runtime workflow ถูกสร้างอัตโนมัติ
- [ ] Google Drive folder ถูกสร้างและผูกกับ project
- [ ] Stage แรกเริ่มเป็น `รับข้อมูลลูกค้า`
- [ ] กดผ่าน checklist ได้
- [ ] Gate ที่ยังไม่ครบ block transition ได้
- [ ] Request override ได้เมื่อ gate เป็น overrideable
- [ ] เลือก branch เงินสด/สินเชื่อที่ `ใบเสนอราคา` ได้
- [ ] CASH project ไม่แสดง stage สินเชื่อใน timeline
- [ ] LOAN project ไม่แสดง stage ชำระเงินสดใน timeline
- [ ] Upload document/photo ได้
- [ ] Verify document ได้
- [ ] QA pass แล้วไป Handover ได้
- [ ] Billing approve แล้วไป Closure ได้
- [ ] Closure ปิด project เป็น `COMPLETED` ได้

---

## 3. Test Data

ใช้รูปแบบ customer code ที่ไม่ซ้ำ เช่น:

| Field | CASH Test | LOAN Test |
| --- | --- | --- |
| Customer Code | `UAT-CASH-001` | `UAT-LOAN-001` |
| Customer Name | `ลูกค้าทดสอบ เงินสด` | `ลูกค้าทดสอบ สินเชื่อ` |
| Phone | `0800000001` | `0800000002` |
| Project Type | `RES-S` | `RES-S` |

ไฟล์ทดสอบ:

- รูป survey อย่างน้อย 1 ไฟล์
- รูป installation อย่างน้อย 4-5 ไฟล์
- เอกสาร PDF หรือรูปสำหรับ contract/payment/PAC/FBOQ

---

## 4. Test Cases

### TC-001 Create Project

Objective: ตรวจว่าสร้าง project และ runtime workflow ได้ถูกต้อง

Steps:
1. เปิดหน้า Project List
2. กดสร้าง project ใหม่
3. กรอก customer code, customer name, phone
4. เลือก project type `RES-S`
5. บันทึก

Expected:
- Project ถูกสร้างสำเร็จ
- Project อยู่ในสถานะ `IN_PROGRESS`
- Stage แรกเป็น `รับข้อมูลลูกค้า`
- Timeline แสดง workflow runtime
- มี Drive folder id หรือ setup folder สำเร็จ

---

### TC-002 Duplicate Project Protection

Objective: ตรวจว่าระบบกัน customer code ซ้ำ

Steps:
1. สร้าง project ด้วย customer code เดิม
2. กดบันทึก

Expected:
- ระบบไม่สร้าง project ซ้ำ
- แสดง error ว่า customer code ถูกใช้แล้ว

---

### TC-003 Lead Gate

Objective: ตรวจ hard gate ของ stage รับข้อมูลลูกค้า

Lead checklist ที่ควรตรวจ:
- ข้อมูลลูกค้าครบถ้วน: ชื่อลูกค้า / ผู้ติดต่อ / เบอร์โทร
- ยืนยันเบอร์ติดต่อและช่องทางติดต่อแล้ว
- บันทึกที่อยู่ติดตั้ง / จังหวัด / พิกัด หรือ Google Maps แล้ว
- ยืนยันประเภทโครงการ RES-S และขอบเขตงานเบื้องต้นแล้ว
- ตรวจสอบ customer code / เบอร์โทร ไม่ซ้ำกับโครงการเดิมแล้ว
- บันทึก requirement เบื้องต้น เช่น ขนาดที่สนใจ ค่าไฟ หรือหมายเหตุฝ่ายขายแล้ว

Steps:
1. เปิด project ที่สร้างใหม่
2. ที่ stage `รับข้อมูลลูกค้า` กดปิดขั้นตอนก่อนผ่าน checklist
3. ผ่าน checklist ของ stage
4. กดปิดขั้นตอนอีกครั้ง

Expected:
- ครั้งแรกถูก block ด้วย gate
- หลัง checklist ผ่าน stage เปลี่ยนเป็น completed
- Stage ถัดไป `สำรวจหน้างาน` เป็น active

---

### TC-004 Survey Gate And Override

Objective: ตรวจ gate เอกสาร/รูป และ override flow

Steps:
1. ไปที่ stage `สำรวจหน้างาน`
2. กดปิดขั้นตอนโดยยังไม่ upload เอกสาร/รูป
3. ตรวจ Gate Block modal
4. ถ้ามี overrideable gate ให้ request override พร้อม reason
5. Approve override ใน Approval Center
6. กดปิดขั้นตอนอีกครั้ง

Expected:
- Gate block แสดงรายการที่ขาด
- Approval request ถูกสร้าง
- เมื่อ approve แล้ว transition ผ่านได้ตาม policy

---

### TC-005 Technical Design / TSSR

Objective: ตรวจขั้นตอนออกแบบทางเทคนิค

Steps:
1. เปิด stage `ออกแบบทางเทคนิค`
2. ผ่าน checklist ที่จำเป็น
3. Upload เอกสาร SLD/BOQ ถ้ามี gate เอกสาร
4. Verify เอกสาร
5. กดปิดขั้นตอน

Expected:
- Gate ครบ
- Stage completed
- ไปที่ `ใบเสนอราคา`

---

### TC-006 Quotation Branch To CASH

Objective: ตรวจว่า branch เงินสดเลือกที่ stage ใบเสนอราคา

Steps:
1. เปิด stage `ใบเสนอราคา`
2. Upload/verify contract หรือเอกสาร quotation ที่ required
3. ใน drawer stage เลือก `เงินสด`
4. ใส่ reason เช่น `ลูกค้าเลือกชำระเงินสด`
5. Confirm
6. กดปิด stage `ใบเสนอราคา`

Expected:
- `payment_type` เป็น `CASH`
- current stage ยังอยู่ที่ `ใบเสนอราคา` หลังเลือก branch
- หลังปิด `ใบเสนอราคา` stage ถัดไปคือ `ชำระเงินสด`
- Timeline ไม่แสดง `เอกสารสินเชื่อ`, `ยื่นสินเชื่อ`, `ติดตามสินเชื่อ`, `อนุมัติสินเชื่อ`, `เงินดาวน์`

---

### TC-007 Quotation Branch To LOAN

Objective: ตรวจว่า branch สินเชื่อ/เงินผ่อนเลือกที่ stage ใบเสนอราคา

Steps:
1. สร้าง project ใหม่สำหรับ loan test
2. เดินงานมาถึง stage `ใบเสนอราคา`
3. เลือก `สินเชื่อ/เงินผ่อน`
4. ใส่ reason เช่น `ลูกค้าเลือกผ่อนผ่านสินเชื่อ`
5. Confirm
6. กดปิด stage `ใบเสนอราคา`

Expected:
- `payment_type` เป็น `LOAN`
- current stage ยังอยู่ที่ `ใบเสนอราคา` หลังเลือก branch
- หลังปิด `ใบเสนอราคา` stage ถัดไปคือ `เอกสารสินเชื่อ`
- Timeline ไม่แสดง `ชำระเงินสด`

---

### TC-008 Switch Finance Path Before Closing Quotation

Objective: ตรวจว่าสลับ path ได้ก่อนปิดใบเสนอราคา

Steps:
1. อยู่ที่ stage `ใบเสนอราคา`
2. เลือก `เงินสด`
3. Confirm
4. เลือก `สินเชื่อ/เงินผ่อน`
5. Confirm
6. เลือกกลับเป็น `เงินสด`
7. กดปิด stage

Expected:
- ระบบสลับ branch ได้ทุกครั้งก่อนปิด stage
- current stage ไม่กระโดดออกจาก `ใบเสนอราคา`
- หลังปิด stage วิ่งไป path ล่าสุดที่เลือก
- Activity log มีรายการเปลี่ยน finance path

---

### TC-009 CASH Payment

Objective: ตรวจ payment gate สำหรับเงินสด

Steps:
1. เปิด stage `ชำระเงินสด`
2. กดปิดขั้นตอนก่อน upload payment proof
3. Upload payment proof
4. Verify document
5. ผ่าน checklist payment
6. กดปิดขั้นตอน

Expected:
- ถ้า payment proof ยังไม่ครบ ระบบ block
- เมื่อครบแล้วไป `พร้อมติดตั้ง` หรือ stage ถัดไปตาม workflow

---

### TC-010 LOAN Document Flow

Objective: ตรวจ loan path

Steps:
1. เปิด stage `เอกสารสินเชื่อ`
2. Upload loan documents
3. Verify documents
4. ผ่าน checklist
5. ปิด stage ไป `ยื่นสินเชื่อ`
6. ทำต่อจนถึง `อนุมัติสินเชื่อ`

Expected:
- แต่ละ stage มี gate ตามที่กำหนด
- ไม่มี stage เงินสดแทรกใน timeline
- ถ้าเอกสารขาด ระบบ block

---

### TC-011 Loan Rejected Cash Fallback

Objective: ตรวจกรณีสินเชื่อไม่ผ่านแล้วเสนอเงินสด

Steps:
1. อยู่ใน loan decision stage เช่น `ยื่นสินเชื่อ`, `ติดตามสินเชื่อ`, หรือ `อนุมัติสินเชื่อ`
2. กด action `สินเชื่อไม่ผ่าน เสนอเงินสด`
3. ใส่ reason
4. Confirm
5. เลือก `ลูกค้ารับเงินสด`

Expected:
- Project เปลี่ยนเป็น `CASH`
- Loan branch ที่เหลือถูก skipped
- ระบบพาไป stage payment/cash fallback target
- มี exception/activity log รองรับ audit

---

### TC-012 Scheduling And Installation

Objective: ตรวจ field operation และ scheduling

Steps:
1. เดินงานถึง `พร้อมติดตั้ง`
2. ผ่าน checklist material/team ready
3. ปิดไป `จัดตาราง`
4. กำหนดวันและทีม
5. ปิดไป `ติดตั้ง`
6. Check-in หน้างาน
7. Upload installation photos
8. ผ่าน checklist installation
9. กด submit/ปิดขั้นตอน

Expected:
- Schedule metadata ถูกบันทึก
- Field job แสดงในหน้าหน้างาน
- Installation photo gates ครบก่อนเข้า QA

---

### TC-013 QA Pass

Objective: ตรวจ QA pass flow

Steps:
1. เปิด stage `QA`
2. ผ่าน QA checklist ทุกข้อ
3. กด `ผ่าน QA`

Expected:
- QA stage completed
- Project ไป `ส่งมอบ`
- ไม่มี QA exception ใหม่

---

### TC-014 QA Fail / Rework

Objective: ตรวจ QA fail และ rework loop

Steps:
1. เปิด stage `QA`
2. กด `ไม่ผ่าน QA` หรือ `ส่งกลับแก้งาน`
3. ใส่ reason
4. Confirm

Expected:
- QA exception ถูกสร้าง
- Workflow กลับไป stage installation/rework target
- Activity log เก็บ reason

---

### TC-015 Handover

Objective: ตรวจส่งมอบลูกค้า

Steps:
1. เปิด stage `ส่งมอบ`
2. Upload/verify customer acceptance ถ้ามี
3. ผ่าน checklist
4. กดปิดขั้นตอน

Expected:
- Stage completed
- ไป `วางบิล`

---

### TC-016 Billing Approve

Objective: ตรวจ billing approve

Steps:
1. เปิด stage `วางบิล`
2. Upload invoice, PAC, FBOQ
3. Verify required documents
4. ผ่าน billing checklist
5. กด `อนุมัติวางบิล`

Expected:
- Billing completed
- Project ไป `ปิดโครงการ`

---

### TC-017 Billing Reject

Objective: ตรวจ billing reject/rework

Steps:
1. เปิด stage `วางบิล`
2. กด `ตีกลับวางบิล`
3. ใส่ reason
4. Confirm

Expected:
- Billing exception ถูกสร้าง
- Workflow กลับไป handover/rework target
- Activity log มี reject reason

---

### TC-018 Closure

Objective: ตรวจปิด project

Steps:
1. เปิด stage `ปิดโครงการ`
2. ผ่าน closure checklist ถ้ามี
3. กดปิดขั้นตอน

Expected:
- Closure stage completed
- Project status เป็น `COMPLETED`
- current stage เป็น empty/null
- ไม่ขึ้น error `No configured forward transition exists`

---

### TC-019 Document Versioning

Objective: ตรวจเอกสารถูกตีกลับและสร้าง version ใหม่

Steps:
1. Upload document ที่ stage ใดก็ได้
2. กด reject พร้อม reason
3. กดสร้าง version ใหม่
4. Upload เอกสารใหม่
5. Verify

Expected:
- เอกสารเก่าถูก superseded หรือไม่ใช้เป็น active version
- เอกสารใหม่เป็น active version
- Gate ใช้ version ใหม่ในการ validate

---

### TC-020 Notifications And Activity Logs

Objective: ตรวจ auditability

Steps:
1. ทำ action หลายแบบ เช่น transition, gate block, override, QA fail, billing approve
2. เปิด notification panel/activity section

Expected:
- มี notification สำหรับ owner ที่เกี่ยวข้อง
- Activity log เก็บ action, reason, before/after state สำคัญ
- ไม่มี activity log ผิด project

---

## 5. Regression Checklist

ใช้หลังแก้ bug ทุกครั้ง

- [ ] ปิด project ที่ Closure ได้
- [ ] CASH timeline ไม่โชว์ loan stages
- [ ] LOAN timeline ไม่โชว์ cash payment stage
- [ ] เลือก/switch path ที่ Quotation ได้
- [ ] Switch path ไม่ทำให้ current stage หลุดจาก Quotation ก่อนปิด stage
- [ ] Gate block ยังทำงานหลัง switch path
- [ ] QA rework ยังย้อน stage ถูก
- [ ] Billing approve ยังไป Closure
- [ ] Drive folder สร้างครบ 6 folder
- [ ] Project deletion/cleanup ลบข้อมูล runtime ได้ครบ

---

## 6. Exit Criteria

ถือว่ารอบ UAT ผ่านเมื่อ:

- [ ] Smoke checklist ผ่านครบ
- [ ] CASH happy path ผ่านถึง Closure
- [ ] LOAN happy path ผ่านถึง Closure หรือผ่านถึง loan approval ตาม scope ที่กำหนด
- [ ] อย่างน้อย 1 เคส gate block ผ่าน
- [ ] อย่างน้อย 1 เคส override ผ่าน
- [ ] อย่างน้อย 1 เคส QA rework ผ่าน
- [ ] อย่างน้อย 1 เคส billing reject ผ่าน
- [ ] ไม่มี console error ระหว่าง flow หลัก
- [ ] ไม่มี orphan project/folder หลัง cleanup

---

## 7. Test Result Template

คัดลอกตารางนี้ใช้บันทึกผลได้

| Test Case | Result | Tester | Date | Notes / Bug Link |
| --- | --- | --- | --- | --- |
| TC-001 | PASS / FAIL | | | |
| TC-002 | PASS / FAIL | | | |
| TC-003 | PASS / FAIL | | | |
| TC-004 | PASS / FAIL | | | |
| TC-005 | PASS / FAIL | | | |
| TC-006 | PASS / FAIL | | | |
| TC-007 | PASS / FAIL | | | |
| TC-008 | PASS / FAIL | | | |
| TC-009 | PASS / FAIL | | | |
| TC-010 | PASS / FAIL | | | |
| TC-011 | PASS / FAIL | | | |
| TC-012 | PASS / FAIL | | | |
| TC-013 | PASS / FAIL | | | |
| TC-014 | PASS / FAIL | | | |
| TC-015 | PASS / FAIL | | | |
| TC-016 | PASS / FAIL | | | |
| TC-017 | PASS / FAIL | | | |
| TC-018 | PASS / FAIL | | | |
| TC-019 | PASS / FAIL | | | |
| TC-020 | PASS / FAIL | | | |
