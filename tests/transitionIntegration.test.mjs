import test from "node:test";
import assert from "node:assert/strict";

import { transitionStageForward, transitionStageRework } from "../services/workflow/transitionEngine.ts";
import { fakeSupabase } from "./helpers/fakeSupabase.mjs";

test("transitionStageForward completes active stage, starts next stage, logs and notifies owner", async () => {
  const db = {
    projects: [{ id: "project-1", status: "IN_PROGRESS", current_stage_id: "stage-lead", sla_status: "ON_TRACK" }],
    project_stages: [
      {
        id: "stage-lead",
        project_id: "project-1",
        workflow_stage_id: "wf-lead",
        order_index: 1,
        name: "Lead",
        owner_role: "sales",
        status: "IN_PROGRESS",
        workflow_stages: { workflow_version_id: "version-1" },
      },
      {
        id: "stage-survey",
        project_id: "project-1",
        workflow_stage_id: "wf-survey",
        order_index: 2,
        name: "Survey",
        owner_role: "ops",
        status: "PENDING",
        workflow_stages: { sla_hours: 72 },
      },
    ],
    workflow_transitions: [
      { id: "transition-1", workflow_version_id: "version-1", from_stage_id: "wf-lead", to_stage_id: "wf-survey", type: "FORWARD", is_active: true },
    ],
    project_checklists: [
      { id: "check-1", project_stage_id: "stage-lead", code: "CUSTOMER_OK", label: "Customer OK", status: "PASSED", gate_severity: "HARD", is_required: true },
    ],
    project_documents: [
      { id: "doc-1", project_stage_id: "stage-lead", code: "CONTRACT", name: "Contract", status: "VERIFIED", gate_severity: "HARD", is_required: true, requires_verification: true },
    ],
    approval_requests: [],
    project_exceptions: [],
    activity_logs: [],
    notifications: [],
    notification_deliveries: [],
  };

  const result = await transitionStageForward(fakeSupabase(db), "project-1", "stage-lead");

  assert.equal(result.ok, true);
  assert.equal(result.completedStageId, "stage-lead");
  assert.equal(result.nextStageId, "stage-survey");
  assert.equal(db.project_stages[0].status, "COMPLETED");
  assert.equal(db.project_stages[1].status, "IN_PROGRESS");
  assert.equal(db.project_stages[1].sla_status, "ON_TRACK");
  assert.ok(db.project_stages[1].started_at);
  assert.ok(db.project_stages[1].due_at);
  assert.equal(db.projects[0].current_stage_id, "stage-survey");
  assert.equal(db.activity_logs[0].action, "STAGE_TRANSITIONED_FORWARD");
  assert.equal(db.notifications[0].recipient_role, "ops");
  assert.equal(db.notification_deliveries[0].notification_id, db.notifications[0].id);
});

test("transitionStageForward blocks incomplete hard gates and creates workflow exception", async () => {
  const db = {
    projects: [{ id: "project-1", status: "IN_PROGRESS", current_stage_id: "stage-survey", sla_status: "ON_TRACK" }],
    project_stages: [
      {
        id: "stage-survey",
        project_id: "project-1",
        workflow_stage_id: "wf-survey",
        order_index: 2,
        name: "Survey",
        owner_role: "ops",
        status: "IN_PROGRESS",
        workflow_stages: { workflow_version_id: "version-1" },
      },
      {
        id: "stage-tssr",
        project_id: "project-1",
        workflow_stage_id: "wf-tssr",
        order_index: 3,
        name: "TSSR",
        owner_role: "engineer",
        status: "PENDING",
        workflow_stages: { sla_hours: 48 },
      },
    ],
    workflow_transitions: [
      { id: "transition-2", workflow_version_id: "version-1", from_stage_id: "wf-survey", to_stage_id: "wf-tssr", type: "FORWARD", is_active: true },
    ],
    project_checklists: [
      { id: "check-missing", project_stage_id: "stage-survey", code: "SURVEY_DONE", label: "Survey done", status: "PENDING", gate_severity: "HARD", is_required: true },
    ],
    project_documents: [],
    approval_requests: [],
    project_exceptions: [],
    activity_logs: [],
    notifications: [],
    notification_deliveries: [],
  };

  const result = await transitionStageForward(fakeSupabase(db), "project-1", "stage-survey");

  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(result.violations.length, 1);
  assert.equal(db.project_stages[0].status, "BLOCKED");
  assert.equal(db.project_stages[1].status, "PENDING");
  assert.equal(db.project_exceptions[0].category, "WORKFLOW");
  assert.equal(db.project_exceptions[0].status, "OPEN");
  assert.equal(db.activity_logs[0].action, "TRANSITION_BLOCKED");
  assert.equal(db.notifications[0].severity, "HIGH");
});

test("transitionStageForward closes terminal Closure stage without a forward transition", async () => {
  const db = {
    projects: [{ id: "project-1", status: "IN_PROGRESS", current_stage_id: "stage-closure", sla_status: "ON_TRACK" }],
    project_stages: [
      {
        id: "stage-closure",
        project_id: "project-1",
        workflow_stage_id: "wf-closure",
        order_index: 12,
        code: "CLOSURE",
        name: "Closure",
        owner_role: "ops",
        status: "IN_PROGRESS",
        workflow_stages: { workflow_version_id: "version-1" },
      },
    ],
    workflow_transitions: [],
    project_checklists: [
      { id: "check-close", project_stage_id: "stage-closure", code: "CLOSE_OK", label: "Close OK", status: "PASSED", gate_severity: "HARD", is_required: true },
    ],
    project_documents: [],
    approval_requests: [],
    activity_logs: [],
    project_exceptions: [],
    notifications: [],
    notification_deliveries: [],
  };

  const result = await transitionStageForward(fakeSupabase(db), "project-1", "stage-closure");

  assert.equal(result.ok, true);
  assert.equal(result.projectStatus, "COMPLETED");
  assert.equal(result.completedStageId, "stage-closure");
  assert.equal(result.nextStageId, null);
  assert.equal(db.project_stages[0].status, "COMPLETED");
  assert.equal(db.projects[0].status, "COMPLETED");
  assert.equal(db.projects[0].current_stage_id, null);
  assert.equal(db.activity_logs[0].action, "PROJECT_CLOSED");
});

test("transitionStageRework moves ownership back to configured rework target with reason metadata", async () => {
  const db = {
    projects: [{ id: "project-1", status: "IN_PROGRESS", current_stage_id: "stage-qa", sla_status: "ON_TRACK" }],
    project_stages: [
      {
        id: "stage-install",
        project_id: "project-1",
        workflow_stage_id: "wf-install",
        order_index: 8,
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
        name: "QA",
        owner_role: "qa",
        status: "IN_PROGRESS",
        metadata: {},
        workflow_stages: { workflow_version_id: "version-1" },
      },
    ],
    workflow_transitions: [
      { id: "transition-rework", workflow_version_id: "version-1", from_stage_id: "wf-qa", to_stage_id: "wf-install", type: "REWORK", is_active: true },
    ],
    activity_logs: [],
    notifications: [],
    notification_deliveries: [],
  };

  const result = await transitionStageRework(fakeSupabase(db), "project-1", "stage-qa", "Fix grounding photo");

  assert.equal(result.ok, true);
  assert.equal(result.nextStageId, "stage-install");
  assert.equal(db.project_stages[1].status, "BLOCKED");
  assert.equal(db.project_stages[1].metadata.rework_reason, "Fix grounding photo");
  assert.equal(db.project_stages[0].status, "IN_PROGRESS");
  assert.equal(db.projects[0].current_stage_id, "stage-install");
  assert.equal(db.activity_logs[0].action, "STAGE_TRANSITIONED_REWORK");
  assert.equal(db.notifications[0].severity, "WARNING");
});
