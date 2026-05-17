import StageIcon from "./StageIcon";
import WorkflowStageBadge from "./WorkflowStageBadge";

type WorkflowStageTileProps = {
  icon: string;
  className?: string;
  badgeTone?: "completed" | "blocked" | "pending" | null;
};

export default function WorkflowStageTile({
  icon,
  className = "",
  badgeTone = null,
}: WorkflowStageTileProps) {
  return (
    <span className={`relative flex h-14 w-14 items-center justify-center rounded-full border-2 text-[13px] transition-transform group-hover:scale-105 ${className}`}>
      <span className="drop-shadow-md">
        <StageIcon name={icon} className="h-7 w-7" />
      </span>
      <WorkflowStageBadge tone={badgeTone} />
    </span>
  );
}
