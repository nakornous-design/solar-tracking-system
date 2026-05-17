"use client";

import type { ReactNode } from "react";

type ActiveTab = "dashboard" | "projects" | "field" | "scheduling" | "billing" | "qa" | "approvals" | "settings";

type AppSidebarProps = {
  activeTab: ActiveTab;
  isCollapsed: boolean;
  hasSelectedProject: boolean;
  onHoverChange: (collapsed: boolean) => void;
  onNavigate: (tab: ActiveTab) => void;
};

const tabs: Array<{ id: ActiveTab; label: string; title: string; icon: ReactNode }> = [
  {
    id: "dashboard",
    label: "ภาพรวม",
    title: "ภาพรวม",
    icon: (
      <svg className="h-[17px] w-[17px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4.5 5h5.5v5.5H4.5V5Zm9.5 0h5.5v5.5H14V5ZM4.5 14h5.5v5H4.5v-5Zm9.5 0h5.5v5H14v-5Z" />
      </svg>
    ),
  },
  {
    id: "projects",
    label: "โครงการ",
    title: "โครงการ",
    icon: (
      <svg className="h-[17px] w-[17px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7h5.2l1.6 2H20v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" />
      </svg>
    ),
  },
  {
    id: "field",
    label: "หน้างาน",
    title: "งานหน้างาน",
    icon: (
      <svg className="h-[17px] w-[17px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 18.5c0-2-1.8-3.5-4-3.5s-4 1.5-4 3.5M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm6 4.5c1.5.4 2.5 1.5 2.5 3M17 12a2.5 2.5 0 0 0 0-5M6 16.5c-1.5.4-2.5 1.5-2.5 3M7 12a2.5 2.5 0 0 1 0-5" />
      </svg>
    ),
  },
  {
    id: "scheduling",
    label: "ตารางงาน",
    title: "ตารางงานติดตั้ง",
    icon: (
      <svg className="h-[17px] w-[17px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 5v3m10-3v3M5 9h14M6 6.5h12v12H6v-12Zm3 6h2.5m2 0H16m-7 3h2.5m2 0H16" />
      </svg>
    ),
  },
  {
    id: "billing",
    label: "วางบิล",
    title: "ศูนย์วางบิล",
    icon: (
      <svg className="h-[17px] w-[17px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 4.5h12v15H6v-15Zm3 5h6m-6 3h6m-6 3h3M12 7v11" />
      </svg>
    ),
  },
  {
    id: "qa",
    label: "ตรวจคุณภาพ",
    title: "ตรวจคุณภาพ",
    icon: (
      <svg className="h-[17px] w-[17px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4.5 18 7v4.5c0 3.5-2.2 6.2-6 7.5-3.8-1.3-6-4-6-7.5V7l6-2.5Zm-2 7 1.4 1.4L15 9.3" />
      </svg>
    ),
  },
  {
    id: "approvals",
    label: "อนุมัติ",
    title: "อนุมัติและ Override",
    icon: (
      <svg className="h-[17px] w-[17px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12.5 11 14.5 15.5 9.5M6 4.5h12v5.8c0 4.4-2.3 7.2-6 9.2-3.7-2-6-4.8-6-9.2V4.5Z" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "ตั้งค่า",
    title: "ตั้งค่าระบบ",
    icon: (
      <svg className="h-[17px] w-[17px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0-12v2m0 13v2m8.5-8.5h-2m-13 0h-2m14.5-6.5-1.4 1.4M6.9 17.1l-1.4 1.4m0-13 1.4 1.4m10.2 10.2 1.4 1.4" />
      </svg>
    ),
  },
];

function navButtonClass(active: boolean) {
  return `flex h-10 w-full items-center gap-3 rounded-md px-3 text-[13px] transition-colors ${
    active
      ? "bg-emerald-50 font-bold text-emerald-800 ring-1 ring-emerald-100"
      : "font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-950"
  }`;
}

export default function AppSidebar({
  activeTab,
  isCollapsed,
  onHoverChange,
  onNavigate,
}: AppSidebarProps) {
  return (
    <aside
      onMouseEnter={() => onHoverChange(false)}
      onMouseLeave={() => onHoverChange(true)}
      className={`relative z-20 flex h-screen shrink-0 flex-col border-r border-slate-200 bg-white text-slate-600 shadow-sm transition-all duration-200 ease-out ${
        isCollapsed ? "w-16" : "w-56"
      }`}
    >
      <div className={`flex h-16 items-center gap-3 border-b border-slate-200 transition-all ${isCollapsed ? "justify-center px-0" : "px-4"}`}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-500">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13 2 4 14h7l-1 8 10-13h-7V2Z" />
          </svg>
        </div>
        <div className={`min-w-0 transition-opacity duration-150 ${isCollapsed ? "pointer-events-none hidden opacity-0" : "opacity-100"}`}>
          <p className="truncate text-[14px] font-black text-slate-950">SunBase</p>
          <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">Operations</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onNavigate(tab.id)}
            title={tab.title}
            aria-label={tab.title}
            className={`group relative ${navButtonClass(activeTab === tab.id)} ${isCollapsed ? "justify-center px-0" : ""}`}
          >
            {tab.icon}
            <span className={`truncate transition-opacity duration-150 ${isCollapsed ? "pointer-events-none hidden opacity-0" : "opacity-100"}`}>{tab.label}</span>
            {isCollapsed && (
              <span className="pointer-events-none absolute left-[calc(100%+8px)] top-1/2 z-30 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 shadow-lg group-hover:block group-focus-visible:block">
                {tab.title}
              </span>
            )}
          </button>
        ))}
      </nav>
    </aside>
  );
}
