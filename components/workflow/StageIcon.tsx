import type { ReactNode } from "react";

export default function StageIcon({ name }: { name: string }) {
  const common = { strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 2 };
  const paths: Record<string, ReactNode> = {
    user: <path {...common} d="M15 18.5c0-1.7-1.3-3-3-3s-3 1.3-3 3M12 12.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />,
    pin: <path {...common} d="M12 20s5-4.6 5-9a5 5 0 0 0-10 0c0 4.4 5 9 5 9Zm0-7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />,
    plan: <path {...common} d="M7 4.5h10v15H7v-15Zm3 4h4m-4 3h4m-4 3h2" />,
    file: <path {...common} d="M8 4.5h5l3 3v12H8v-15Zm5 0v4h4m-6 4h4m-4 3h3" />,
    card: <path {...common} d="M4.5 8h15v8.5h-15V8Zm0 3h15M7 14.5h3" />,
    box: <path {...common} d="M5 8.5 12 5l7 3.5-7 3.5-7-3.5Zm0 0v7l7 3.5m7-10.5v7L12 19m0-7v7" />,
    calendar: <path {...common} d="M7 5v3m10-3v3M5 9h14M6 6.5h12v12H6v-12Z" />,
    tool: <path {...common} d="m14.5 6 3.5 3.5-8.5 8.5H6v-3.5L14.5 6Zm-2 2 3.5 3.5" />,
    shield: <path {...common} d="M12 4.5 18 7v4.5c0 3.5-2.2 6.2-6 7.5-3.8-1.3-6-4-6-7.5V7l6-2.5Zm-2 7 1.4 1.4L15 9.3" />,
    handover: <path {...common} d="M7 12.5h4l2 2 4-4M5 18h14M6 7h7l2 3h3" />,
    receipt: <path {...common} d="M7 4.5h10v15l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2v-15Zm3 4h4m-4 3h4m-4 3h2" />,
    check: <path {...common} d="M5 12.5 10 17l9-10" />,
    clock: <path {...common} d="M12 6.5v5l3 2M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />,
    wait: <path {...common} d="M8 4.5h8m-8 15h8M9 4.5v3.2c0 .8.4 1.5 1 2l2 1.3 2-1.3c.6-.5 1-1.2 1-2V4.5M9 19.5v-3.2c0-.8.4-1.5 1-2l2-1.3 2 1.3c.6.5 1 1.2 1 2v3.2" />,
    alert: <path {...common} d="M12 8v4m0 4h.01M10.4 4.8 3.6 17a1.6 1.6 0 0 0 1.4 2.4h14a1.6 1.6 0 0 0 1.4-2.4L13.6 4.8a1.8 1.8 0 0 0-3.2 0Z" />,
  };

  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {paths[name] || paths.file}
    </svg>
  );
}
