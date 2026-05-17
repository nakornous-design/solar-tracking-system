"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { apiFetch } from "../../lib/api-client";
import { canUploadDocument, canVerifyDocument, sortProjectDocuments, statusLabel } from "../../lib/project-ui";

type Props = {
  stage: any;
  project: any;
  loadingId: string | null;
  onClose: () => void;
  onPass: (checklistId: string) => Promise<boolean> | boolean;
  onUpdate: (checklistId: string, payload: { status: string; notes: string }) => void;
  onUpdateCustomerIntake: (payload: any) => Promise<boolean> | boolean;
  onUploadDocument?: (stage: any, event: ChangeEvent<HTMLInputElement>, documentId: string) => Promise<boolean> | boolean;
  onVerifyDocument?: (documentId: string) => Promise<boolean> | boolean;
  onOpenDocument?: (document: any) => void;
  onOpenSchedule?: (stage: any) => void;
  uploadingStageId?: string | null;
  stageTitle: (stage: any) => string;
};

type PostalArea = {
  postalCode: string;
  subdistrict: string;
  district: string;
  province: string;
  subdistrictCode?: number;
  districtCode?: number;
};

const systemSizeOptions = ["", "รอประเมินหน้างาน", "3 kW", "5 kW", "10 kW", "15 kW", "20 kW", "30 kW+"];
const electricBillOptions = ["", "ต่ำกว่า 5,000 บาท/เดือน", "5,000 - 10,000 บาท/เดือน", "10,000 - 20,000 บาท/เดือน", "20,000 - 50,000 บาท/เดือน", "มากกว่า 50,000 บาท/เดือน"];

function isPassed(item: any) {
  return item.status === "PASSED" || item.status === "WAIVED";
}

function fieldOk(value: unknown) {
  if (typeof value === "boolean") return value;
  return Boolean(String(value || "").trim());
}

function normalizeCustomerCodeInput(value: string) {
  return value.trimStart().toUpperCase();
}

function gatePassed(item: any) {
  return item.status === "PASSED" || item.status === "VERIFIED" || item.status === "WAIVED";
}

function activeDocuments(stage: any) {
  return sortProjectDocuments(stage.documents || []).filter((document) => document.status !== "SUPERSEDED");
}

function gateBadgeClass(item: any) {
  if (gatePassed(item)) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (item.gate_severity === "HARD") return "border-rose-200 bg-rose-50 text-rose-700";
  if (item.gate_severity === "OVERRIDEABLE") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function isBlockingGate(item: any) {
  return item.is_required !== false && ["HARD", "OVERRIDEABLE"].includes(item.gate_severity);
}

function gateCardClass(item: any) {
  if (gatePassed(item)) return "border-lime-400 bg-lime-200";
  if (isBlockingGate(item)) return "border-pink-400 bg-pink-200";
  return "border-amber-400 bg-amber-300";
}

function gateStateBadge(item: any) {
  if (gatePassed(item)) {
    return {
      label: "ผ่านแล้ว",
      className: "border-lime-300 bg-lime-100 text-lime-900",
    };
  }
  if (isBlockingGate(item)) {
    return {
      label: "ติดอยู่",
      className: "border-pink-300 bg-pink-100 text-pink-900",
    };
  }
  return {
    label: "ควรทำ",
    className: "border-amber-300 bg-amber-100 text-amber-900",
  };
}

function StageChecklistModal({
  stage,
  loadingId,
  onClose,
  onPass,
  onUploadDocument,
  onVerifyDocument,
  onOpenDocument,
  onOpenSchedule,
  uploadingStageId,
  stageTitle,
}: Props) {
  const checklists = stage.checklists || [];
  const documents = activeDocuments(stage);
  const gates = [...checklists, ...documents];
  const passedCount = gates.filter(gatePassed).length;
  const isLoading = Boolean(loadingId);
  const isSchedulingStage = stage.code === "SCHEDULING";

  async function passChecklistAndClose(checklistId: string) {
    if (isSchedulingStage) {
      onOpenSchedule?.(stage);
      return;
    }
    const ok = await onPass(checklistId);
    if (ok !== false) onClose();
  }

  async function uploadAndClose(event: ChangeEvent<HTMLInputElement>, documentId: string) {
    if (!onUploadDocument) return;
    const ok = await onUploadDocument(stage, event, documentId);
    if (ok !== false) onClose();
  }

  async function verifyAndClose(documentId: string) {
    if (!onVerifyDocument) return;
    const ok = await onVerifyDocument(documentId);
    if (ok !== false) onClose();
  }

  return (
    <div className="fixed inset-0 z-[115] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-950/15">
        <div className="flex items-start justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Stage {stage.order_index || "-"} / {stage.code || "-"}</p>
            <h2 className="mt-1 text-[18px] font-bold text-slate-950">{stageTitle(stage)}</h2>
            <p className="mt-1 text-[12px] font-semibold text-slate-500">{passedCount}/{gates.length} gates ผ่านแล้ว</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600">{stage.status}</span>
              <span className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600">SLA {stage.sla_hours ? `${Math.round(stage.sla_hours / 24)} วัน` : "-"}</span>
              <span className="rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">{stage.sla_status || "ON_TRACK"}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">×</button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-[14px] font-bold text-slate-950">Checklist Gate</h3>
                <p className="text-[12px] font-semibold text-slate-500">{checklists.filter(isPassed).length}/{checklists.length} รายการผ่านแล้ว</p>
              </div>
            </div>
            {checklists.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-[12px] font-semibold text-slate-400">ขั้นตอนนี้ไม่มี Checklist Gate</div>
            ) : (
              <div className="space-y-3">
                {checklists.map((item: any) => {
                  const passed = isPassed(item);
                  const stateBadge = gateStateBadge(item);
                  return (
                    <div key={item.id} className={`flex items-center justify-between gap-4 rounded-lg border-2 p-4 shadow-sm ${gateCardClass(item)}`}>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-[13px] font-bold text-slate-950">{item.label || item.name}</h4>
                          <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${stateBadge.className}`}>{stateBadge.label}</span>
                          <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${gateBadgeClass(item)}`}>{passed ? "PASSED" : item.gate_severity || "GATE"}</span>
                        </div>
                        <p className="mt-1 font-mono text-[11px] font-bold uppercase tracking-wide text-slate-400">{item.code}</p>
                        {item.notes && <p className="mt-2 rounded bg-white/60 px-2 py-1 text-[12px] font-semibold text-slate-700">{item.notes}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => passChecklistAndClose(item.id)}
                        disabled={passed || isLoading}
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-[16px] font-bold shadow-sm ${passed ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-200 bg-white text-slate-300 hover:border-emerald-400 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"}`}
                        title={passed ? "ผ่านแล้ว" : "กดผ่าน checklist"}
                      >
                        ✓
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {isSchedulingStage && !stage.metadata?.scheduled_at && (
            <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
              <p className="text-[13px] font-bold text-slate-950">ต้องจัดตารางจริงก่อนผ่าน checklist</p>
              <p className="mt-1 text-[12px] font-semibold text-violet-700">เลือกวันติดตั้งและทีมจากหน้า Schedule แล้วระบบจะผ่าน checklist ให้อัตโนมัติ</p>
              <button
                type="button"
                onClick={() => onOpenSchedule?.(stage)}
                className="mt-3 rounded-md bg-violet-600 px-4 py-2.5 text-[12px] font-bold text-white shadow-sm hover:bg-violet-700"
              >
                ไปหน้า Schedule
              </button>
            </div>
          )}

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[14px] font-bold text-slate-950">เอกสารบังคับ</h3>
              <span className="text-[12px] font-bold text-slate-400">{documents.length} ใช้งาน</span>
            </div>
            {documents.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-[12px] font-semibold text-slate-400">ขั้นตอนนี้ไม่มีเอกสารบังคับ</div>
            ) : (
              <div className="space-y-3">
                {documents.map((document: any) => {
                  const stateBadge = gateStateBadge(document);
                  return (
                  <div key={document.id} className={`rounded-lg border-2 p-4 shadow-sm ${gateCardClass(document)}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-[13px] font-bold text-slate-950">{document.name}</h4>
                          <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${stateBadge.className}`}>{stateBadge.label}</span>
                        </div>
                        <p className="mt-1 font-mono text-[11px] font-bold uppercase tracking-wide text-slate-400">{document.code}</p>
                      </div>
                      <span className={`rounded border px-2 py-1 text-[10px] font-bold ${gateBadgeClass(document)}`}>{statusLabel(document.status)}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {document.is_required !== false && <span className="rounded border border-rose-100 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">บังคับ</span>}
                      {document.requires_verification && <span className="rounded border border-sky-100 bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700">ต้องตรวจ</span>}
                      {document.web_view_link && <a href={document.web_view_link} target="_blank" rel="noreferrer" className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50">เปิดไฟล์</a>}
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      <label className={`rounded-md border px-3 py-2 text-center text-[11px] font-bold shadow-sm transition-colors ${canUploadDocument(document) && onUploadDocument ? "cursor-pointer border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600" : "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"}`}>
                        {uploadingStageId === stage.id ? "กำลังแนบ..." : "แนบเอกสาร"}
                        <input
                          type="file"
                          className="hidden"
                          disabled={!canUploadDocument(document) || !onUploadDocument || uploadingStageId === stage.id}
                          onChange={(event) => uploadAndClose(event, document.id)}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => verifyAndClose(document.id)}
                        disabled={!canVerifyDocument(document) || !onVerifyDocument || isLoading}
                        className={`rounded-md border px-3 py-2 text-[11px] font-bold shadow-sm ${canVerifyDocument(document) && onVerifyDocument ? "border-sky-500 bg-sky-500 text-white hover:bg-sky-600" : document.status === "VERIFIED" ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-slate-100 bg-slate-50 text-slate-300"}`}
                      >
                        {document.status === "VERIFIED" ? "ตรวจผ่านแล้ว" : "ตรวจผ่าน"}
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenDocument?.(document)}
                        disabled={!onOpenDocument}
                        className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-600 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        รายละเอียด
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="border-t border-slate-100 bg-white px-6 py-4">
          <button type="button" onClick={onClose} className="w-full rounded-md bg-slate-950 px-4 py-3 text-[13px] font-bold text-white shadow-sm hover:bg-slate-800">ปิดหน้าต่าง</button>
        </div>
      </div>
    </div>
  );
}

function CustomerIntakeChecklistModal({
  stage,
  project,
  loadingId,
  onClose,
  onPass,
  onUpdateCustomerIntake,
  stageTitle,
}: Props) {
  const checklists = stage.checklists || [];
  const [projectDraft, setProjectDraft] = useState({
    customerCode: project?.customer_code || "",
    customerName: project?.customer_name || "",
    customerPhone: project?.customer_phone || "",
  });
  const [customerDraft, setCustomerDraft] = useState<any>(project?.customer_intake || {});
  const [postalMatches, setPostalMatches] = useState<PostalArea[]>([]);
  const [postalError, setPostalError] = useState("");
  const [isPostalLoading, setIsPostalLoading] = useState(false);

  useEffect(() => {
    setProjectDraft({
      customerCode: project?.customer_code || "",
      customerName: project?.customer_name || "",
      customerPhone: project?.customer_phone || "",
    });
    setCustomerDraft(project?.customer_intake || {});
  }, [project?.id, project?.customer_intake]);

  const selectedPostalValue = useMemo(
    () => `${customerDraft.siteSubdistrict || ""}|${customerDraft.siteDistrict || ""}|${customerDraft.siteProvince || ""}`,
    [customerDraft.siteDistrict, customerDraft.siteProvince, customerDraft.siteSubdistrict],
  );
  const provinceOptions = useMemo(
    () => Array.from(new Set(postalMatches.map((area) => area.province))).sort((a, b) => a.localeCompare(b, "th")),
    [postalMatches],
  );
  const districtOptions = useMemo(
    () => Array.from(new Set(postalMatches.filter((area) => !customerDraft.siteProvince || area.province === customerDraft.siteProvince).map((area) => area.district))).sort((a, b) => a.localeCompare(b, "th")),
    [customerDraft.siteProvince, postalMatches],
  );
  const subdistrictOptions = useMemo(
    () => Array.from(new Set(postalMatches.filter((area) => !customerDraft.siteProvince || area.province === customerDraft.siteProvince).filter((area) => !customerDraft.siteDistrict || area.district === customerDraft.siteDistrict).map((area) => area.subdistrict))).sort((a, b) => a.localeCompare(b, "th")),
    [customerDraft.siteDistrict, customerDraft.siteProvince, postalMatches],
  );

  const passedCount = checklists.filter(isPassed).length;
  const fieldClass = "w-full rounded-md border px-3 py-2.5 text-[13px] font-semibold shadow-sm outline-none transition placeholder:text-slate-400 focus:ring-4";
  const validClass = "border-emerald-400 bg-emerald-100 text-emerald-950 focus:border-emerald-500 focus:ring-emerald-100";
  const invalidClass = "border-rose-300 bg-rose-100 text-rose-950 focus:border-rose-500 focus:ring-rose-100";
  const neutralClass = "border-slate-200 bg-white text-slate-950 focus:border-emerald-400 focus:ring-emerald-50";
  const tone = (value: unknown, required = true) => {
    if (!required && !fieldOk(value)) return neutralClass;
    return fieldOk(value) ? validClass : invalidClass;
  };

  function setProjectField(field: string, value: string) {
    setProjectDraft((current) => ({ ...current, [field]: field === "customerCode" ? normalizeCustomerCodeInput(value) : value }));
  }

  function setCustomerField(field: string, value: any) {
    setCustomerDraft((current: any) => ({ ...current, [field]: value }));
  }

  function applyPostalArea(area: PostalArea) {
    setCustomerDraft((current: any) => ({
      ...current,
      siteSubdistrict: area.subdistrict,
      siteDistrict: area.district,
      siteProvince: area.province,
    }));
  }

  async function lookupPostalCode(value: string) {
    const postalCode = value.replace(/\D/g, "").slice(0, 5);
    setPostalError("");
    setPostalMatches([]);
    setCustomerDraft((current: any) => ({ ...current, postalCode, siteSubdistrict: "", siteDistrict: "", siteProvince: "" }));
    if (postalCode.length !== 5) return;

    setIsPostalLoading(true);
    try {
      const response = await apiFetch(`/api/address/postal-code?code=${postalCode}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Postal lookup failed.");
      const areas = result.areas || [];
      setPostalMatches(areas);
      if (areas[0]) applyPostalArea(areas[0]);
      if (!areas.length) setPostalError("ไม่พบรหัสนี้ในฐานข้อมูล");
    } catch (error: any) {
      setPostalError(error.message || "ค้นหารหัสไปรษณีย์ไม่สำเร็จ");
    } finally {
      setIsPostalLoading(false);
    }
  }

  function handleProvinceChange(province: string) {
    const firstMatch = postalMatches.find((area) => area.province === province);
    setCustomerDraft((current: any) => ({
      ...current,
      siteProvince: province,
      siteDistrict: firstMatch?.district || "",
      siteSubdistrict: firstMatch?.subdistrict || "",
    }));
  }

  function handleDistrictChange(district: string) {
    const firstMatch = postalMatches.find((area) => area.province === customerDraft.siteProvince && area.district === district);
    setCustomerDraft((current: any) => ({
      ...current,
      siteDistrict: district,
      siteSubdistrict: firstMatch?.subdistrict || "",
    }));
  }

  async function saveCustomer() {
    return await onUpdateCustomerIntake({ ...projectDraft, customerIntake: customerDraft });
  }

  async function passReadyChecklists() {
    let ok = true;
    for (const checklist of checklists) {
      if (isPassed(checklist)) continue;
      let shouldPass = false;
      if (checklist.code === "CUSTOMER_PROFILE_CAPTURED" && fieldOk(projectDraft.customerName) && fieldOk(customerDraft.contactName) && fieldOk(projectDraft.customerPhone)) shouldPass = true;
      if (checklist.code === "CONTACT_VERIFIED" && fieldOk(customerDraft.contactVerified) && fieldOk(projectDraft.customerPhone)) shouldPass = true;
      if (checklist.code === "SITE_ADDRESS_CAPTURED" && fieldOk(customerDraft.siteAddress) && fieldOk(customerDraft.siteSubdistrict) && fieldOk(customerDraft.siteDistrict) && fieldOk(customerDraft.siteProvince) && fieldOk(customerDraft.postalCode)) shouldPass = true;
      if (checklist.code === "PROJECT_TYPE_CONFIRMED") shouldPass = true;
      if (checklist.code === "DUPLICATE_CHECKED" && fieldOk(projectDraft.customerCode)) shouldPass = true;
      if (checklist.code === "INITIAL_REQUIREMENT_CAPTURED" && (fieldOk(customerDraft.interestedSystemSizeKw) || fieldOk(customerDraft.monthlyElectricBill) || fieldOk(customerDraft.initialRequirement))) shouldPass = true;
      if (shouldPass) {
        const passed = await onPass(checklist.id);
        if (passed === false) ok = false;
      }
    }
    return ok;
  }

  async function saveAndClose() {
    const saved = await saveCustomer();
    if (saved === false) return;
    const passed = await passReadyChecklists();
    if (passed === false) return;
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[115] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-950/15">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">✓</span>
            <div className="min-w-0">
              <h2 className="truncate text-[16px] font-bold text-slate-950">รับข้อมูลลูกค้า</h2>
              <p className="truncate text-[12px] text-slate-500">{stageTitle(stage)} • {passedCount}/{checklists.length} checklist ผ่านแล้ว</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">×</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="space-y-5">
            <section className="space-y-3">
              <div>
                <h3 className="text-[13px] font-bold text-slate-950">1. ข้อมูลโครงการ</h3>
                <p className="text-[11px] font-medium text-slate-500">ข้อมูลที่ล็อกจาก workflow และมาตรฐานติดตั้ง</p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div><label className="mb-1.5 block text-[12px] font-semibold text-slate-700">Workflow</label><input className={`${fieldClass} ${validClass}`} value={project?.project_type || "RES-S Standard"} disabled /></div>
                <div><label className="mb-1.5 block text-[12px] font-semibold text-slate-700">มาตรฐานติดตั้ง</label><input className={`${fieldClass} ${validClass}`} value={project?.standard_code || "V8R2"} disabled /></div>
                <div><label className="mb-1.5 block text-[12px] font-semibold text-slate-700">รูปแบบการชำระเงิน</label><input className={`${fieldClass} ${validClass}`} value={project?.payment_type === "LOAN" ? "สินเชื่อ" : "เงินสด"} disabled /></div>
              </div>
            </section>

            <section className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              <div>
                <h3 className="text-[13px] font-bold text-slate-950">2. ลูกค้าและผู้ติดต่อ</h3>
                <p className="text-[11px] font-medium text-slate-500">ช่องสีเขียวคือมีข้อมูลแล้ว สีแดงคือยังต้องกรอก</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div><label className="mb-1.5 block text-[12px] font-semibold text-slate-700">รหัสลูกค้า *</label><input className={`${fieldClass} ${tone(projectDraft.customerCode)}`} value={projectDraft.customerCode} onChange={(e) => setProjectField("customerCode", e.target.value)} /></div>
                <div><label className="mb-1.5 block text-[12px] font-semibold text-slate-700">ชื่อลูกค้า / บริษัท *</label><input className={`${fieldClass} ${tone(projectDraft.customerName)}`} value={projectDraft.customerName} onChange={(e) => setProjectField("customerName", e.target.value)} /></div>
              </div>
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <div><label className="mb-1.5 block text-[12px] font-semibold text-slate-700">เบอร์โทรลูกค้า</label><input className={`${fieldClass} ${tone(projectDraft.customerPhone)}`} value={projectDraft.customerPhone} onChange={(e) => setProjectField("customerPhone", e.target.value)} /></div>
                <div><label className="mb-1.5 block text-[12px] font-semibold text-slate-700">ชื่อผู้ติดต่อ</label><input className={`${fieldClass} ${tone(customerDraft.contactName)}`} value={customerDraft.contactName || ""} onChange={(e) => setCustomerField("contactName", e.target.value)} /></div>
                <label className={`mt-6 flex h-[42px] items-center gap-2 whitespace-nowrap rounded-md border px-3 text-[12px] font-bold ${fieldOk(customerDraft.contactVerified) ? "border-emerald-400 bg-emerald-100 text-emerald-900" : "border-rose-300 bg-rose-100 text-rose-900"}`}>
                  <input type="checkbox" checked={Boolean(customerDraft.contactVerified)} onChange={(e) => setCustomerField("contactVerified", e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                  ยืนยันเบอร์แล้ว
                </label>
              </div>
            </section>

            <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
              <div>
                <h3 className="text-[13px] font-bold text-slate-950">3. ที่อยู่ติดตั้ง</h3>
                <p className="text-[11px] font-medium text-slate-500">กรอกรหัสไปรษณีย์แล้วเลือกพื้นที่จาก dropdown</p>
              </div>
              <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(220px,0.8fr)]">
                <div><label className="mb-1.5 block text-[12px] font-semibold text-slate-700">บ้านเลขที่ / อาคาร / ถนน</label><textarea className={`${fieldClass} ${tone(customerDraft.siteAddress)} min-h-24 resize-none`} value={customerDraft.siteAddress || ""} onChange={(e) => setCustomerField("siteAddress", e.target.value)} /></div>
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-slate-700">รหัสไปรษณีย์</label>
                  <input className={`${fieldClass} ${tone(customerDraft.postalCode)}`} inputMode="numeric" maxLength={5} value={customerDraft.postalCode || ""} onChange={(e) => lookupPostalCode(e.target.value)} />
                  <p className="mt-1 text-[11px] font-medium text-slate-500">{isPostalLoading ? "กำลังค้นหาพื้นที่..." : "ดึงข้อมูลจากฐานข้อมูลรหัสไปรษณีย์ในระบบ"}</p>
                  {postalError && <p className="mt-1 text-[11px] font-semibold text-amber-600">{postalError}</p>}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold text-slate-700">พื้นที่จากรหัสไปรษณีย์</label>
                <select className={`${fieldClass} ${postalMatches.length ? validClass : tone(customerDraft.siteSubdistrict)}`} value={selectedPostalValue} disabled={!postalMatches.length} onChange={(e) => {
                  const selected = postalMatches.find((area) => `${area.subdistrict}|${area.district}|${area.province}` === e.target.value);
                  if (selected) applyPostalArea(selected);
                }}>
                  {!postalMatches.length && <option value="">กรอกรหัสไปรษณีย์ 5 หลักเพื่อเลือกพื้นที่</option>}
                  {postalMatches.map((area) => <option key={`${area.subdistrictCode}-${area.districtCode}-${area.postalCode}`} value={`${area.subdistrict}|${area.district}|${area.province}`}>{area.subdistrict}, {area.district}, {area.province}</option>)}
                </select>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <select className={`${fieldClass} ${tone(customerDraft.siteSubdistrict)}`} disabled={!postalMatches.length} value={customerDraft.siteSubdistrict || ""} onChange={(e) => setCustomerField("siteSubdistrict", e.target.value)}>
                  {!subdistrictOptions.length && <option value={customerDraft.siteSubdistrict || ""}>{customerDraft.siteSubdistrict || "ตำบล / แขวง"}</option>}
                  {subdistrictOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <select className={`${fieldClass} ${tone(customerDraft.siteDistrict)}`} disabled={!postalMatches.length} value={customerDraft.siteDistrict || ""} onChange={(e) => handleDistrictChange(e.target.value)}>
                  {!districtOptions.length && <option value={customerDraft.siteDistrict || ""}>{customerDraft.siteDistrict || "อำเภอ / เขต"}</option>}
                  {districtOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <select className={`${fieldClass} ${tone(customerDraft.siteProvince)}`} disabled={!postalMatches.length} value={customerDraft.siteProvince || ""} onChange={(e) => handleProvinceChange(e.target.value)}>
                  {!provinceOptions.length && <option value={customerDraft.siteProvince || ""}>{customerDraft.siteProvince || "จังหวัด"}</option>}
                  {provinceOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div><label className="mb-1.5 block text-[12px] font-semibold text-slate-700">Google Maps / พิกัด</label><input className={`${fieldClass} ${tone(customerDraft.googleMapsUrl, false)}`} value={customerDraft.googleMapsUrl || ""} onChange={(e) => setCustomerField("googleMapsUrl", e.target.value)} /></div>
            </section>

            <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
              <div><h3 className="text-[13px] font-bold text-slate-950">4. ความต้องการเบื้องต้น</h3><p className="text-[11px] font-medium text-slate-500">เลือกข้อมูลที่มีเพื่อผ่าน checklist requirement</p></div>
              <div className="grid gap-4 md:grid-cols-2">
                <div><label className="mb-1.5 block text-[12px] font-semibold text-slate-700">ขนาดระบบที่สนใจ</label><select className={`${fieldClass} ${tone(customerDraft.interestedSystemSizeKw, false)}`} value={customerDraft.interestedSystemSizeKw || ""} onChange={(e) => setCustomerField("interestedSystemSizeKw", e.target.value)}>{systemSizeOptions.map((item) => <option key={item || "empty"} value={item}>{item || "ยังไม่ระบุ"}</option>)}</select></div>
                <div><label className="mb-1.5 block text-[12px] font-semibold text-slate-700">ค่าไฟโดยประมาณ</label><select className={`${fieldClass} ${tone(customerDraft.monthlyElectricBill, false)}`} value={customerDraft.monthlyElectricBill || ""} onChange={(e) => setCustomerField("monthlyElectricBill", e.target.value)}>{electricBillOptions.map((item) => <option key={item || "empty"} value={item}>{item || "ยังไม่ระบุ"}</option>)}</select></div>
              </div>
              <div><label className="mb-1.5 block text-[12px] font-semibold text-slate-700">Requirement / หมายเหตุฝ่ายขาย</label><textarea className={`${fieldClass} ${tone(customerDraft.initialRequirement, false)} min-h-24 resize-none`} value={customerDraft.initialRequirement || ""} onChange={(e) => setCustomerField("initialRequirement", e.target.value)} /></div>
            </section>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-white px-6 py-4">
          <p className="text-[12px] font-semibold text-slate-500">บันทึกแล้วระบบจะเก็บ audit log และสามารถกดผ่าน checklist ที่ข้อมูลครบได้</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-md px-4 py-2.5 text-[13px] font-semibold text-slate-500 hover:bg-slate-50">ยกเลิก</button>
            <button type="button" onClick={saveAndClose} disabled={Boolean(loadingId)} className="rounded-md bg-emerald-600 px-4 py-2.5 text-[13px] font-bold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
              {loadingId === "customer-intake" ? "กำลังบันทึก..." : "บันทึกและตรวจผ่าน"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChecklistReviewModal(props: Props) {
  if (props.stage?.code === "LEAD") {
    return <CustomerIntakeChecklistModal {...props} />;
  }

  return <StageChecklistModal {...props} />;
}
