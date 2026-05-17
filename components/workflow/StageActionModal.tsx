"use client";

type StageActionModalState = {
  type: "QA" | "BILLING";
  action: string;
  title: string;
  reason: string;
};

type StageActionModalProps = {
  modal: StageActionModalState;
  stageTitle: string;
  stageActionLoading: string | null;
  onChangeReason: (reason: string) => void;
  onClose: () => void;
  onConfirm: (type: "QA" | "BILLING", action: string, reason: string) => void;
};

function getActionTitle(modal: StageActionModalState) {
  if (modal.title) return modal.title;
  if (modal.type === "QA") return modal.action === "FAIL" ? "QA ไม่ผ่าน" : "ส่งกลับแก้งาน QA";
  return "ปฏิเสธวางบิล";
}

export default function StageActionModal({
  modal,
  stageTitle,
  stageActionLoading,
  onChangeReason,
  onClose,
  onConfirm,
}: StageActionModalProps) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-950/15">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
          <p className="text-[11px] font-bold uppercase text-slate-400">{modal.type}</p>
          <h2 className="mt-1 text-[16px] font-bold text-slate-950">{getActionTitle(modal)}</h2>
          <p className="mt-1 text-[12px] font-semibold text-slate-500">{stageTitle}</p>
        </div>

        <div className="space-y-3 px-5 py-4">
          <label className="block text-[12px] font-semibold text-slate-700">เหตุผล</label>
          <textarea
            value={modal.reason}
            onChange={(event) => onChangeReason(event.target.value)}
            className="min-h-28 w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-medium text-slate-950 shadow-sm transition placeholder:text-slate-400 focus:border-amber-300 focus:outline-none focus:ring-4 focus:ring-amber-50"
            placeholder="บันทึกเหตุผลหรือรายละเอียดประกอบ"
          />
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(stageActionLoading)}
            className="rounded-md px-4 py-2.5 text-[13px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={() => onConfirm(modal.type, modal.action, modal.reason.trim())}
            disabled={!modal.reason.trim() || Boolean(stageActionLoading)}
            className="rounded-md bg-slate-950 px-4 py-2.5 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {stageActionLoading ? "กำลังบันทึก..." : "ยืนยัน"}
          </button>
        </div>
      </div>
    </div>
  );
}
