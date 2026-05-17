export type Notice = {
  tone: "success" | "error" | "info";
  title: string;
  message?: string;
};

export default function NoticeToast({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  return (
    <div className="fixed bottom-5 right-5 z-[120] w-[min(360px,calc(100vw-2rem))]">
      <div className={`rounded-lg border bg-white px-4 py-3 shadow-2xl shadow-slate-950/10 ${
        notice.tone === "success"
          ? "border-emerald-200"
          : notice.tone === "error"
            ? "border-rose-200"
            : "border-slate-200"
      }`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={`text-[13px] font-bold ${
              notice.tone === "success"
                ? "text-emerald-700"
                : notice.tone === "error"
                  ? "text-rose-700"
                  : "text-slate-800"
            }`}>
              {notice.title}
            </p>
            {notice.message && <p className="mt-1 line-clamp-2 text-[12px] font-medium text-slate-500">{notice.message}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
