import StageIcon from "./StageIcon";

type WorkflowStageBadgeTone = "completed" | "blocked" | "pending";

type WorkflowStageBadgeProps = {
  tone?: WorkflowStageBadgeTone | null;
  className?: string;
};

export default function WorkflowStageBadge({ tone, className = "" }: WorkflowStageBadgeProps) {
  if (!tone) return null;

  if (tone === "completed") {
    return (
      <span className={`absolute -right-1 bottom-0 flex h-5 w-5 items-center justify-center rounded-full bg-white text-emerald-500 shadow-md shadow-emerald-200 ${className}`}>
        <StageIcon name="checkCircle" className="h-5 w-5" />
      </span>
    );
  }

  if (tone === "blocked") {
    return (
      <span className={`absolute -right-1 bottom-0 flex h-5 w-5 items-center justify-center rounded-full bg-white text-rose-600 shadow-md shadow-rose-200 ${className}`}>
        <StageIcon name="warningCircle" className="h-5 w-5" />
      </span>
    );
  }

  return (
    <span className={`absolute -right-1 bottom-0 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-amber-500 text-white shadow-md shadow-amber-200 ${className}`}>
      <StageIcon name="waitBadge" className="h-3 w-3" />
    </span>
  );
}
