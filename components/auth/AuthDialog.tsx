"use client";

import { useState } from "react";

type AuthDialogProps = {
  isOpen: boolean;
  loading: boolean;
  error: string;
  onClose: () => void;
  onSignIn: (email: string, password: string) => void;
};

export default function AuthDialog({
  isOpen,
  loading,
  error,
  onClose,
  onSignIn,
}: AuthDialogProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-950/15">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-5 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">เข้าสู่ระบบ</p>
            <h2 className="mt-1 text-[16px] font-bold text-slate-950">ลงชื่อเข้าใช้</h2>
            <p className="mt-1 text-[12px] font-semibold text-slate-500">ใช้บัญชีที่ผู้ดูแลระบบสร้างไว้ เพื่อเปิดสิทธิ์ตาม role</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="ปิดหน้าต่างเข้าสู่ระบบ"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form
          className="space-y-3 px-5 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSignIn(email, password);
          }}
        >
          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700">
              {error}
            </div>
          )}

          <input
            type="text"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email / User ID"
            className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="รหัสผ่าน"
            className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50"
          />

          <button
            type="submit"
            disabled={loading}
            className="h-11 w-full rounded-md bg-slate-950 px-4 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>
      </div>
    </div>
  );
}
