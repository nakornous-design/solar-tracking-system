import type { CSSProperties } from "react";

type WorkflowStageConnectorProps = {
  className?: string;
  style?: CSSProperties;
  tone?: "active" | "inactive";
  variant?: "absolute" | "inline";
};

export default function WorkflowStageConnector({
  className = "",
  style,
  tone = "inactive",
  variant = "absolute",
}: WorkflowStageConnectorProps) {
  const toneClass = tone === "active" ? "bg-emerald-500" : "bg-slate-300";
  const baseClass = variant === "inline"
    ? "h-[2px] flex-1 rounded-full"
    : "absolute top-7 h-0.5 rounded-full";

  return <span className={`${baseClass} ${toneClass} ${className}`} style={style} />;
}
