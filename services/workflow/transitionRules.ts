export function dueAtFromNow(slaHours: number | null | undefined, nowMs = Date.now()) {
  if (!slaHours) return null;
  return new Date(nowMs + slaHours * 60 * 60 * 1000).toISOString();
}

export function forwardTransitionError(stage: { status?: string } | null | undefined) {
  if (!stage) return "Current project stage was not found.";
  if (stage.status !== "IN_PROGRESS" && stage.status !== "BLOCKED") {
    return "Only an active or blocked stage can be completed.";
  }
  return null;
}

export function relationFirst<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

export function workflowVersionIdFromStage(stage: { workflow_stages?: { workflow_version_id?: string } | Array<{ workflow_version_id?: string }> } | null | undefined) {
  return relationFirst(stage?.workflow_stages)?.workflow_version_id || null;
}

export function slaHoursFromRelatedStage(stage: { workflow_stages?: { sla_hours?: number | null } | Array<{ sla_hours?: number | null }> } | null | undefined) {
  return relationFirst(stage?.workflow_stages)?.sla_hours ?? null;
}

export function transitionMatchesProject(
  transition: { rule_config?: { when_payment_type?: string | null; when_finance_state?: string | string[] | null } | null },
  project: { payment_type?: string | null; finance_state?: string | null },
) {
  const rules = transition.rule_config || {};
  if (rules.when_payment_type && rules.when_payment_type !== project.payment_type) return false;
  if (Array.isArray(rules.when_finance_state)) {
    return rules.when_finance_state.includes(String(project.finance_state || ""));
  }
  if (rules.when_finance_state && rules.when_finance_state !== project.finance_state) return false;
  return true;
}
