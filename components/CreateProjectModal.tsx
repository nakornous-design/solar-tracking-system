"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { apiFetch } from "../lib/api-client";

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type PostalArea = {
  postalCode: string;
  subdistrict: string;
  district: string;
  province: string;
  subdistrictEn?: string;
  districtEn?: string;
  provinceEn?: string;
  subdistrictCode?: number;
  districtCode?: number;
  provinceCode?: number;
};

const systemSizeOptions = [
  { value: "", label: "ยังไม่ระบุ" },
  { value: "รอประเมินหน้างาน", label: "รอประเมินหน้างาน" },
  { value: "3 kW", label: "3 kW" },
  { value: "5 kW", label: "5 kW" },
  { value: "10 kW", label: "10 kW" },
  { value: "15 kW", label: "15 kW" },
  { value: "20 kW", label: "20 kW" },
  { value: "30 kW+", label: "30 kW+" },
];

const electricBillOptions = [
  { value: "", label: "ยังไม่ระบุ" },
  { value: "ต่ำกว่า 5,000 บาท/เดือน", label: "ต่ำกว่า 5,000 บาท/เดือน" },
  { value: "5,000 - 10,000 บาท/เดือน", label: "5,000 - 10,000 บาท/เดือน" },
  { value: "10,000 - 20,000 บาท/เดือน", label: "10,000 - 20,000 บาท/เดือน" },
  { value: "20,000 - 50,000 บาท/เดือน", label: "20,000 - 50,000 บาท/เดือน" },
  { value: "มากกว่า 50,000 บาท/เดือน", label: "มากกว่า 50,000 บาท/เดือน" },
];

const defaultCustomerIntake = {
  contactName: "",
  contactVerified: false,
  siteAddress: "",
  postalCode: "",
  siteSubdistrict: "",
  siteDistrict: "",
  siteProvince: "",
  googleMapsUrl: "",
  interestedSystemSizeKw: "",
  monthlyElectricBill: "",
  initialRequirement: "",
  projectScope: "RES-S rooftop solar",
};

function normalizeCustomerCodeInput(value: string) {
  return value.trimStart().toUpperCase();
}

export default function CreateProjectModal({ isOpen, onClose, onSuccess }: CreateProjectModalProps) {
  const [formData, setFormData] = useState({
    customerCode: "",
    customerName: "",
    customerPhone: "",
    customerIntake: defaultCustomerIntake,
    templateId: "",
    standardId: "V8R2",
    paymentType: "CASH",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isPostalLoading, setIsPostalLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [postalError, setPostalError] = useState("");
  const [postalMatches, setPostalMatches] = useState<PostalArea[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [standards, setStandards] = useState<any[]>([]);

  const selectedPostalValue = useMemo(
    () => `${formData.customerIntake.siteSubdistrict}|${formData.customerIntake.siteDistrict}|${formData.customerIntake.siteProvince}`,
    [formData.customerIntake.siteDistrict, formData.customerIntake.siteProvince, formData.customerIntake.siteSubdistrict],
  );
  const provinceOptions = useMemo(
    () => Array.from(new Set(postalMatches.map((area) => area.province))).sort((a, b) => a.localeCompare(b, "th")),
    [postalMatches],
  );
  const districtOptions = useMemo(
    () =>
      Array.from(
        new Set(
          postalMatches
            .filter((area) => !formData.customerIntake.siteProvince || area.province === formData.customerIntake.siteProvince)
            .map((area) => area.district),
        ),
      ).sort((a, b) => a.localeCompare(b, "th")),
    [formData.customerIntake.siteProvince, postalMatches],
  );
  const subdistrictOptions = useMemo(
    () =>
      Array.from(
        new Set(
          postalMatches
            .filter((area) => !formData.customerIntake.siteProvince || area.province === formData.customerIntake.siteProvince)
            .filter((area) => !formData.customerIntake.siteDistrict || area.district === formData.customerIntake.siteDistrict)
            .map((area) => area.subdistrict),
        ),
      ).sort((a, b) => a.localeCompare(b, "th")),
    [formData.customerIntake.siteDistrict, formData.customerIntake.siteProvince, postalMatches],
  );

  async function fetchTemplates() {
    const { data: publishedVersions } = await supabase
      .from("workflow_versions")
      .select("workflow_template_id")
      .eq("status", "PUBLISHED")
      .eq("is_active", true);

    const publishedTemplateIds = Array.from(
      new Set((publishedVersions || []).map((version) => version.workflow_template_id).filter(Boolean)),
    );

    const { data } = publishedTemplateIds.length
      ? await supabase.from("workflow_templates").select("*").eq("is_active", true).in("id", publishedTemplateIds)
      : { data: [] };

    const { data: standardsData } = await supabase
      .from("installation_standards")
      .select("id, code, name, version")
      .eq("status", "PUBLISHED")
      .eq("is_active", true);

    if (data && data.length > 0) {
      setTemplates(data);
      setFormData((prev) => ({ ...prev, templateId: data[0].id }));
    } else {
      setTemplates([]);
      setFormData((prev) => ({ ...prev, templateId: "" }));
    }

    if (standardsData && standardsData.length > 0) {
      setStandards(standardsData);
      const defaultStandard = standardsData.find((standard) => standard.code === "V8R2") || standardsData[0];
      setFormData((prev) => ({ ...prev, standardId: defaultStandard.id }));
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const setCustomerIntake = (patch: Partial<typeof defaultCustomerIntake>) => {
    setFormData((prev) => ({
      ...prev,
      customerIntake: {
        ...prev.customerIntake,
        ...patch,
      },
    }));
  };

  const applyPostalArea = (area: PostalArea) => {
    setCustomerIntake({
      siteSubdistrict: area.subdistrict,
      siteDistrict: area.district,
      siteProvince: area.province,
    });
  };

  const handleProvinceChange = (province: string) => {
    const firstMatch = postalMatches.find((area) => area.province === province);
    setCustomerIntake({
      siteProvince: province,
      siteDistrict: firstMatch?.district || "",
      siteSubdistrict: firstMatch?.subdistrict || "",
    });
  };

  const handleDistrictChange = (district: string) => {
    const firstMatch = postalMatches.find(
      (area) => area.province === formData.customerIntake.siteProvince && area.district === district,
    );
    setCustomerIntake({
      siteDistrict: district,
      siteSubdistrict: firstMatch?.subdistrict || "",
    });
  };

  const lookupPostalCode = async (postalCode: string) => {
    setPostalError("");
    setPostalMatches([]);
    setCustomerIntake({
      postalCode,
      siteSubdistrict: "",
      siteDistrict: "",
      siteProvince: "",
    });

    if (postalCode.length !== 5) return;

    setIsPostalLoading(true);
    try {
      const response = await apiFetch(`/api/address/postal-code?code=${postalCode}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Postal lookup failed.");

      const areas = result.areas || [];
      setPostalMatches(areas);
      if (areas[0]) applyPostalArea(areas[0]);
      if (!areas.length) setPostalError("ไม่พบรหัสนี้ในฐานข้อมูล สามารถกรอกตำบล/อำเภอ/จังหวัดเองได้");
    } catch (error: any) {
      setPostalError(error.message || "ค้นหารหัสไปรษณีย์ไม่สำเร็จ");
    } finally {
      setIsPostalLoading(false);
    }
  };

  const handlePostalCodeChange = (postalCodeValue: string) => {
    const postalCode = postalCodeValue.replace(/\D/g, "").slice(0, 5);
    void lookupPostalCode(postalCode);
  };

  const resetForm = () => {
    setPostalMatches([]);
    setPostalError("");
    setFormData({
      customerCode: "",
      customerName: "",
      customerPhone: "",
      customerIntake: defaultCustomerIntake,
      templateId: templates[0]?.id || "",
      standardId: standards.find((standard) => standard.code === "V8R2")?.id || standards[0]?.id || "V8R2",
      paymentType: "CASH",
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setErrorMsg("");

    try {
      const projectRes = await apiFetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const projectData = await projectRes.json();
      if (!projectRes.ok) {
        throw new Error(projectData.error || "Create project failed.");
      }

      onSuccess();
      onClose();
      resetForm();
    } catch (error: any) {
      setErrorMsg(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fieldClass =
    "w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-medium text-slate-950 shadow-sm transition placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-50";
  const selectClass =
    "w-full appearance-none rounded-md border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-semibold text-slate-900 shadow-sm transition focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-50";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-950/15">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 2 4 14h7l-1 8 10-13h-7V2Z" />
              </svg>
            </span>
            <div>
              <h2 className="text-[16px] font-bold text-slate-950">สร้างโครงการใหม่</h2>
              <p className="text-[12px] text-slate-500">กรอกข้อมูลลูกค้า เลือก workflow และเตรียมข้อมูลขั้นรับลูกค้า</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="space-y-5">
            {errorMsg && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] font-medium text-rose-700">
                {errorMsg}
              </div>
            )}

            <section className="space-y-3">
              <div>
                <h3 className="text-[13px] font-bold text-slate-950">1. ข้อมูลโครงการ</h3>
                <p className="text-[11px] font-medium text-slate-500">ข้อมูลที่ใช้ล็อก workflow และมาตรฐานติดตั้งตั้งแต่เริ่มงาน</p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-slate-700">Workflow</label>
                  <select className={selectClass} value={formData.templateId} onChange={(event) => setFormData({ ...formData, templateId: event.target.value })}>
                    <option value="">ยังไม่ได้เลือก workflow</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name || template.template_name || template.id}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-slate-700">มาตรฐานติดตั้ง</label>
                  <select className={selectClass} value={formData.standardId} onChange={(event) => setFormData({ ...formData, standardId: event.target.value })}>
                    {standards.map((standard) => (
                      <option key={standard.id} value={standard.id}>
                        {standard.code || standard.version || standard.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-slate-700">รูปแบบการชำระเงิน</label>
                  <select className={selectClass} value={formData.paymentType} onChange={(event) => setFormData({ ...formData, paymentType: event.target.value })}>
                    <option value="CASH">เงินสด</option>
                    <option value="LOAN">สินเชื่อ</option>
                  </select>
                </div>
              </div>
            </section>

            <section className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              <div>
                <h3 className="text-[13px] font-bold text-slate-950">2. ลูกค้าและผู้ติดต่อ</h3>
                <p className="text-[11px] font-medium text-slate-500">ข้อมูลกลุ่มนี้ใช้ตรวจ duplicate และผ่าน checklist ข้อมูลลูกค้า</p>
              </div>
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-slate-700">รหัสลูกค้า *</label>
                  <input
                    type="text"
                    required
                    className={fieldClass}
                    placeholder="เช่น CUST-2026-001"
                    value={formData.customerCode}
                    onChange={(event) => setFormData({ ...formData, customerCode: normalizeCustomerCodeInput(event.target.value) })}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-slate-700">ชื่อลูกค้า / บริษัท *</label>
                  <input
                    type="text"
                    required
                    className={fieldClass}
                    placeholder="ชื่อลูกค้าหรือบริษัท"
                    value={formData.customerName}
                    onChange={(event) => setFormData({ ...formData, customerName: event.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-slate-700">เบอร์โทรลูกค้า</label>
                  <input
                    type="tel"
                    className={fieldClass}
                    placeholder="ใช้ตรวจโปรเจกต์ซ้ำที่ยัง active"
                    value={formData.customerPhone}
                    onChange={(event) => setFormData({ ...formData, customerPhone: event.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-slate-700">ชื่อผู้ติดต่อ</label>
                  <input
                    type="text"
                    className={fieldClass}
                    placeholder="เช่น คุณสมชาย ฝ่ายจัดซื้อ"
                    value={formData.customerIntake.contactName}
                    onChange={(event) => setCustomerIntake({ contactName: event.target.value })}
                  />
                </div>
                <label className="mt-6 flex h-[42px] items-center gap-2 whitespace-nowrap rounded-md border border-emerald-100 bg-white px-3 text-[12px] font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={formData.customerIntake.contactVerified}
                    onChange={(event) => setCustomerIntake({ contactVerified: event.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  ยืนยันเบอร์แล้ว
                </label>
              </div>
            </section>

            <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
              <div>
                <h3 className="text-[13px] font-bold text-slate-950">3. ที่อยู่ติดตั้ง</h3>
                <p className="text-[11px] font-medium text-slate-500">กรอกรหัสไปรษณีย์ก่อน แล้วเลือกพื้นที่จาก dropdown เพื่อเติมตำบล/อำเภอ/จังหวัด</p>
              </div>
              <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(220px,0.8fr)]">
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-slate-700">บ้านเลขที่ / อาคาร / ถนน</label>
                  <textarea
                    className={`${fieldClass} min-h-24 resize-none`}
                    placeholder="บ้านเลขที่ / อาคาร / หมู่บ้าน / ถนน / ซอย"
                    value={formData.customerIntake.siteAddress}
                    onChange={(event) => setCustomerIntake({ siteAddress: event.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-slate-700">รหัสไปรษณีย์</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={5}
                    className={fieldClass}
                    placeholder="เช่น 20110"
                    value={formData.customerIntake.postalCode}
                    onChange={(event) => handlePostalCodeChange(event.target.value)}
                  />
                  <p className="mt-1 text-[11px] font-medium text-slate-500">
                    {isPostalLoading ? "กำลังค้นหาพื้นที่..." : "ดึงข้อมูลจากฐานข้อมูลรหัสไปรษณีย์ในระบบ"}
                  </p>
                  {postalError && <p className="mt-1 text-[11px] font-semibold text-amber-600">{postalError}</p>}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[12px] font-semibold text-slate-700">พื้นที่จากรหัสไปรษณีย์</label>
                <select
                  className={selectClass}
                  value={selectedPostalValue}
                  disabled={!postalMatches.length}
                  onChange={(event) => {
                    const selected = postalMatches.find(
                      (area) => `${area.subdistrict}|${area.district}|${area.province}` === event.target.value,
                    );
                    if (selected) applyPostalArea(selected);
                  }}
                >
                  {!postalMatches.length && <option value="">กรอกรหัสไปรษณีย์ 5 หลักเพื่อเลือกพื้นที่</option>}
                  {postalMatches.map((area) => (
                    <option key={`${area.subdistrictCode}-${area.districtCode}-${area.postalCode}`} value={`${area.subdistrict}|${area.district}|${area.province}`}>
                      {area.subdistrict}, {area.district}, {area.province}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-slate-700">ตำบล / แขวง</label>
                  <select
                    className={selectClass}
                    disabled={!postalMatches.length}
                    value={formData.customerIntake.siteSubdistrict}
                    onChange={(event) => setCustomerIntake({ siteSubdistrict: event.target.value })}
                  >
                    {!subdistrictOptions.length && <option value="">กรอกรหัสไปรษณีย์ก่อน</option>}
                    {subdistrictOptions.map((subdistrict) => (
                      <option key={subdistrict} value={subdistrict}>
                        {subdistrict}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-slate-700">อำเภอ / เขต</label>
                  <select
                    className={selectClass}
                    disabled={!postalMatches.length}
                    value={formData.customerIntake.siteDistrict}
                    onChange={(event) => handleDistrictChange(event.target.value)}
                  >
                    {!districtOptions.length && <option value="">กรอกรหัสไปรษณีย์ก่อน</option>}
                    {districtOptions.map((district) => (
                      <option key={district} value={district}>
                        {district}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-slate-700">จังหวัด</label>
                  <select
                    className={selectClass}
                    disabled={!postalMatches.length}
                    value={formData.customerIntake.siteProvince}
                    onChange={(event) => handleProvinceChange(event.target.value)}
                  >
                    {!provinceOptions.length && <option value="">กรอกรหัสไปรษณีย์ก่อน</option>}
                    {provinceOptions.map((province) => (
                      <option key={province} value={province}>
                        {province}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[12px] font-semibold text-slate-700">Google Maps / พิกัด</label>
                <input
                  type="text"
                  className={fieldClass}
                  placeholder="วางลิงก์ Google Maps หรือพิกัดหน้างาน"
                  value={formData.customerIntake.googleMapsUrl}
                  onChange={(event) => setCustomerIntake({ googleMapsUrl: event.target.value })}
                />
              </div>
            </section>

            <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
              <div>
                <h3 className="text-[13px] font-bold text-slate-950">4. ความต้องการเบื้องต้น</h3>
                <p className="text-[11px] font-medium text-slate-500">ข้อมูลช่วยให้ฝ่ายขาย/ทีมสำรวจรับงานต่อได้เร็วขึ้น</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-slate-700">ขนาดระบบที่สนใจ</label>
                  <select
                    className={selectClass}
                    value={formData.customerIntake.interestedSystemSizeKw}
                    onChange={(event) => setCustomerIntake({ interestedSystemSizeKw: event.target.value })}
                  >
                    {systemSizeOptions.map((option) => (
                      <option key={option.value || "empty"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-slate-700">ค่าไฟโดยประมาณ</label>
                  <select
                    className={selectClass}
                    value={formData.customerIntake.monthlyElectricBill}
                    onChange={(event) => setCustomerIntake({ monthlyElectricBill: event.target.value })}
                  >
                    {electricBillOptions.map((option) => (
                      <option key={option.value || "empty"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold text-slate-700">Requirement / หมายเหตุฝ่ายขาย</label>
                <textarea
                  className={`${fieldClass} min-h-24 resize-none`}
                  placeholder="เช่น ต้องการลดค่าไฟกลางวัน, ติดตั้งบนหลังคาเมทัลชีท, นัดสำรวจสัปดาห์หน้า"
                  value={formData.customerIntake.initialRequirement}
                  onChange={(event) => setCustomerIntake({ initialRequirement: event.target.value })}
                />
              </div>
            </section>

            <div className="sticky bottom-0 -mx-6 -mb-6 flex justify-end gap-3 border-t border-slate-100 bg-white/95 px-6 py-4 backdrop-blur">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="rounded-md px-4 py-2.5 text-[13px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className={`flex items-center gap-2 rounded-md px-4 py-2.5 text-[13px] font-bold text-white shadow-sm transition-all ${
                  isLoading
                    ? "cursor-not-allowed bg-emerald-500/60"
                    : "bg-emerald-500 shadow-emerald-100 hover:bg-emerald-600 hover:shadow-md"
                }`}
              >
                {isLoading ? "กำลังสร้าง..." : "สร้างโครงการ"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
