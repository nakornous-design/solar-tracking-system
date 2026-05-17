import assert from "node:assert/strict";
import test from "node:test";

import { fakeSupabase } from "./helpers/fakeSupabase.mjs";
import { submitLoanFallbackDecision } from "../services/workflow/loanFallbackEngine.ts";

function makeLoanFallbackDb() {
  return {
    projects: [
      {
        id: "project-loan-1",
        payment_type: "LOAN",
        status: "IN_PROGRESS",
        current_stage_id: "stage-loan-review",
        sla_status: "ON_TRACK",
      },
    ],
    project_stages: [
      {
        id: "stage-loan-submit",
        project_id: "project-loan-1",
        workflow_stage_id: "wf-loan-submit",
        code: "LOAN_SUBMISSION",
        name: "Loan Submission",
        order_index: 6,
        owner_role: "finance",
        status: "COMPLETED",
        metadata: {},
        workflow_stages: { workflow_version_id: "wf-version-loan", sla_hours: 48 },
      },
      {
        id: "stage-loan-review",
        project_id: "project-loan-1",
        workflow_stage_id: "wf-loan-review",
        code: "LOAN_REVIEW",
        name: "Loan Review",
        order_index: 7,
        owner_role: "finance",
        status: "IN_PROGRESS",
        metadata: {},
        workflow_stages: { workflow_version_id: "wf-version-loan", sla_hours: 120 },
      },
      {
        id: "stage-loan-approval",
        project_id: "project-loan-1",
        workflow_stage_id: "wf-loan-approval",
        code: "LOAN_APPROVAL",
        name: "Loan Approval",
        order_index: 8,
        owner_role: "finance",
        status: "PENDING",
        metadata: {},
        workflow_stages: { workflow_version_id: "wf-version-loan", sla_hours: 48 },
      },
      {
        id: "stage-down-payment",
        project_id: "project-loan-1",
        workflow_stage_id: "wf-down-payment",
        code: "DOWN_PAYMENT",
        name: "Down Payment",
        order_index: 9,
        owner_role: "finance",
        status: "PENDING",
        metadata: {},
        workflow_stages: { workflow_version_id: "wf-version-loan", sla_hours: 72 },
      },
      {
        id: "stage-ready",
        project_id: "project-loan-1",
        workflow_stage_id: "wf-ready",
        code: "READY_FOR_INSTALL",
        name: "Ready for Install",
        order_index: 10,
        owner_role: "ops",
        status: "PENDING",
        metadata: {},
        workflow_stages: { workflow_version_id: "wf-version-loan", sla_hours: 24 },
      },
    ],
    project_exceptions: [],
    activity_logs: [],
    notifications: [],
    notification_deliveries: [],
  };
}

test("loan rejection moves the loan stage to waiting and opens a cash-offer exception", async () => {
  const db = makeLoanFallbackDb();
  const result = await submitLoanFallbackDecision(
    fakeSupabase(db),
    "project-loan-1",
    "stage-loan-review",
    "REJECT_AND_OFFER_CASH",
    "Bank rejected debt-service ratio.",
    [{ type: "bank_result", id: "drive-file-1" }],
  );

  assert.equal(result.ok, true);
  assert.equal(result.paymentType, "LOAN");
  assert.equal(db.project_stages[1].status, "WAITING");
  assert.equal(db.project_stages[1].metadata.loan_fallback.state, "CASH_OFFERED");
  assert.equal(db.project_exceptions.length, 1);
  assert.equal(db.project_exceptions[0].status, "OPEN");
  assert.equal(db.project_exceptions[0].title, "Loan rejected: cash fallback required");
  assert.equal(db.activity_logs[0].action, "LOAN_REJECTED_CASH_OFFERED");
  assert.equal(db.notifications[0].recipient_role, "sales");
});

test("accepting the cash offer converts the project to CASH and resumes at down payment", async () => {
  const db = makeLoanFallbackDb();
  const supabase = fakeSupabase(db);

  await submitLoanFallbackDecision(
    supabase,
    "project-loan-1",
    "stage-loan-review",
    "REJECT_AND_OFFER_CASH",
    "Bank rejected debt-service ratio.",
  );
  const result = await submitLoanFallbackDecision(
    supabase,
    "project-loan-1",
    "stage-loan-review",
    "ACCEPT_CASH_OFFER",
    "Customer accepts cash payment.",
  );

  assert.equal(result.ok, true);
  assert.equal(result.paymentType, "CASH");
  assert.equal(result.nextStageId, "stage-down-payment");
  assert.equal(db.projects[0].payment_type, "CASH");
  assert.equal(db.projects[0].current_stage_id, "stage-down-payment");
  assert.equal(db.project_stages.find((stage) => stage.id === "stage-loan-review").status, "COMPLETED");
  assert.equal(db.project_stages.find((stage) => stage.id === "stage-loan-approval").status, "SKIPPED");
  assert.equal(db.project_stages.find((stage) => stage.id === "stage-down-payment").status, "IN_PROGRESS");
  assert.ok(db.project_stages.find((stage) => stage.id === "stage-down-payment").due_at);
  assert.equal(db.project_exceptions.length, 1);
  assert.equal(db.project_exceptions[0].status, "RESOLVED");
  assert.equal(db.activity_logs.at(-1).action, "LOAN_REJECTED_CASH_ACCEPTED");
});

test("declining the cash offer cancels the project and closes the fallback exception", async () => {
  const db = makeLoanFallbackDb();
  const supabase = fakeSupabase(db);

  await submitLoanFallbackDecision(
    supabase,
    "project-loan-1",
    "stage-loan-review",
    "REJECT_AND_OFFER_CASH",
    "Bank rejected debt-service ratio.",
  );
  const result = await submitLoanFallbackDecision(
    supabase,
    "project-loan-1",
    "stage-loan-review",
    "DECLINE_CASH_OFFER",
    "Customer does not accept cash option.",
  );

  assert.equal(result.ok, true);
  assert.equal(result.projectStatus, "CANCELLED");
  assert.equal(db.projects[0].status, "CANCELLED");
  assert.equal(db.projects[0].current_stage_id, null);
  assert.equal(db.project_stages.find((stage) => stage.id === "stage-loan-review").status, "CANCELLED");
  assert.equal(db.project_stages.find((stage) => stage.id === "stage-ready").status, "CANCELLED");
  assert.equal(db.project_stages.find((stage) => stage.id === "stage-loan-submit").status, "COMPLETED");
  assert.equal(db.project_exceptions.length, 1);
  assert.equal(db.project_exceptions[0].status, "CLOSED");
  assert.equal(db.activity_logs.at(-1).action, "PROJECT_CANCELLED_AFTER_LOAN_REJECTION");
});

test("cash fallback cannot run before a loan rejection offer exists", async () => {
  const db = makeLoanFallbackDb();
  const result = await submitLoanFallbackDecision(
    fakeSupabase(db),
    "project-loan-1",
    "stage-loan-review",
    "ACCEPT_CASH_OFFER",
  );

  assert.deepEqual(result, {
    ok: false,
    status: 400,
    error: "Cash fallback has not been offered for this loan stage.",
  });
});
