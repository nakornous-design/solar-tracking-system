"use client";

type OverrideModalProps = {
  modal: {
    stage: any;
    reason: string;
  };
  approvalLoading: string | null;
  stageTitle: (stage: any) => string;
  onChangeReason: (reason: string) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export default function OverrideModal({
  modal,
  approvalLoading,
  stageTitle,
  onChangeReason,
  onClose,
  onConfirm,
}: OverrideModalProps) {
  const isSubmitting = approvalLoading === `request:${modal.stage.id}`;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-950/15">
        <div className="border-b border-slate-100 bg-amber-50 px-5 py-4">
          <p className="text-[11px] font-bold uppercase text-amber-600">Gate Override</p>
          <h2 className="mt-1 text-[16px] font-bold text-slate-950">ขออนุมัติข้าม Gate</h2>
          <p className="mt-1 text-[12px] font-semibold text-slate-500">{stageTitle(modal.stage)}</p>
        </div>

        <div className="space-y-3 px-5 py-4">
          <label className="block text-[12px] font-semibold text-slate-700">เหตุผลที่ต้องขออนุมัติ</label>
          <textarea
            value={modal.reason}
            onChange={(event) => onChangeReason(event.target.value)}
            className="min-h-28 w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-medium text-slate-950 shadow-sm transition placeholder:text-slate-400 focus:border-amber-300 focus:outline-none focus:ring-4 focus:ring-amber-50"
            placeholder="อธิบายเหตุผล เช่น ต้องติดตั้งก่อนเอกสารครบ เพราะลูกค้ามีนัดตรวจรับ"
          />
          <p className="text-[11px] font-medium text-amber-700">คำขอนี้จะถูกส่งให้ผู้มีสิทธิ์อนุมัติ และถูกบันทึกใน audit log</p>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-md px-4 py-2.5 text-[13px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!modal.reason.trim() || isSubmitting}
            className="rounded-md bg-amber-600 px-4 py-2.5 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-300"
          >
            {isSubmitting ? "กำลังส่งคำขอ..." : "ส่งคำขออนุมัติ"}
          </button>
        </div>
      </div>
    </div>
  );
}
