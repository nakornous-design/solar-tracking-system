"use client";

import type { UploadRetryItem } from "@/lib/upload-retry-queue";

type UploadRetryQueueProps = {
  items: UploadRetryItem[];
  processingId: string | null;
  onRetry: (item: UploadRetryItem) => void;
  onRemove: (item: UploadRetryItem) => void;
};

export default function UploadRetryQueue({ items, processingId, onRetry, onRemove }: UploadRetryQueueProps) {
  if (items.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50/60 shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-amber-100 px-4 py-3">
        <div>
          <h4 className="text-[13px] font-bold text-slate-950">ไฟล์ที่รออัปโหลดซ้ำ</h4>
          <p className="text-[12px] font-medium text-amber-700">ไฟล์ถูกเก็บไว้ในเครื่องนี้ชั่วคราว กดส่งใหม่เมื่อสัญญาณอินเทอร์เน็ตนิ่ง</p>
        </div>
        <span className="rounded border border-amber-200 bg-white px-2 py-1 text-[10px] font-bold text-amber-700">{items.length} รอส่ง</span>
      </div>
      <div className="divide-y divide-amber-100 bg-white/70">
        {items.map((item) => (
          <div key={item.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <p className="truncate text-[12px] font-bold text-slate-950">{item.fileName}</p>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">
                {item.payload.milestoneName} / ลองส่งแล้ว {item.attempts} ครั้ง
                {item.lastError ? ` / ${item.lastError}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onRetry(item)}
                disabled={processingId === item.id}
                className="rounded-md bg-slate-950 px-3 py-2 text-[11px] font-bold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {processingId === item.id ? "กำลังส่ง..." : "ส่งใหม่"}
              </button>
              <button
                type="button"
                onClick={() => onRemove(item)}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-600 shadow-sm hover:bg-slate-50"
              >
                ลบออก
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
