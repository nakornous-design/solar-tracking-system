import test from "node:test";
import assert from "node:assert/strict";

import { submitBillingDecision } from "../services/workflow/billingEngine.ts";
import { submitQaOutcome } from "../services/workflow/qaEngine.ts";
import { fakeSupabase } from "./helpers/fakeSupabase.mjs";

function baseRuntimeDb() {
  return {
    projects: [{ id: "project-1", status: "IN_PROGRESS", current_stage_id: "stage-qa", sla_status: "ON_TRACK" }],
    project_stages: [
      {
        id: "stage-install",
        project_id: "project-1",
        workflow_stage_id: "wf-install",
        order_index: 8,
        code: "INSTALLATION",
        name: "Installation",
        owner_role: "contractor",
        status: "COMPLETED",
        workflow_stages: { sla_hours: 72 },
      },
      {
        id: "stage-qa",
        project_id: "project-1",
        workflow_stage_id: "wf-qa",
        order_index: 9,
        code: "QA",
        name: "QA",
        owner_role: "qa",
        status: "IN_PROGRESS",
        metadata: {},
        workflow_stages: { workflow_version_id: "version-1" },
      },
      {
        id: "stage-handover",
        project_id: "project-1",
        workflow_stage_id: "wf-handover",
        order_index: 10,
        code: "HANDOVER",
        name: "Handover",
        owner_role: "ops",
        status: "PENDING",
        workflow_stages: { sla_hours: 48 },
      },
      {
        id: "stage-billing",
        project_id: "project-1",
        workflow_stage_id: "wf-billing",
        order_index: 11,
        code: "BILLING",
        name: "Billing",
        owner_role: "finance",
        status: "PENDING",
        metadata: {},
        workflow_stages: { workflow_version_id: "version-1" },
      },
      {
        id: "stage-closure",
        project_id: "project-1",
        workflow_stage_id: "wf-closure",
        order_index: 12,
        code: "CLOSURE",
        name: "Closure",
        owner_role: "ops",
        status: "PENDING",
        workflow_stages: { sla_hours: 24 },
      },
    ],
    workflow_transitions: [
      { id: "transition-qa-forward", workflow_version_id: "version-1", from_stage_id: "wf-qa", to_stage_id: "wf-handover", type: "FORWARD", is_active: true },
      { id: "transition-qa-rework", workflow_version_id: "version-1", from_stage_id: "wf-qa", to_stage_id: "wf-install", type: "REWORK", is_active: true },
      { id: "transition-billing-forward", workflow_version_id: "version-1", from_stage_id: "wf-billing", to_stage_id: "wf-closure", type: "FORWARD", is_active: true },
      { id: "transition-billing-rework", workflow_version_id: "version-1", from_stage_id: "wf-billing", to_stage_id: "wf-handover", type: "REWORK", is_active: true },
    ],
    project_checklists: [
      { id: "qa-mechanical", project_stage_id: "stage-qa", code: "QA_MECHANICAL", label: "QA Mechanical", status: "PENDING", gate_severity: "HARD", is_required: true },
      { id: "qa-electrical", project_stage_id: "stage-qa", code: "QA_ELECTRICAL", label: "QA Electrical", status: "PENDING", gate_severity: "HARD", is_required: true },
      { id: "billing-review", project_stage_id: "stage-billing", code: "BILLING_REVIEW_COMPLETE", label: "Billing review complete", status: "PENDING", gate_severity: "HARD", is_required: true },
    ],
    project_documents: [],
    approval_requests: [],
    project_exceptions: [],
    activity_logs: [],
    notifications: [],
    notification_deliveries: [],
  };
}

test("submitQaOutcome PASS completes QA checklists and moves to Handover", async () => {
  const db = baseRuntimeDb();
  const result = await submitQaOutcome(fakeSupabase(db), "project-1", "stage-qa", "PASS");

  assert.equal(result.ok, true);
  assert.equal(result.nextStageId, "stage-handover");
  assert.equal(db.project_checklists.find((item) => item.id === "qa-mechanical").status, "PASSED");
  assert.equal(db.project_checklists.find((item) => item.id === "qa-electrical").status, "PASSED");
  assert.equal(db.project_stages.find((stage) => stage.id === "stage-qa").status, "COMPLETED");
  assert.equal(db.project_stages.find((stage) => stage.id === "stage-handover").status, "IN_PROGRESS");
  assert.equal(db.activity_logs.at(-1).action, "STAGE_TRANSITIONED_FORWARD");
});

test("submitQaOutcome REWORK creates QA exception and routes back to Installation", async () => {
  const db = baseRuntimeDb();
  const result = await submitQaOutcome(
    fakeSupabase(db),
    "project-1",
    "stage-qa",
    "REWORK",
    "Grounding photo is missing.",
    [{ fileId: "drive-photo-1" }],
  );

  const qaStage = db.project_stages.find((stage) => stage.id === "stage-qa");
  const installStage = db.project_stages.find((stage) => stage.id === "stage-install");

  assert.equal(result.ok, true);
  assert.equal(result.nextStageId, "stage-install");
  assert.equal(qaStage.status, "BLOCKED");
  assert.equal(qaStage.metadata.rework_reason, "Grounding photo is missing.");
  assert.equal(installStage.status, "IN_PROGRESS");
  assert.equal(db.project_exceptions[0].category, "QA");
  assert.equal(db.project_exceptions[0].title, "QA rework required");
  assert.deepEqual(db.activity_logs.map((log) => log.action), ["QA_OUTCOME_SUBMITTED", "STAGE_TRANSITIONED_REWORK"]);
});

test("submitBillingDecision APPROVE passes billing gate and moves to Closure", async () => {
  const db = baseRuntimeDb();
  db.projects[0].current_stage_id = "stage-billing";
  db.project_stages.find((stage) => stage.id === "stage-qa").status = "COMPLETED";
  db.project_stages.find((stage) => stage.id === "stage-handover").status = "COMPLETED";
  db.project_stages.find((stage) => stage.id === "stage-billing").status = "IN_PROGRESS";

  const result = await submitBillingDecision(fakeSupabase(db), "project-1", "stage-billing", "APPROVE");

  assert.equal(result.ok, true);
  assert.equal(result.nextStageId, "stage-closure");
  assert.equal(db.project_checklists.find((item) => item.id === "billing-review").status, "PASSED");
  assert.equal(db.project_stages.find((stage) => stage.id === "stage-billing").status, "COMPLETED");
  assert.equal(db.project_stages.find((stage) => stage.id === "stage-closure").status, "IN_PROGRESS");
});

test("submitBillingDecision REJECT creates billing exception and routes back to Handover", async () => {
  const db = baseRuntimeDb();
  db.projects[0].current_stage_id = "stage-billing";
  db.project_stages.find((stage) => stage.id === "stage-qa").status = "COMPLETED";
  db.project_stages.find((stage) => stage.id === "stage-handover").status = "COMPLETED";
  db.project_stages.find((stage) => stage.id === "stage-billing").status = "IN_PROGRESS";

  const result = await submitBillingDecision(
    fakeSupabase(db),
    "project-1",
    "stage-billing",
    "REJECT",
    "PAC is missing.",
    [{ fileId: "pac-review-note" }],
  );

  const billingStage = db.project_stages.find((stage) => stage.id === "stage-billing");
  const handoverStage = db.project_stages.find((stage) => stage.id === "stage-handover");

  assert.equal(result.ok, true);
  assert.equal(result.nextStageId, "stage-handover");
  assert.equal(billingStage.status, "BLOCKED");
  assert.equal(billingStage.metadata.rework_reason, "PAC is missing.");
  assert.equal(handoverStage.status, "IN_PROGRESS");
  assert.equal(db.project_exceptions[0].category, "BILLING");
  assert.equal(db.project_exceptions[0].title, "Billing rejected");
  assert.deepEqual(db.activity_logs.map((log) => log.action), ["BILLING_DECISION_SUBMITTED", "STAGE_TRANSITIONED_REWORK"]);
});
