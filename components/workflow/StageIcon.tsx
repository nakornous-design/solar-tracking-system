import type { ReactNode } from "react";

export default function StageIcon({ name }: { name: string }) {
  const common = { strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 2 };
  const paths: Record<string, ReactNode> = {
    user: <path {...common} d="M15 18.5c0-1.7-1.3-3-3-3s-3 1.3-3 3M12 12.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />,
    pin: <path {...common} d="M12 20s5-4.6 5-9a5 5 0 0 0-10 0c0 4.4 5 9 5 9Zm0-7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />,
    plan: <path {...common} d="M7 4.5h10v15H7v-15Zm3 4h4m-4 3h4m-4 3h2" />,
    file: <path {...common} d="M8 4.5h5l3 3v12H8v-15Zm5 0v4h4m-6 4h4m-4 3h3" />,
    fileUp: <path {...common} d="M8 4.5h5l3 3v12H8v-15Zm5 0v4h4m-5 8v-5m-2 2 2-2 2 2" />,
    fileWarning: <path {...common} d="M8 4.5h5l3 3v12H8v-15Zm5 0v4h4m-4 3v3m0 3h.01" />,
    folderPlus: <path {...common} d="M4 7.5h6l2 2h8v8.5H4V7.5Zm8 4v4m-2-2h4" />,
    folderCheck: <path {...common} d="M4 7.5h6l2 2h8v8.5H4V7.5Zm5.5 6 1.5 1.5 3.5-3.5" />,
    documentEye: (
      <>
        <path {...common} d="M7 4.5h6l4 4v5.2M13 4.5v4h4M7 4.5v15h6.2" />
        <path {...common} d="M13.5 17s2.1-3 5-3 5 3 5 3-2.1 3-5 3-5-3-5-3Z" />
        <path {...common} d="M18.5 18.4a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8Z" />
      </>
    ),
    walk: <path {...common} d="M13 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM10.5 9.5l2-2 2.5 2.5 2 1M12.5 7.5l-1.5 5 3 2.5M11 12.5l-3 6M14 15l2 4" />,
    card: <path {...common} d="M4.5 8h15v8.5h-15V8Zm0 3h15M7 14.5h3" />,
    creditCard: <path {...common} d="M4.5 7.5h15v9h-15v-9Zm0 3h15M7 14.5h3" />,
    quote: <path {...common} d="M6 5.5h12v13H6v-13Zm3 4h6m-6 3h6m-6 3h3M15.5 16.5l3 3" />,
    box: <path {...common} d="M5 8.5 12 5l7 3.5-7 3.5-7-3.5Zm0 0v7l7 3.5m7-10.5v7L12 19m0-7v7" />,
    truck: <path {...common} d="M3.5 7.5h10v8h-10v-8Zm10 2.5h3l3 3v2.5h-6V10Zm-7 8a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Zm10 0a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z" />,
    calendar: <path {...common} d="M7 5v3m10-3v3M5 9h14M6 6.5h12v12H6v-12Z" />,
    tool: <path {...common} d="m14.5 6 3.5 3.5-8.5 8.5H6v-3.5L14.5 6Zm-2 2 3.5 3.5" />,
    solar: <path {...common} d="M4 13.5h16M6 9.5h12l2 7H4l2-7Zm2 0-1.2 7m5.2-7v7m4-7 1.2 7M8.5 5.5h7" />,
    shield: <path {...common} d="M12 4.5 18 7v4.5c0 3.5-2.2 6.2-6 7.5-3.8-1.3-6-4-6-7.5V7l6-2.5Zm-2 7 1.4 1.4L15 9.3" />,
    handover: <path {...common} d="M7 12.5h4l2 2 4-4M5 18h14M6 7h7l2 3h3" />,
    receipt: <path {...common} d="M7 4.5h10v15l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2v-15Zm3 4h4m-4 3h4m-4 3h2" />,
    check: <path {...common} d="M5 12.5 10 17l9-10" />,
    expand: <path {...common} d="M8.5 4.5h-4v4m0-4 5.5 5.5m5.5-5.5h4v4m0-4L14 10m5.5 5.5v4h-4m4 0L14 14m-5.5 5.5h-4v-4m0 4L10 14" />,
    chevronLeft: <path {...common} d="m15 6-6 6 6 6" />,
    chevronRight: <path {...common} d="m9 6 6 6-6 6" />,
    arrowRight: <path {...common} d="M5 12h14m-5-5 5 5-5 5" />,
    activity: <path {...common} d="M3.5 12h4l2-5 5 10 2-5h4" />,
    info: <path {...common} d="M12 17v-5m0-4h.01M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />,
    eye: <path {...common} d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />,
    clock: <path {...common} d="M12 6.5v5l3 2M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />,
    wait: <path {...common} d="M8 4.5h8m-8 15h8M9 4.5v3.2c0 .8.4 1.5 1 2l2 1.3 2-1.3c.6-.5 1-1.2 1-2V4.5M9 19.5v-3.2c0-.8.4-1.5 1-2l2-1.3 2 1.3c.6.5 1 1.2 1 2v3.2" />,
    alert: <path {...common} d="M12 8v4m0 4h.01M10.4 4.8 3.6 17a1.6 1.6 0 0 0 1.4 2.4h14a1.6 1.6 0 0 0 1.4-2.4L13.6 4.8a1.8 1.8 0 0 0-3.2 0Z" />,
    bot: <path {...common} d="M12 5V3m-5 8h10M7 8h10v8.5H7V8Zm-2 3v3m14-3v3M10 12h.01M14 12h.01M10 15h4" />,
  };

  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {paths[name] || paths.file}
    </svg>
  );
}
