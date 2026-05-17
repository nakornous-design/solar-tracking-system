import test from "node:test";
import assert from "node:assert/strict";

import {
  approvalDecisionError,
  approvalDecisionSeverity,
  gateOverrideRequestError,
  gateOverrideScope,
  normalizeApprovalReason,
} from "../services/workflow/approvalRules.ts";

test("approval reason normalization and request validation", () => {
  assert.equal(normalizeApprovalReason("  override needed  "), "override needed");
  assert.equal(gateOverrideRequestError("  "), "Approval reason is required.");
  assert.equal(gateOverrideRequestError("valid reason"), null);
});

test("approval decision validation only allows pending requests", () => {
  assert.equal(approvalDecisionError(null), "Approval request was not found.");
  assert.equal(approvalDecisionError({ status: "APPROVED" }), "Only pending approval requests can be decided.");
  assert.equal(approvalDecisionError({ status: "PENDING" }), null);
});

test("approval helper payloads match gate override policy", () => {
  assert.deepEqual(gateOverrideScope("stage-1"), {
    project_stage_id: "stage-1",
    applies_to: "OVERRIDEABLE_GATES",
  });
  assert.equal(approvalDecisionSeverity("APPROVED"), "INFO");
  assert.equal(approvalDecisionSeverity("REJECTED"), "WARNING");
  assert.equal(approvalDecisionSeverity("CANCELLED"), "WARNING");
});
