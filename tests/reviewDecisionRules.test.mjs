import test from "node:test";
import assert from "node:assert/strict";

import {
  billingBlockedMetadata,
  billingDecisionError,
  normalizeRequiredReason,
  qaBlockedMetadata,
  qaDecisionError,
} from "../services/workflow/reviewDecisionRules.ts";

test("review decision reason normalization trims empty and useful values", () => {
  assert.equal(normalizeRequiredReason("  needs fix  "), "needs fix");
  assert.equal(normalizeRequiredReason("   "), "");
  assert.equal(normalizeRequiredReason(undefined), "");
});

test("QA decision validation enforces QA stage and fail/rework reason", () => {
  assert.equal(qaDecisionError(null, "PASS"), "QA stage was not found.");
  assert.equal(qaDecisionError({ code: "BILLING" }, "PASS"), "QA outcome can only be submitted for the QA stage.");
  assert.equal(qaDecisionError({ code: "QA" }, "FAIL", " "), "QA fail/rework reason is required.");
  assert.equal(qaDecisionError({ code: "QA" }, "REWORK", "bad wiring"), null);
  assert.equal(qaDecisionError({ code: "QA" }, "PASS"), null);
});

test("Billing decision validation enforces billing stage and reject reason", () => {
  assert.equal(billingDecisionError(null, "APPROVE"), "Billing stage was not found.");
  assert.equal(billingDecisionError({ code: "QA" }, "APPROVE"), "Billing decision can only be submitted for the Billing stage.");
  assert.equal(billingDecisionError({ code: "BILLING" }, "REJECT", " "), "Billing reject reason is required.");
  assert.equal(billingDecisionError({ code: "BILLING" }, "REJECT", "PAC missing"), null);
  assert.equal(billingDecisionError({ code: "BILLING" }, "APPROVE"), null);
});

test("blocked metadata builders preserve evidence and normalized reasons", () => {
  assert.deepEqual(qaBlockedMetadata("REWORK", "  fix inverter photo  ", [{ file: "a.jpg" }]), {
    qa_outcome: "REWORK",
    qa_reason: "fix inverter photo",
    qa_evidence: [{ file: "a.jpg" }],
  });

  assert.deepEqual(billingBlockedMetadata("REJECT", "  PAC missing  ", [{ file: "pac.pdf" }]), {
    billing_decision: "REJECT",
    billing_reason: "PAC missing",
    billing_evidence: [{ file: "pac.pdf" }],
  });
});
