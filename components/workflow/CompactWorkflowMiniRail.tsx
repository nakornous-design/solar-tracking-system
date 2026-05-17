import { stageSolidIconClass, stageVisual } from "../../lib/project-ui";
import StageIcon from "./StageIcon";
import WorkflowStageConnector from "./WorkflowStageConnector";

type WorkflowRailStage = {
  code?: string;
  name?: string;
  workflow_definitions?: {
    step_name?: string;
  };
};

type WorkflowRailGroup = {
  key: string;
  label?: string;
  order: number;
  codes?: string[];
  stages: WorkflowRailStage[];
};

type CompactWorkflowMiniRailProps = {
  groups: WorkflowRailGroup[];
  currentGroup?: WorkflowRailGroup | null;
  currentGroupOrder?: number;
};

export default function CompactWorkflowMiniRail({
  groups,
  currentGroup,
  currentGroupOrder = 0,
}: CompactWorkflowMiniRailProps) {
  return (
    <div className="flex min-w-0 items-center overflow-hidden">
      {groups.map((railGroup, railIndex) => {
        const isCurrent = railGroup.key === currentGroup?.key;
        const isDone = currentGroupOrder > 0 && railGroup.order < currentGroupOrder;
        const railStage = railGroup.stages[0] || { code: railGroup.codes?.[0] || railGroup.key };
        const railVisual = stageVisual(railStage);
        const solidRailClass = stageSolidIconClass(railStage);
        const stageLabel = railGroup.label || railStage.workflow_definitions?.step_name || railStage.name || railGroup.key;

        return (
          <span key={railGroup.key} className="flex flex-1 items-center" title={stageLabel}>
            {railIndex > 0 && (
              <WorkflowStageConnector
                variant="inline"
                tone={currentGroupOrder > 0 && railGroup.order <= currentGroupOrder ? "active" : "inactive"}
              />
            )}
            <span
              className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition ${
                isCurrent
                  ? `${solidRailClass} scale-105 border-white shadow-sm`
                  : isDone
                    ? solidRailClass
                    : "border-slate-300 bg-slate-200 text-slate-500"
              }`}
              aria-label={stageLabel}
            >
              <span className={`${isDone || isCurrent ? "text-white" : "text-slate-500"}`}>
                <StageIcon name={railVisual.icon} className="h-4 w-4" />
              </span>
            </span>
          </span>
        );
      })}
    </div>
  );
}
