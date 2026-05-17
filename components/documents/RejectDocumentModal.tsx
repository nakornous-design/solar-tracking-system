"use client";

type RejectDocumentModalProps = {
  modal: {
    document: any;
    reason: string;
  };
  rejectingDocumentId: string | null;
  onChangeReason: (reason: string) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export default function RejectDocumentModal({
  modal,
  rejectingDocumentId,
  onChangeReason,
  onClose,
  onConfirm,
}: RejectDocumentModalProps) {
  const isRejecting = rejectingDocumentId === modal.document.id;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-950/15">
        <div className="border-b border-slate-100 bg-rose-50/60 px-5 py-4">
          <p className="text-[11px] font-bold uppercase text-rose-500">ตรวจเอกสาร</p>
          <h2 className="mt-1 text-[16px] font-bold text-slate-950">ตีกลับเอกสาร</h2>
          <p className="mt-1 text-[12px] font-semibold text-slate-500">
            {modal.document.name} / V{modal.document.version_number || 1}
          </p>
        </div>

        <div className="space-y-3 px-5 py-4">
          <label className="block text-[12px] font-semibold text-slate-700">เหตุผลที่ต้องแก้ไข</label>
          <textarea
            value={modal.reason}
            onChange={(event) => onChangeReason(event.target.value)}
            className="min-h-28 w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-medium text-slate-950 shadow-sm transition placeholder:text-slate-400 focus:border-rose-300 focus:outline-none focus:ring-4 focus:ring-rose-50"
            placeholder="ระบุให้ชัด เช่น รูปไม่ชัด, เอกสารผิดชื่อ, ขาดลายเซ็น"
          />
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isRejecting}
            className="rounded-md px-4 py-2.5 text-[13px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!modal.reason.trim() || isRejecting}
            className="rounded-md bg-rose-600 px-4 py-2.5 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-300"
          >
            {isRejecting ? "กำลังตีกลับ..." : "ตีกลับเอกสาร"}
          </button>
        </div>
      </div>
    </div>
  );
}
