"use client";

type GateBlockModalProps = {
  modal: {
    stageId: string;
    title: string;
    message: string;
    violations: any[];
  };
  onClose: () => void;
  onOpenStage: (stageId: string) => void;
  onRequestOverride: (stageId: string) => void;
};

export default function GateBlockModal({
  modal,
  onClose,
  onOpenStage,
  onRequestOverride,
}: GateBlockModalProps) {
  const hardCount = modal.violations.filter((violation) => violation.severity === "HARD").length;
  const overrideableCount = modal.violations.filter((violation) => violation.severity === "OVERRIDEABLE").length;
  const canRequestOverride = overrideableCount > 0;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-950/15">
        <div className="border-b border-slate-100 bg-amber-50 px-5 py-4">
          <p className="text-[11px] font-bold uppercase text-amber-600">ติด Hard Gate</p>
          <h2 className="mt-1 text-[16px] font-bold text-slate-950">{modal.title}</h2>
          <p className="mt-1 text-[12px] font-semibold text-amber-700">{modal.message}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold">
            <span className="rounded border border-rose-200 bg-white px-2 py-1 text-rose-700">HARD {hardCount}</span>
            <span className="rounded border border-amber-200 bg-white px-2 py-1 text-amber-700">
              OVERRIDEABLE {overrideableCount}
            </span>
          </div>
        </div>

        <div className="max-h-[340px] overflow-y-auto px-5 py-4">
          <div className="space-y-2">
            {modal.violations.map((violation) => (
              <div key={`${violation.type}-${violation.id}`} className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-bold text-slate-950">{violation.label || violation.code}</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-400">
                      {violation.code} / {violation.type}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={`rounded border px-2 py-1 text-[10px] font-bold ${
                        violation.severity === "HARD"
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}
                    >
                      {violation.severity}
                    </span>
                    <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-500">
                      {violation.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2.5 text-[13px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
          >
            ปิด
          </button>
          <button
            type="button"
            onClick={() => onOpenStage(modal.stageId)}
            className="rounded-md bg-slate-950 px-4 py-2.5 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-slate-800"
          >
            เปิดรายละเอียดขั้นตอน
          </button>
          {canRequestOverride && (
            <button
              type="button"
              onClick={() => onRequestOverride(modal.stageId)}
              className="rounded-md bg-amber-600 px-4 py-2.5 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-amber-700"
            >
              ขอ Override
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
