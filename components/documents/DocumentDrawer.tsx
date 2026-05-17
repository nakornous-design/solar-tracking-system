import { formatDateTime, severityLabel, statusLabel } from "@/lib/project-ui";

type DocumentDrawerProps = {
  document: any;
  uploadingStageId: string | null;
  versioningDocumentId: string | null;
  rejectingDocumentId: string | null;
  onClose: () => void;
  onUpload: (stage: any, event: React.ChangeEvent<HTMLInputElement>, documentId: string) => void;
  onVerify: (documentId: string) => void;
  onReject: (document: any) => void;
  onCreateVersion: (documentId: string) => void;
  stageTitle: (stage: any) => string;
};

function canUploadDocument(document: any) {
  return !["REJECTED", "SUPERSEDED", "VERIFIED"].includes(document.status);
}

function canVerifyDocument(document: any) {
  return document.status === "UPLOADED" || document.status === "PENDING_VERIFY";
}

function canRejectDocument(document: any) {
  return document.status === "UPLOADED" || document.status === "PENDING_VERIFY" || document.status === "VERIFIED";
}

function documentGovernanceTone(document: any) {
  if (document.status === "VERIFIED") return "good";
  if (document.status === "REJECTED" || (document.gate_severity === "HARD" && canUploadDocument(document))) return "risk";
  if (document.status === "PENDING_VERIFY" || document.status === "UPLOADED") return "review";
  return "pending";
}

function documentGovernanceLabel(document: any) {
  const tone = documentGovernanceTone(document);
  if (tone === "good") return "พร้อมใช้";
  if (tone === "risk") return "ต้องแก้ไข";
  if (tone === "review") return "รอตรวจ";
  return "รออัปโหลด";
}

function documentGovernanceClass(document: any) {
  const tone = documentGovernanceTone(document);
  if (tone === "good") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "risk") return "border-rose-200 bg-rose-50 text-rose-700";
  if (tone === "review") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function documentStatusClass(status: string) {
  if (status === "VERIFIED") return "border-emerald-100 bg-emerald-50 text-emerald-700";
  if (status === "PENDING_VERIFY") return "border-sky-100 bg-sky-50 text-sky-700";
  if (status === "UPLOADED") return "border-amber-100 bg-amber-50 text-amber-700";
  if (status === "REJECTED") return "border-rose-100 bg-rose-50 text-rose-700";
  if (status === "SUPERSEDED") return "border-slate-200 bg-slate-100 text-slate-400";
  return "border-slate-200 bg-slate-50 text-slate-500";
}

export default function DocumentDrawer({
  document,
  uploadingStageId,
  versioningDocumentId,
  rejectingDocumentId,
  onClose,
  onUpload,
  onVerify,
  onReject,
  onCreateVersion,
  stageTitle,
}: DocumentDrawerProps) {
  return (
    <div className="fixed inset-0 z-[95] flex justify-end bg-slate-950/30 backdrop-blur-[2px]" onClick={onClose}>
      <aside className="h-full w-full max-w-[520px] overflow-y-auto border-l border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={`rounded border px-2 py-1 text-[10px] font-bold ${documentGovernanceClass(document)}`}>{documentGovernanceLabel(document)}</span>
                <span className={`rounded border px-2 py-1 text-[10px] font-bold ${documentStatusClass(document.status)}`}>{statusLabel(document.status)}</span>
                <span className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-500">V{document.version_number || 1}</span>
              </div>
              <h2 className="text-lg font-bold text-slate-950">{document.name}</h2>
              <p className="mt-1 text-[12px] font-medium text-slate-500">{document.project?.customer_code || "โครงการ"} / {document.stage ? stageTitle(document.stage) : "ขั้นตอน"}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="space-y-5 px-5 py-5">
          <section className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">กติกาเอกสาร</p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
              {[
                ["Code", document.code || "N/A"],
                ["Gate", severityLabel(document.gate_severity || "INFO")],
                ["บังคับ", document.is_required === false ? "ไม่บังคับ" : "บังคับ"],
                ["การตรวจ", document.requires_verification === false ? "ไม่ต้องตรวจ" : "ต้องตรวจ"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border border-slate-200 bg-white px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                  <p className="mt-1 font-bold text-slate-900">{value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white px-4 py-4">
            <h3 className="text-[13px] font-bold text-slate-950">Google Drive</h3>
            <div className="mt-3 space-y-2 text-[12px] font-medium text-slate-500">
              <div className="flex justify-between gap-3"><span>ไฟล์</span><b className={document.google_drive_file_id ? "text-emerald-700" : "text-amber-600"}>{document.google_drive_file_id ? "เชื่อมแล้ว" : "ยังไม่มี"}</b></div>
              <div className="flex justify-between gap-3"><span>โฟลเดอร์</span><b className={document.google_drive_folder_id ? "text-emerald-700" : "text-amber-600"}>{document.google_drive_folder_id ? "เชื่อมแล้ว" : "ยังไม่มี"}</b></div>
              <div className="flex justify-between gap-3"><span>ชื่อไฟล์</span><b className="truncate text-slate-800">{document.file_name || "N/A"}</b></div>
              <div className="flex justify-between gap-3"><span>MIME</span><b className="truncate text-slate-800">{document.mime_type || "N/A"}</b></div>
            </div>
            {document.web_view_link && (
              <button
                type="button"
                onClick={() => window.open(document.web_view_link, "_blank")}
                className="mt-4 w-full rounded-md border border-slate-200 bg-slate-950 px-3 py-2.5 text-[12px] font-bold text-white shadow-sm hover:bg-slate-800"
              >
                เปิดไฟล์ใน Drive
              </button>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white px-4 py-4">
            <h3 className="text-[13px] font-bold text-slate-950">ประวัติเอกสาร</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">อัปโหลดเมื่อ</p>
                <p className="mt-1 font-bold text-slate-900">{formatDateTime(document.uploaded_at)}</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">ตรวจเมื่อ</p>
                <p className="mt-1 font-bold text-slate-900">{formatDateTime(document.verified_at)}</p>
              </div>
            </div>
            {document.rejection_reason && (
              <p className="mt-3 rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700">{document.rejection_reason}</p>
            )}
          </section>

          <section className="grid grid-cols-2 gap-2">
            <label className={`rounded-md border px-3 py-2.5 text-center text-[12px] font-bold shadow-sm transition-colors ${canUploadDocument(document) ? "cursor-pointer border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600" : "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"}`}>
              {uploadingStageId === document.stage?.id ? "กำลังอัปโหลด..." : "อัปโหลดไฟล์"}
              <input
                type="file"
                className="hidden"
                onChange={(event) => document.stage && onUpload(document.stage, event, document.id)}
                disabled={uploadingStageId === document.stage?.id || !canUploadDocument(document)}
              />
            </label>
            <button
              type="button"
              onClick={() => onVerify(document.id)}
              disabled={!canVerifyDocument(document)}
              className={`rounded-md border px-3 py-2.5 text-[12px] font-bold shadow-sm ${canVerifyDocument(document) ? "border-sky-500 bg-sky-500 text-white hover:bg-sky-600" : document.status === "VERIFIED" ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-slate-100 bg-slate-50 text-slate-300"}`}
            >
              {document.status === "VERIFIED" ? "ตรวจผ่านแล้ว" : "ตรวจผ่าน"}
            </button>
            <button
              type="button"
              onClick={() => onReject(document)}
              disabled={!canRejectDocument(document) || rejectingDocumentId === document.id}
              className={`rounded-md border px-3 py-2.5 text-[12px] font-bold ${canRejectDocument(document) ? "border-rose-200 bg-white text-rose-700 hover:bg-rose-50" : "border-slate-100 bg-slate-50 text-slate-300"}`}
            >
              ตีกลับ
            </button>
            <button
              type="button"
              onClick={() => onCreateVersion(document.id)}
              disabled={document.status !== "REJECTED" || versioningDocumentId === document.id}
              className={`rounded-md border px-3 py-2.5 text-[12px] font-bold shadow-sm ${document.status === "REJECTED" ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100" : "border-slate-100 bg-slate-50 text-slate-300"}`}
            >
              {versioningDocumentId === document.id ? "กำลังสร้าง..." : "สร้างเวอร์ชันใหม่"}
            </button>
          </section>
        </div>
      </aside>
    </div>
  );
}
