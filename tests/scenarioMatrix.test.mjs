import test from "node:test";
import assert from "node:assert/strict";

import { CreateProjectEngine } from "../services/workflow/createProjectEngine.ts";
import { createGateOverrideRequest, decideApprovalRequest } from "../services/workflow/approvalEngine.ts";
import { submitBillingDecision } from "../services/workflow/billingEngine.ts";
import { submitLoanFallbackDecision } from "../services/workflow/loanFallbackEngine.ts";
import { submitQaOutcome } from "../services/workflow/qaEngine.ts";
import { scheduleProjectStage } from "../services/workflow/resourceSchedulingEngine.ts";
import { transitionStageForward } from "../services/workflow/transitionEngine.ts";
import { fakeSupabase } from "./helpers/fakeSupabase.mjs";

const STAGES = [
  ["LEAD", "Lead", "sales", 24],
  ["SURVEY", "Survey", "ops", 72],
  ["TSSR", "TSSR", "engineer", 48],
  ["QUOTATION", "Quotation", "sales", 24],
  ["PAYMENT", "Payment", "finance", 24],
  ["LOAN_DOCUMENT_COLLECTION", "Loan Documents", "sales", 72],
  ["LOAN_SUBMISSION", "Loan Submission", "finance", 48],
  ["LOAN_REVIEW", "Loan Review", "finance", 72],
  ["LOAN_APPROVAL", "Loan Approval", "finance", 72],
  ["DOWN_PAYMENT", "Down Payment", "finance", 24],
  ["READY_FOR_INSTALL", "Ready for Install", "ops", 24],
  ["SCHEDULING", "Scheduling", "ops", 24],
  ["INSTALLATION", "Installation", "contractor", 72],
  ["QA", "QA", "qa", 48],
  ["HANDOVER", "Handover", "ops", 48],
  ["MAT_CUT", "ตัด MAT", "finance", 24],
  ["BILLING", "Billing", "finance", 48],
  ["CLOSURE", "Closure", "ops", 24],
];

const FORWARD_TRANSITIONS = [
  ["LEAD", "SURVEY"],
  ["SURVEY", "TSSR"],
  ["TSSR", "QUOTATION"],
  ["QUOTATION", "PAYMENT", { when_payment_type: "CASH" }],
  ["QUOTATION", "LOAN_DOCUMENT_COLLECTION", { when_payment_type: "LOAN" }],
  ["PAYMENT", "READY_FOR_INSTALL"],
  ["LOAN_DOCUMENT_COLLECTION", "LOAN_SUBMISSION"],
  ["LOAN_SUBMISSION", "LOAN_REVIEW"],
  ["LOAN_REVIEW", "LOAN_APPROVAL"],
  ["LOAN_APPROVAL", "DOWN_PAYMENT"],
  ["DOWN_PAYMENT", "READY_FOR_INSTALL"],
  ["READY_FOR_INSTALL", "SCHEDULING"],
  ["SCHEDULING", "INSTALLATION"],
  ["INSTALLATION", "QA"],
  ["QA", "HANDOVER"],
  ["HANDOVER", "MAT_CUT"],
  ["MAT_CUT", "BILLING"],
  ["BILLING", "CLOSURE"],
];

function fullWorkflowDb() {
  const workflowStages = STAGES.map(([code, name, ownerRole, slaHours], index) => ({
    id: `wf-${code}`,
    workflow_version_id: "version-full",
    code,
    name,
    order_index: index + 1,
    owner_role: ownerRole,
    sla_hours: slaHours,
    is_start: index === 0,
    is_active: true,
  }));

  return {
    projects: [],
    workflow_versions: [
      {
        id: "version-full",
        workflow_template_id: "template-standard",
        status: "PUBLISHED",
        is_active: true,
        workflow_templates: { code: "RES-S-STANDARD", project_type: "RES-S", payment_type: "CASH" },
      },
    ],
    installation_standards: [
      { id: "standard-v8r2", code: "V8R2", status: "PUBLISHED", is_active: true },
      { id: "standard-v9", code: "V9", status: "PUBLISHED", is_active: true },
    ],
    workflow_stages: workflowStages,
    workflow_transitions: [
      ...FORWARD_TRANSITIONS.map(([fromCode, toCode, ruleConfig]) => ({
        id: `transition-${fromCode}-${toCode}`,
        workflow_version_id: "version-full",
        from_stage_id: `wf-${fromCode}`,
        to_stage_id: `wf-${toCode}`,
        type: "FORWARD",
        is_active: true,
        rule_config: ruleConfig || null,
      })),
      { id: "transition-qa-rework", workflow_version_id: "version-full", from_stage_id: "wf-QA", to_stage_id: "wf-INSTALLATION", type: "REWORK", is_active: true },
      { id: "transition-billing-rework", workflow_version_id: "version-full", from_stage_id: "wf-BILLING", to_stage_id: "wf-HANDOVER", type: "REWORK", is_active: true },
    ],
    workflow_checklists: workflowStages.map((stage) => ({
      id: `wf-check-${stage.code}`,
      workflow_stage_id: stage.id,
      code: `${stage.code}_DONE`,
      label: `${stage.name} complete`,
      is_required: true,
      gate_severity: "HARD",
    })),
    workflow_required_documents: [
      ["SURVEY", "SURVEY_PHOTOS", "Survey photos", "02_Survey_TSSR", "HARD"],
      ["PAYMENT", "PAYMENT_PROOF", "Payment proof", "01_Sales_Commercial", "HARD"],
      ["LOAN_DOCUMENT_COLLECTION", "LOAN_DOCUMENTS", "Loan documents", "03_Loan_Documents", "HARD"],
      ["LOAN_SUBMISSION", "LOAN_SUBMISSION_PROOF", "Loan submission proof", "03_Loan_Documents", "HARD"],
      ["INSTALLATION", "INSTALLATION_PHOTOS", "Installation photos", "04_Installation_Photos", "HARD"],
      ["HANDOVER", "HANDOVER_SIGNED", "Handover signed", "05_Site_Folder_Handover", "HARD"],
      ["BILLING", "PAC", "PAC", "06_Billing_Finance", "HARD"],
    ].map(([stageCode, code, name, folderKey, severity]) => ({
      id: `wf-doc-${code}`,
      workflow_stage_id: `wf-${stageCode}`,
      code,
      name,
      is_required: true,
      requires_verification: true,
      gate_severity: severity,
      drive_folder_key: folderKey,
    })),
    resource_teams: [
      { id: "team-install-1", name: "BTK2", territory: "NOE", daily_capacity: 1, skills: ["installation"], is_active: true },
    ],
    resource_assignments: [],
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

function stageByCode(db, code) {
  return db.project_stages.find((stage) => stage.code === code);
}

function passStageGates(db, stageCode) {
  const stage = stageByCode(db, stageCode);
  assert.ok(stage, `missing stage ${stageCode}`);
  db.project_checklists
    .filter((item) => item.project_stage_id === stage.id)
    .forEach((item) => {
      item.status = "PASSED";
      item.completed_at = new Date().toISOString();
    });
  db.project_documents
    .filter((item) => item.project_stage_id === stage.id)
    .forEach((item) => {
      item.status = "VERIFIED";
      item.google_drive_file_id = `drive-${item.code}`;
      item.web_view_link = `https://drive.test/${item.code}`;
      item.verified_at = new Date().toISOString();
    });
}

async function completeForward(db, supabase, projectId, stageCode) {
  hydrateStageRelations(db);
  passStageGates(db, stageCode);
  const stage = stageByCode(db, stageCode);
  const result = await transitionStageForward(supabase, projectId, stage.id, "scenario-user", null);
  assert.equal(result.ok, true, `${stageCode} should move forward`);
  return result;
}

async function createScenarioProject(db, input) {
  const supabase = fakeSupabase(db);
  const engine = new CreateProjectEngine(supabase, async () => {});
  const project = await engine.execute(input);
  hydrateStageRelations(db);
  return { supabase, project };
}

test("scenario matrix: RES-S CASH can pass every active production stage through Closure", async () => {
  const db = fullWorkflowDb();
  const { supabase, project } = await createScenarioProject(db, {
    customerCode: "SCENARIO-CASH-001",
    customerName: "Scenario Cash Customer",
    customerPhone: "0800000001",
    projectType: "RES-S",
    paymentType: "CASH",
  });

  assert.deepEqual(
    db.project_stages.filter((stage) => stage.status !== "SKIPPED").map((stage) => stage.code),
    ["LEAD", "SURVEY", "TSSR", "QUOTATION", "PAYMENT", "READY_FOR_INSTALL", "SCHEDULING", "INSTALLATION", "QA", "HANDOVER", "MAT_CUT", "BILLING", "CLOSURE"],
  );

  await completeForward(db, supabase, project.id, "LEAD");
  await completeForward(db, supabase, project.id, "SURVEY");
  await completeForward(db, supabase, project.id, "TSSR");
  await completeForward(db, supabase, project.id, "QUOTATION");
  await completeForward(db, supabase, project.id, "PAYMENT");
  await completeForward(db, supabase, project.id, "READY_FOR_INSTALL");

  const schedulingStage = stageByCode(db, "SCHEDULING");
  const scheduled = await scheduleProjectStage(supabase, {
    projectId: project.id,
    projectStageId: schedulingStage.id,
    scheduledStart: "2026-05-20T00:00:00.000Z",
    scheduledEnd: "2026-05-22T23:59:59.000Z",
    resourceTeamId: "team-install-1",
    requiredSkill: "installation",
    territory: "NOE",
    notes: "Scenario schedule test.",
  });
  assert.equal(scheduled.ok, true);
  assert.equal(stageByCode(db, "SCHEDULING").metadata.schedule_conflict_status, "NONE");

  await completeForward(db, supabase, project.id, "SCHEDULING");
  await completeForward(db, supabase, project.id, "INSTALLATION");

  passStageGates(db, "QA");
  const qaPass = await submitQaOutcome(supabase, project.id, stageByCode(db, "QA").id, "PASS", undefined, [], "scenario-user");
  assert.equal(qaPass.ok, true);
  assert.equal(stageByCode(db, "HANDOVER").status, "IN_PROGRESS");

  await completeForward(db, supabase, project.id, "HANDOVER");
  await completeForward(db, supabase, project.id, "MAT_CUT");

  passStageGates(db, "BILLING");
  const billingApprove = await submitBillingDecision(supabase, project.id, stageByCode(db, "BILLING").id, "APPROVE", undefined, [], "scenario-user");
  assert.equal(billingApprove.ok, true);
  assert.equal(stageByCode(db, "CLOSURE").status, "IN_PROGRESS");

  await completeForward(db, supabase, project.id, "CLOSURE");
  assert.equal(db.projects[0].status, "COMPLETED");
  assert.equal(db.projects[0].current_stage_id, null);
  assert.ok(db.activity_logs.some((log) => log.action === "PROJECT_CLOSED"));
});

test("scenario matrix: hard gate blocks, override approval, QA rework, billing reject, and schedule conflict are covered", async () => {
  const db = fullWorkflowDb();
  db.workflow_required_documents.find((doc) => doc.code === "SURVEY_PHOTOS").gate_severity = "OVERRIDEABLE";
  db.resource_assignments.push({
    id: "assignment-existing",
    resource_team_id: "team-install-1",
    project_stage_id: "other-stage",
    scheduled_start: "2026-05-20T00:00:00.000Z",
    scheduled_end: "2026-05-21T23:59:59.000Z",
    status: "CONFIRMED",
  });

  const { supabase, project } = await createScenarioProject(db, {
    customerCode: "SCENARIO-EXCEPTION-001",
    customerName: "Scenario Exception Customer",
    projectType: "RES-S",
    paymentType: "CASH",
  });

  const leadBlocked = await transitionStageForward(supabase, project.id, stageByCode(db, "LEAD").id);
  assert.equal(leadBlocked.ok, false);
  assert.equal(leadBlocked.status, 409);
  assert.equal(stageByCode(db, "LEAD").status, "BLOCKED");
  assert.equal(db.project_exceptions.at(-1).category, "WORKFLOW");

  await completeForward(db, supabase, project.id, "LEAD");
  db.project_checklists
    .filter((item) => item.project_stage_id === stageByCode(db, "SURVEY").id)
    .forEach((item) => {
      item.status = "PASSED";
    });
  const surveyBlocked = await transitionStageForward(supabase, project.id, stageByCode(db, "SURVEY").id);
  assert.equal(surveyBlocked.ok, false);
  assert.equal(surveyBlocked.violations[0].severity, "OVERRIDEABLE");

  const override = await createGateOverrideRequest(supabase, project.id, stageByCode(db, "SURVEY").id, "Temporary survey evidence accepted.", []);
  assert.equal(override.ok, true);
  const approval = await decideApprovalRequest(supabase, override.approvalId, "APPROVED", "Supervisor approved scenario override.");
  assert.equal(approval.ok, true);

  await completeForward(db, supabase, project.id, "SURVEY");
  await completeForward(db, supabase, project.id, "TSSR");
  await completeForward(db, supabase, project.id, "QUOTATION");
  await completeForward(db, supabase, project.id, "PAYMENT");
  await completeForward(db, supabase, project.id, "READY_FOR_INSTALL");

  const scheduled = await scheduleProjectStage(supabase, {
    projectId: project.id,
    projectStageId: stageByCode(db, "SCHEDULING").id,
    scheduledStart: "2026-05-20T00:00:00.000Z",
    scheduledEnd: "2026-05-21T23:59:59.000Z",
    resourceTeamId: "team-install-1",
    requiredSkill: "installation",
    territory: "NOE",
    notes: "Scenario conflict schedule.",
  });
  assert.equal(scheduled.ok, true);
  assert.equal(scheduled.conflictStatus, "TIME_CONFLICT");
  assert.ok(db.project_exceptions.some((item) => item.category === "RESOURCE"));

  await completeForward(db, supabase, project.id, "SCHEDULING");
  await completeForward(db, supabase, project.id, "INSTALLATION");

  const qaRework = await submitQaOutcome(supabase, project.id, stageByCode(db, "QA").id, "REWORK", "Grounding photo missing.", [], "scenario-user");
  assert.equal(qaRework.ok, true);
  assert.equal(stageByCode(db, "INSTALLATION").status, "IN_PROGRESS");
  assert.equal(stageByCode(db, "QA").status, "BLOCKED");

  await completeForward(db, supabase, project.id, "INSTALLATION");
  passStageGates(db, "QA");
  const qaPass = await submitQaOutcome(supabase, project.id, stageByCode(db, "QA").id, "PASS", undefined, [], "scenario-user");
  assert.equal(qaPass.ok, true);

  await completeForward(db, supabase, project.id, "HANDOVER");
  await completeForward(db, supabase, project.id, "MAT_CUT");

  const billingReject = await submitBillingDecision(supabase, project.id, stageByCode(db, "BILLING").id, "REJECT", "PAC missing.", [], "scenario-user");
  assert.equal(billingReject.ok, true);
  assert.equal(stageByCode(db, "HANDOVER").status, "IN_PROGRESS");
  assert.equal(stageByCode(db, "BILLING").status, "BLOCKED");

  await completeForward(db, supabase, project.id, "HANDOVER");
  await completeForward(db, supabase, project.id, "MAT_CUT");
  passStageGates(db, "BILLING");
  const billingApprove = await submitBillingDecision(supabase, project.id, stageByCode(db, "BILLING").id, "APPROVE", undefined, [], "scenario-user");
  assert.equal(billingApprove.ok, true);
});

test("scenario matrix: RES-S LOAN covers loan branch, cash fallback accepted, and cash fallback declined", async () => {
  const acceptedDb = fullWorkflowDb();
  const accepted = await createScenarioProject(acceptedDb, {
    customerCode: "SCENARIO-LOAN-ACCEPT-001",
    customerName: "Loan Accept Customer",
    projectType: "RES-S",
    paymentType: "LOAN",
    standardId: "V9",
  });

  assert.equal(acceptedDb.projects[0].payment_type, "LOAN");
  assert.equal(stageByCode(acceptedDb, "PAYMENT").status, "SKIPPED");
  assert.equal(stageByCode(acceptedDb, "LOAN_DOCUMENT_COLLECTION").status, "PENDING");

  await completeForward(acceptedDb, accepted.supabase, accepted.project.id, "LEAD");
  await completeForward(acceptedDb, accepted.supabase, accepted.project.id, "SURVEY");
  await completeForward(acceptedDb, accepted.supabase, accepted.project.id, "TSSR");
  await completeForward(acceptedDb, accepted.supabase, accepted.project.id, "QUOTATION");
  await completeForward(acceptedDb, accepted.supabase, accepted.project.id, "LOAN_DOCUMENT_COLLECTION");
  await completeForward(acceptedDb, accepted.supabase, accepted.project.id, "LOAN_SUBMISSION");

  const loanReview = stageByCode(acceptedDb, "LOAN_REVIEW");
  const offered = await submitLoanFallbackDecision(
    accepted.supabase,
    accepted.project.id,
    loanReview.id,
    "REJECT_AND_OFFER_CASH",
    "Bank rejected scenario loan.",
  );
  assert.equal(offered.ok, true);
  assert.equal(stageByCode(acceptedDb, "LOAN_REVIEW").status, "WAITING");

  const acceptedCash = await submitLoanFallbackDecision(
    accepted.supabase,
    accepted.project.id,
    loanReview.id,
    "ACCEPT_CASH_OFFER",
    "Customer accepted cash fallback.",
  );
  assert.equal(acceptedCash.ok, true);
  assert.equal(acceptedDb.projects[0].payment_type, "CASH");
  assert.equal(stageByCode(acceptedDb, "PAYMENT").status, "IN_PROGRESS");
  assert.equal(stageByCode(acceptedDb, "LOAN_APPROVAL").status, "SKIPPED");

  const declinedDb = fullWorkflowDb();
  const declined = await createScenarioProject(declinedDb, {
    customerCode: "SCENARIO-LOAN-DECLINE-001",
    customerName: "Loan Decline Customer",
    projectType: "RES-S",
    paymentType: "LOAN",
  });
  await completeForward(declinedDb, declined.supabase, declined.project.id, "LEAD");
  await completeForward(declinedDb, declined.supabase, declined.project.id, "SURVEY");
  await completeForward(declinedDb, declined.supabase, declined.project.id, "TSSR");
  await completeForward(declinedDb, declined.supabase, declined.project.id, "QUOTATION");
  await completeForward(declinedDb, declined.supabase, declined.project.id, "LOAN_DOCUMENT_COLLECTION");
  await completeForward(declinedDb, declined.supabase, declined.project.id, "LOAN_SUBMISSION");

  const declinedReview = stageByCode(declinedDb, "LOAN_REVIEW");
  await submitLoanFallbackDecision(declined.supabase, declined.project.id, declinedReview.id, "REJECT_AND_OFFER_CASH", "Bank rejected scenario loan.");
  const declinedCash = await submitLoanFallbackDecision(declined.supabase, declined.project.id, declinedReview.id, "DECLINE_CASH_OFFER", "Customer cancelled after loan rejection.");
  assert.equal(declinedCash.ok, true);
  assert.equal(declinedDb.projects[0].status, "CANCELLED");
  assert.equal(declinedDb.projects[0].current_stage_id, null);
  assert.ok(declinedDb.project_stages.every((stage) => ["COMPLETED", "CANCELLED", "SKIPPED"].includes(stage.status)));
});
