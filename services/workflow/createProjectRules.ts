export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createProjectInputError(data: { customerCode?: string; customerName?: string }) {
  return data.customerCode && data.customerName ? null : "Customer code and customer name are required.";
}

export function getWorkflowTemplate(
  workflowVersion: { workflow_templates?: unknown },
): { code?: string; project_type?: string; payment_type?: string } {
  const template = workflowVersion.workflow_templates;
  if (Array.isArray(template)) return template[0] || {};
  if (template && typeof template === "object") {
    return template as { code?: string; project_type?: string; payment_type?: string };
  }
  return {};
}

export function lockedProjectType(workflowVersion: { workflow_templates?: unknown }, fallback = "RES-S") {
  return getWorkflowTemplate(workflowVersion).project_type || fallback;
}

export function lockedPaymentType(workflowVersion: { workflow_templates?: unknown }, fallback = "CASH") {
  if (getWorkflowTemplate(workflowVersion).code === "RES-S-STANDARD") return fallback;
  return getWorkflowTemplate(workflowVersion).payment_type || fallback;
}

export function initialFinanceState(paymentType = "CASH") {
  return paymentType === "LOAN" ? "LOAN_DOC_COLLECTION" : "CASH_PENDING_PAYMENT";
}

export function standardLookup(standardId?: string) {
  const value = standardId || "V8R2";
  return UUID_RE.test(value) ? { column: "id", value } : { column: "code", value };
}
