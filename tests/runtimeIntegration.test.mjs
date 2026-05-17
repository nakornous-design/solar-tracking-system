import test from "node:test";
import assert from "node:assert/strict";

import { generateRuntimeForExistingProject } from "../services/workflow/runtimeGeneration.ts";
import { fakeSupabase } from "./helpers/fakeSupabase.mjs";

test("generateRuntimeForExistingProject backfills stages, gates, documents, and locks versions", async () => {
  const db = {
    projects: [
      {
        id: "project-1",
        customer_code: "C-001",
        customer_name: "ACME Solar",
        project_type: "RES-S",
        payment_type: "CASH",
        workflow_version_id: null,
        applied_standard_id: null,
        current_stage_id: null,
        status: "Survey pending",
      },
    ],
    workflow_versions: [
      {
        id: "version-1",
        status: "PUBLISHED",
        is_active: true,
        workflow_templates: { project_type: "RES-S", payment_type: "CASH" },
      },
    ],
    installation_standards: [{ id: "standard-v8r2", code: "V8R2", status: "PUBLISHED", is_active: true }],
    workflow_stages: [
      { id: "wf-lead", workflow_version_id: "version-1", code: "lead", name: "Lead", order_index: 1, owner_role: "sales", sla_hours: 24, is_start: true, is_active: true },
      { id: "wf-survey", workflow_version_id: "version-1", code: "survey", name: "Survey", order_index: 2, owner_role: "ops", sla_hours: 72, is_start: false, is_active: true },
      { id: "wf-tssr", workflow_version_id: "version-1", code: "tssr", name: "TSSR", order_index: 3, owner_role: "engineer", sla_hours: 48, is_start: false, is_active: true },
    ],
    workflow_checklists: [
      { id: "check-survey", workflow_stage_id: "wf-survey", code: "ROOF_CHECK", label: "Roof checked", is_required: true, gate_severity: "HARD" },
    ],
    workflow_required_documents: [
      { id: "doc-survey", workflow_stage_id: "wf-survey", code: "SURVEY_PHOTO", name: "Survey Photo", is_required: true, requires_verification: true, gate_severity: "HARD", drive_folder_key: "02_Survey_TSSR" },
    ],
    project_stages: [],
    project_checklists: [],
    project_documents: [],
    activity_logs: [],
  };

  const result = await generateRuntimeForExistingProject(fakeSupabase(db), "project-1");

  assert.equal(result.ok, true);
  assert.equal(result.created, true);
  assert.equal(result.stageCount, 3);
  assert.equal(result.workflowVersionId, "version-1");
  assert.equal(result.appliedStandardId, "standard-v8r2");

  const leadStage = db.project_stages.find((stage) => stage.workflow_stage_id === "wf-lead");
  const surveyStage = db.project_stages.find((stage) => stage.workflow_stage_id === "wf-survey");
  const tssrStage = db.project_stages.find((stage) => stage.workflow_stage_id === "wf-tssr");

  assert.equal(leadStage.status, "COMPLETED");
  assert.equal(surveyStage.status, "IN_PROGRESS");
  assert.equal(tssrStage.status, "PENDING");
  assert.equal(db.projects[0].current_stage_id, surveyStage.id);
  assert.equal(db.projects[0].workflow_version_id, "version-1");
  assert.equal(db.projects[0].applied_standard_id, "standard-v8r2");

  assert.equal(db.project_checklists.length, 1);
  assert.equal(db.project_checklists[0].project_stage_id, surveyStage.id);
  assert.equal(db.project_checklists[0].status, "PENDING");

  assert.equal(db.project_documents.length, 1);
  assert.equal(db.project_documents[0].project_stage_id, surveyStage.id);
  assert.equal(db.project_documents[0].status, "REQUIRED");
  assert.deepEqual(db.project_documents[0].metadata, { drive_folder_key: "02_Survey_TSSR" });

  assert.equal(db.activity_logs.length, 1);
  assert.equal(db.activity_logs[0].action, "RUNTIME_WORKFLOW_BACKFILLED");
});

test("generateRuntimeForExistingProject marks inactive finance branch stages as skipped", async () => {
  const db = {
    projects: [
      {
        id: "project-1",
        customer_code: "C-002",
        customer_name: "Cash Customer",
        project_type: "RES-S",
        payment_type: "CASH",
        workflow_version_id: "version-1",
        applied_standard_id: "standard-v8r2",
        current_stage_id: null,
        status: "Lead",
      },
    ],
    installation_standards: [{ id: "standard-v8r2", code: "V8R2", status: "PUBLISHED", is_active: true }],
    workflow_stages: [
      { id: "wf-lead", workflow_version_id: "version-1", code: "LEAD", name: "Lead", order_index: 1, owner_role: "sales", sla_hours: 24, is_start: true, is_active: true },
      { id: "wf-payment", workflow_version_id: "version-1", code: "PAYMENT", name: "Cash Payment", order_index: 5, owner_role: "finance", sla_hours: 72, is_start: false, is_active: true },
      { id: "wf-loan-docs", workflow_version_id: "version-1", code: "LOAN_DOCUMENT_COLLECTION", name: "Loan Document Collection", order_index: 6, owner_role: "sales", sla_hours: 72, is_start: false, is_active: true },
      { id: "wf-loan-approval", workflow_version_id: "version-1", code: "LOAN_APPROVAL", name: "Loan Approval", order_index: 9, owner_role: "finance", sla_hours: 48, is_start: false, is_active: true },
    ],
    workflow_checklists: [],
    workflow_required_documents: [],
    project_stages: [],
    project_checklists: [],
    project_documents: [],
    activity_logs: [],
  };

  const result = await generateRuntimeForExistingProject(fakeSupabase(db), "project-1");

  assert.equal(result.ok, true);
  assert.equal(db.project_stages.find((stage) => stage.code === "PAYMENT").status, "PENDING");
  assert.deepEqual(
    db.project_stages.filter((stage) => stage.code.startsWith("LOAN_")).map((stage) => stage.status),
    ["SKIPPED", "SKIPPED"],
  );
});
