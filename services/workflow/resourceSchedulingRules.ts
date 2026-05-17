export type ResourceConflictStatus = "NONE" | "CAPACITY_CONFLICT" | "TIME_CONFLICT" | "SKILL_MISMATCH" | "TERRITORY_MISMATCH";

export function addHours(value: string, hours: number) {
  return new Date(new Date(value).getTime() + hours * 60 * 60 * 1000).toISOString();
}

export function sameScheduleDay(left: string, right: string) {
  return new Date(left).toISOString().slice(0, 10) === new Date(right).toISOString().slice(0, 10);
}

export function overlaps(startA: string, endA: string, startB: string, endB: string) {
  return new Date(startA).getTime() < new Date(endB).getTime() && new Date(startB).getTime() < new Date(endA).getTime();
}

export function skillsContain(skills: unknown, requiredSkill?: string | null) {
  if (!requiredSkill) return true;
  if (!Array.isArray(skills)) return false;
  return skills.map((item) => String(item).toLowerCase()).includes(requiredSkill.toLowerCase());
}

export function detectResourceConflict(input: {
  team: {
    name?: string | null;
    territory?: string | null;
    daily_capacity?: number | null;
    skills?: unknown;
  };
  scheduledStart: string;
  scheduledEnd: string;
  requiredSkill?: string | null;
  territory?: string | null;
  assignments: Array<{
    project_stage_id?: string | null;
    scheduled_start: string;
    scheduled_end?: string | null;
  }>;
  currentProjectStageId: string;
}): { status: ResourceConflictStatus; reason: string | null } {
  if (input.requiredSkill && !skillsContain(input.team.skills, input.requiredSkill)) {
    return { status: "SKILL_MISMATCH", reason: `Team does not have required skill: ${input.requiredSkill}` };
  }

  if (input.territory && input.team.territory && input.territory !== input.team.territory) {
    return { status: "TERRITORY_MISMATCH", reason: `Team territory ${input.team.territory} does not match ${input.territory}.` };
  }

  const existing = input.assignments.filter((assignment) => assignment.project_stage_id !== input.currentProjectStageId);
  const timeConflict = existing.find((assignment) =>
    overlaps(input.scheduledStart, input.scheduledEnd, assignment.scheduled_start, assignment.scheduled_end || addHours(assignment.scheduled_start, 8)),
  );

  if (timeConflict) {
    return { status: "TIME_CONFLICT", reason: "Resource team already has an overlapping assignment." };
  }

  const sameDayAssignments = existing.filter((assignment) => sameScheduleDay(assignment.scheduled_start, input.scheduledStart));
  if (sameDayAssignments.length >= Number(input.team.daily_capacity || 1)) {
    return { status: "CAPACITY_CONFLICT", reason: `Daily capacity exceeded for ${input.team.name || "team"}.` };
  }

  return { status: "NONE", reason: null };
}
