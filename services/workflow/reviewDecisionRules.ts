export type ReviewDecision = "PASS" | "FAIL" | "REWORK" | "APPROVE" | "REJECT";

export function normalizeRequiredReason(reason?: string) {
  return reason?.trim() || "";
}

export function qaDecisionError(stage: { code?: string } | null | undefined, outcome: "PASS" | "FAIL" | "REWORK", reason?: string) {
  if (!stage) return "QA stage was not found.";
  if (stage.code !== "QA") return "QA outcome can only be submitted for the QA stage.";
  if ((outcome === "FAIL" || outcome === "REWORK") && !normalizeRequiredReason(reason)) {
    return "QA fail/rework reason is required.";
  }
  return null;
}

export function billingDecisionError(stage: { code?: string } | null | undefined, decision: "APPROVE" | "REJECT", reason?: string) {
  if (!stage) return "Billing stage was not found.";
  if (stage.code !== "BILLING") return "Billing decision can only be submitted for the Billing stage.";
  if (decision === "REJECT" && !normalizeRequiredReason(reason)) {
    return "Billing reject reason is required.";
  }
  return null;
}

export function qaBlockedMetadata(outcome: "FAIL" | "REWORK", reason: string, evidence: unknown[] = []) {
  return {
    qa_outcome: outcome,
    qa_reason: normalizeRequiredReason(reason),
    qa_evidence: evidence,
  };
}

export function billingBlockedMetadata(decision: "REJECT", reason: string, evidence: unknown[] = []) {
  return {
    billing_decision: decision,
    billing_reason: normalizeRequiredReason(reason),
    billing_evidence: evidence,
  };
}
