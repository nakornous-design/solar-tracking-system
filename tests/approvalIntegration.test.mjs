import test from "node:test";
import assert from "node:assert/strict";

import { createGateOverrideRequest, decideApprovalRequest } from "../services/workflow/approvalEngine.ts";
import { transitionStageForward } from "../services/workflow/transitionEngine.ts";
import { fakeSupabase } from "./helpers/fakeSupabase.mjs";

function overrideableGateDb() {
  return {
    projects: [{ id: "project-1", status: "IN_PROGRESS", current_stage_id: "stage-payment", sla_status: "ON_TRACK" }],
    project_stages: [
      {
        id: "stage-payment",
        project_id: "project-1",
        workflow_stage_id: "wf-payment",
        order_index: 5,
        name: "Payment",
        owner_role: "finance",
        status: "IN_PROGRESS",
        workflow_stages: { workflow_version_id: "version-1" },
      },
      {
        id: "stage-ready",
        project_id: "project-1",
        workflow_stage_id: "wf-ready",
        order_index: 6,
        name: "Ready for Install",
        owner_role: "ops",
        status: "PENDING",
        workflow_stages: { sla_hours: 24 },
      },
    ],
    workflow_transitions: [
      { id: "transition-ready", workflow_version_id: "version-1", from_stage_id: "wf-payment", to_stage_id: "wf-ready", type: "FORWARD", is_active: true },
    ],
    project_checklists: [
      { id: "payment-proof", project_stage_id: "stage-payment", code: "PAYMENT_PROOF", label: "Payment proof", status: "PENDING", gate_severity: "OVERRIDEABLE", is_required: true },
    ],
    project_documents: [],
    approval_requests: [],
    project_exceptions: [],
    activity_logs: [],
    notifications: [],
    notification_deliveries: [],
  };
}

test("gate override lifecycle requires approval before transition can pass overrideable blockers", async () => {
  const db = overrideableGateDb();
  const supabase = fakeSupabase(db);

  const blocked = await transitionStageForward(supabase, "project-1", "stage-payment");
  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, 409);
  assert.equal(db.project_stages[0].status, "BLOCKED");
  assert.equal(db.project_exceptions.length, 1);

  const request = await createGateOverrideRequest(
    supabase,
    "project-1",
    "stage-payment",
    "Customer paid by bank transfer, proof pending bank settlement.",
    [{ type: "bank_slip", fileId: "drive-file-1" }],
  );
  assert.equal(request.ok, true);
  assert.equal(db.approval_requests[0].status, "PENDING");
  assert.equal(db.approval_requests[0].scope.applies_to, "OVERRIDEABLE_GATES");

  const stillBlocked = await transitionStageForward(supabase, "project-1", "stage-payment");
  assert.equal(stillBlocked.ok, false);
  assert.equal(stillBlocked.status, 409);

  const decision = await decideApprovalRequest(supabase, request.approvalId, "APPROVED", "Finance manager approved temporary payment override.");
  assert.equal(decision.ok, true);
  assert.equal(db.approval_requests[0].status, "APPROVED");
  assert.ok(db.approval_requests[0].decided_at);

  const passed = await transitionStageForward(supabase, "project-1", "stage-payment");
  assert.equal(passed.ok, true);
  assert.equal(passed.nextStageId, "stage-ready");
  assert.equal(db.project_stages[0].status, "COMPLETED");
  assert.equal(db.project_stages[1].status, "IN_PROGRESS");
  assert.equal(db.projects[0].current_stage_id, "stage-ready");

  assert.deepEqual(
    db.activity_logs.map((log) => log.action),
    [
      "TRANSITION_BLOCKED",
      "APPROVAL_REQUEST_CREATED",
      "TRANSITION_BLOCKED",
      "APPROVAL_REQUEST_DECIDED",
      "STAGE_TRANSITIONED_FORWARD",
    ],
  );
});

test("rejected gate override keeps overrideable blockers from passing", async () => {
  const db = overrideableGateDb();
  const supabase = fakeSupabase(db);

  const request = await createGateOverrideRequest(supabase, "project-1", "stage-payment", "Need an exception.");
  assert.equal(request.ok, true);

  const decision = await decideApprovalRequest(supabase, request.approvalId, "REJECTED", "Payment proof is required.");
  assert.equal(decision.ok, true);

  const result = await transitionStageForward(supabase, "project-1", "stage-payment");
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(result.violations[0].severity, "OVERRIDEABLE");
  assert.equal(db.project_stages[0].status, "BLOCKED");
});
