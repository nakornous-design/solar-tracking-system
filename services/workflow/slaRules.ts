export type SlaStatus = "ON_TRACK" | "NEAR_SLA" | "OVER_SLA" | "SLA_PAUSED";

export type ProjectStageSlaRow = {
  id: string;
  name: string;
  owner_role: string | null;
  status: string;
  sla_status: SlaStatus;
  due_at: string | null;
};

export const ACTIVE_STAGE_STATUSES = ["IN_PROGRESS", "WAITING", "BLOCKED"];
export const NEAR_SLA_WINDOW_MS = 12 * 60 * 60 * 1000;

export const SLA_PRIORITY: Record<SlaStatus, number> = {
  ON_TRACK: 0,
  NEAR_SLA: 1,
  OVER_SLA: 2,
  SLA_PAUSED: 3,
};

export function calculateStageSlaStatus(stage: ProjectStageSlaRow, nowMs: number): SlaStatus {
  if (stage.sla_status === "SLA_PAUSED") return "SLA_PAUSED";
  if (!ACTIVE_STAGE_STATUSES.includes(stage.status) || !stage.due_at) return "ON_TRACK";

  const dueMs = new Date(stage.due_at).getTime();
  if (Number.isNaN(dueMs)) return "ON_TRACK";
  if (dueMs <= nowMs) return "OVER_SLA";
  if (dueMs - nowMs <= NEAR_SLA_WINDOW_MS) return "NEAR_SLA";

  return "ON_TRACK";
}

export function maxSlaStatus(statuses: SlaStatus[]) {
  return statuses.reduce<SlaStatus>(
    (current, next) => (SLA_PRIORITY[next] > SLA_PRIORITY[current] ? next : current),
    "ON_TRACK",
  );
}
