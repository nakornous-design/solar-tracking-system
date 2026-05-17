export default function PreviewImageModal({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/90 p-4 backdrop-blur-md" onClick={onClose}>
      <button
        type="button"
        className="absolute right-6 top-6 rounded-full bg-white/10 p-3 text-white/50 transition-all hover:text-white"
        onClick={onClose}
      >
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
      <div className="flex h-full w-full max-w-5xl items-center justify-center p-4" onClick={(event) => event.stopPropagation()}>
        <img src={src} alt="" className="max-h-full max-w-full rounded-xl object-contain shadow-2xl" />
      </div>
    </div>
  );
}
