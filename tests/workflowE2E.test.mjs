import test from "node:test";
import assert from "node:assert/strict";

import { CreateProjectEngine } from "../services/workflow/createProjectEngine.ts";
import { createGateOverrideRequest, decideApprovalRequest } from "../services/workflow/approvalEngine.ts";
import { transitionStageForward } from "../services/workflow/transitionEngine.ts";
import { fakeSupabase } from "./helpers/fakeSupabase.mjs";

function cashWorkflowDb() {
  return {
    projects: [],
    workflow_versions: [
      {
        id: "version-cash-v1",
        workflow_template_id: "template-cash",
        status: "PUBLISHED",
        is_active: true,
        workflow_templates: { project_type: "RES-S", payment_type: "CASH" },
      },
    ],
    installation_standards: [{ id: "standard-v8r2", code: "V8R2", status: "PUBLISHED", is_active: true }],
    workflow_stages: [
      { id: "wf-lead", workflow_version_id: "version-cash-v1", code: "LEAD", name: "Lead", order_index: 1, owner_role: "sales", sla_hours: 24, is_start: true, is_active: true },
      { id: "wf-survey", workflow_version_id: "version-cash-v1", code: "SURVEY", name: "Survey", order_index: 2, owner_role: "ops", sla_hours: 72, is_start: false, is_active: true },
      { id: "wf-tssr", workflow_version_id: "version-cash-v1", code: "TSSR", name: "TSSR", order_index: 3, owner_role: "engineer", sla_hours: 48, is_start: false, is_active: true },
    ],
    workflow_transitions: [
      { id: "transition-lead-survey", workflow_version_id: "version-cash-v1", from_stage_id: "wf-lead", to_stage_id: "wf-survey", type: "FORWARD", is_active: true },
      { id: "transition-survey-tssr", workflow_version_id: "version-cash-v1", from_stage_id: "wf-survey", to_stage_id: "wf-tssr", type: "FORWARD", is_active: true },
    ],
    workflow_checklists: [
      { id: "wf-check-lead", workflow_stage_id: "wf-lead", code: "CUSTOMER_CONFIRMED", label: "Customer confirmed", is_required: true, gate_severity: "HARD" },
    ],
    workflow_required_documents: [
      { id: "wf-doc-survey", workflow_stage_id: "wf-survey", code: "SURVEY_PHOTOS", name: "Survey photos", is_required: true, requires_verification: true, gate_severity: "OVERRIDEABLE", drive_folder_key: "02_Survey_TSSR" },
    ],
    project_stages: [],
    project_checklists: [],
    project_documents: [],
    project_exceptions: [],
    approval_requests: [],
    activity_logs: [],
    notifications: [],
    notification_deliveries: [],
  };
}

function loanWorkflowDb() {
  return {
    projects: [],
    workflow_versions: [
      {
        id: "version-cash-v1",
        workflow_template_id: "template-cash",
        status: "PUBLISHED",
        is_active: true,
        workflow_templates: { project_type: "RES-S", payment_type: "CASH" },
      },
      {
        id: "version-loan-v1",
        workflow_template_id: "template-loan",
        status: "PUBLISHED",
        is_active: true,
        workflow_templates: { project_type: "RES-S", payment_type: "LOAN" },
      },
    ],
    installation_standards: [{ id: "standard-v9", code: "V9", status: "PUBLISHED", is_active: true }],
    workflow_stages: [
      { id: "wf-loan-lead", workflow_version_id: "version-loan-v1", code: "LEAD", name: "Lead", order_index: 1, owner_role: "sales", sla_hours: 24, is_start: true, is_active: true },
      { id: "wf-loan-docs", workflow_version_id: "version-loan-v1", code: "LOAN_DOCUMENT_COLLECTION", name: "Loan Document Collection", order_index: 5, owner_role: "sales", sla_hours: 72, is_start: false, is_active: true },
      { id: "wf-loan-submit", workflow_version_id: "version-loan-v1", code: "LOAN_SUBMISSION", name: "Loan Submission", order_index: 6, owner_role: "finance", sla_hours: 48, is_start: false, is_active: true },
    ],
    workflow_checklists: [
      { id: "wf-loan-check-lead", workflow_stage_id: "wf-loan-lead", code: "CUSTOMER_REGISTERED", label: "Customer registered", is_required: true, gate_severity: "HARD" },
      { id: "wf-loan-check-docs", workflow_stage_id: "wf-loan-docs", code: "LOAN_DOCUMENTS_COMPLETE", label: "Loan documents complete", is_required: true, gate_severity: "HARD" },
    ],
    workflow_required_documents: [
      { id: "wf-loan-doc", workflow_stage_id: "wf-loan-docs", code: "LOAN_DOCUMENTS", name: "Loan Documents", is_required: true, requires_verification: true, gate_severity: "HARD", drive_folder_key: "03_Loan_Documents" },
      { id: "wf-loan-submit-doc", workflow_stage_id: "wf-loan-submit", code: "LOAN_SUBMISSION_PROOF", name: "Loan Submission Proof", is_required: true, requires_verification: true, gate_severity: "HARD", drive_folder_key: "03_Loan_Documents" },
    ],
    project_stages: [],
    project_checklists: [],
    project_documents: [],
    project_exceptions: [],
    approval_requests: [],
    activity_logs: [],
    notifications: [],
    notification_deliveries: [],
  };
}

function hydrateStageRelations(db) {
  db.project_stages.forEach((stage) => {
    const workflowStage = db.workflow_stages.find((item) => item.id === stage.workflow_stage_id);
    stage.workflow_stages = workflowStage
      ? { workflow_version_id: workflowStage.workflow_version_id, sla_hours: workflowStage.sla_hours }
      : null;
  });
}

function projectStageByCode(db, code) {
  return db.project_stages.find((stage) => stage.code === code);
}

test("RES-S CASH backend flow creates runtime, blocks gates, approves override, and transitions forward", async () => {
  const db = cashWorkflowDb();
  const supabase = fakeSupabase(db);
  const folderCalls = [];
  const engine = new CreateProjectEngine(supabase, async (_client, customerCode, projectId) => {
    folderCalls.push({ customerCode, projectId });
  });

  const project = await engine.execute({
    customerCode: "E2E-CASH-001",
    customerName: "E2E Customer",
    customerPhone: "0800000001",
    projectType: "RES-S",
    paymentType: "CASH",
  });
  hydrateStageRelations(db);

  const leadStage = projectStageByCode(db, "LEAD");
  const surveyStage = projectStageByCode(db, "SURVEY");
  const tssrStage = projectStageByCode(db, "TSSR");

  assert.equal(project.workflow_version_id, "version-cash-v1");
  assert.equal(project.applied_standard_id, "standard-v8r2");
  assert.equal(db.projects[0].current_stage_id, leadStage.id);
  assert.equal(leadStage.status, "IN_PROGRESS");
  assert.equal(surveyStage.status, "PENDING");
  assert.deepEqual(folderCalls, [{ customerCode: "E2E-CASH-001", projectId: project.id }]);

  const hardBlocked = await transitionStageForward(supabase, project.id, leadStage.id);
  assert.equal(hardBlocked.ok, false);
  assert.equal(hardBlocked.status, 409);
  assert.equal(hardBlocked.violations[0].severity, "HARD");
  assert.equal(db.project_exceptions[0].title, "Hard gate blocked: Lead");

  db.project_checklists.find((item) => item.project_stage_id === leadStage.id).status = "PASSED";

  const leadPassed = await transitionStageForward(supabase, project.id, leadStage.id);
  assert.equal(leadPassed.ok, true);
  assert.equal(leadPassed.nextStageId, surveyStage.id);
  assert.equal(leadStage.status, "COMPLETED");
  assert.equal(surveyStage.status, "IN_PROGRESS");
  assert.equal(db.projects[0].current_stage_id, surveyStage.id);

  const overrideBlocked = await transitionStageForward(supabase, project.id, surveyStage.id);
  assert.equal(overrideBlocked.ok, false);
  assert.equal(overrideBlocked.status, 409);
  assert.equal(overrideBlocked.violations[0].severity, "OVERRIDEABLE");

  const override = await createGateOverrideRequest(
    supabase,
    project.id,
    surveyStage.id,
    "Survey photos are on Drive but verification will be completed after engineering review.",
    [{ type: "drive_folder", folderKey: "02_Survey_TSSR" }],
  );
  assert.equal(override.ok, true);
  assert.equal(db.approval_requests[0].scope.applies_to, "OVERRIDEABLE_GATES");

  const approved = await decideApprovalRequest(supabase, override.approvalId, "APPROVED", "Ops lead accepted temporary survey photo override.");
  assert.equal(approved.ok, true);
  assert.equal(db.approval_requests[0].status, "APPROVED");

  const surveyPassed = await transitionStageForward(supabase, project.id, surveyStage.id);
  assert.equal(surveyPassed.ok, true);
  assert.equal(surveyPassed.nextStageId, tssrStage.id);
  assert.equal(surveyStage.status, "COMPLETED");
  assert.equal(tssrStage.status, "IN_PROGRESS");
  assert.equal(db.projects[0].current_stage_id, tssrStage.id);

  assert.deepEqual(
    db.activity_logs.map((log) => log.action),
    [
      "PROJECT_CREATED",
      "TRANSITION_BLOCKED",
      "STAGE_TRANSITIONED_FORWARD",
      "TRANSITION_BLOCKED",
      "APPROVAL_REQUEST_CREATED",
      "APPROVAL_REQUEST_DECIDED",
      "STAGE_TRANSITIONED_FORWARD",
    ],
  );
  assert.ok(db.notifications.some((item) => item.title === "New project started: E2E-CASH-001"));
  assert.ok(db.notifications.some((item) => item.title === "Approval required: Gate override"));
  assert.ok(db.notifications.some((item) => item.title === "Stage ready: TSSR"));
});

test("RES-S LOAN backend flow locks loan workflow and generates loan runtime gates", async () => {
  const db = loanWorkflowDb();
  const supabase = fakeSupabase(db);
  const engine = new CreateProjectEngine(supabase, async () => {});

  const project = await engine.execute({
    customerCode: "E2E-LOAN-001",
    customerName: "Loan Customer",
    projectType: "RES-S",
    paymentType: "LOAN",
    standardId: "V9",
  });

  assert.equal(project.workflow_version_id, "version-loan-v1");
  assert.equal(project.applied_standard_id, "standard-v9");
  assert.equal(db.projects[0].payment_type, "LOAN");
  assert.equal(db.project_stages.length, 3);
  assert.equal(db.project_stages[0].code, "LEAD");
  assert.equal(db.project_stages[0].status, "IN_PROGRESS");
  assert.ok(db.project_stages.some((stage) => stage.code === "LOAN_DOCUMENT_COLLECTION"));
  assert.ok(db.project_stages.some((stage) => stage.code === "LOAN_SUBMISSION"));
  assert.equal(db.project_checklists.length, 2);
  assert.equal(db.project_documents.length, 2);
  assert.deepEqual(
    db.project_documents.map((document) => document.metadata.drive_folder_key),
    ["03_Loan_Documents", "03_Loan_Documents"],
  );
  assert.equal(db.activity_logs[0].after_state.workflow_version_id, "version-loan-v1");
  assert.equal(db.notifications[0].recipient_role, "sales");
});
