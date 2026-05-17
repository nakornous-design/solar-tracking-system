type CompleteStageModalProps = {
  stage: any;
  completingStageId: string | null;
  onClose: () => void;
  onConfirm: (stageId: string) => void;
  stageTitle: (stage: any) => string;
};

function isActiveDocumentVersion(document: any) {
  return document.status !== "SUPERSEDED";
}

function isGatePassed(item: any) {
  return item.status === "PASSED" || item.status === "VERIFIED" || item.status === "WAIVED";
}

function sortProjectDocuments(documents: any[]) {
  return [...documents].sort((a, b) => {
    const labelA = `${a.code || ""}-${a.name || ""}`;
    const labelB = `${b.code || ""}-${b.name || ""}`;
    const labelCompare = labelA.localeCompare(labelB);
    if (labelCompare !== 0) return labelCompare;

    return (b.version_number || 1) - (a.version_number || 1);
  });
}

export default function CompleteStageModal({
  stage,
  completingStageId,
  onClose,
  onConfirm,
  stageTitle,
}: CompleteStageModalProps) {
  const docs = sortProjectDocuments(stage.documents || []).filter(isActiveDocumentVersion);
  const gates = [...(stage.checklists || []), ...docs];
  const passed = gates.filter(isGatePassed).length;
  const isCompleting = completingStageId === stage.id;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-950/15">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
          <p className="text-[11px] font-bold uppercase text-slate-400">Stage Transition</p>
          <h2 className="mt-1 text-[16px] font-bold text-slate-950">ไปขั้นตอนถัดไป</h2>
          <p className="mt-1 text-[12px] font-semibold text-slate-500">{stageTitle(stage)}</p>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="font-semibold text-slate-500">สถานะ</p>
              <p className="mt-1 font-bold text-slate-950">{stage.status}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="font-semibold text-slate-500">Gate</p>
              <p className="mt-1 font-bold text-slate-950">{gates.length ? `${passed}/${gates.length}` : "ไม่มี"}</p>
            </div>
          </div>
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800">
            ระบบจะตรวจ gate ของขั้นตอนนี้ก่อนย้ายไปขั้นตอนถัดไป หากข้อมูลหรือเอกสารบังคับยังไม่ครบ ระบบจะแสดงรายการที่ต้องแก้ไข
          </p>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isCompleting}
            className="rounded-md px-4 py-2.5 text-[13px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={() => onConfirm(stage.id)}
            disabled={isCompleting}
            className="rounded-md bg-slate-950 px-4 py-2.5 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isCompleting ? "กำลังไปขั้นตอนถัดไป..." : "ยืนยันไปขั้นตอนถัดไป"}
          </button>
        </div>
      </div>
    </div>
  );
}
