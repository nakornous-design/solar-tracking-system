import test from "node:test";
import assert from "node:assert/strict";

import { switchFinancePath } from "../services/workflow/financePathEngine.ts";
import { fakeSupabase } from "./helpers/fakeSupabase.mjs";

test("switchFinancePath at Quotation opens selected branch without leaving Quotation", async () => {
  const db = {
    projects: [
      {
        id: "project-1",
        payment_type: "CASH",
        finance_state: "CASH_PENDING_PAYMENT",
        payment_path_history: [],
        status: "IN_PROGRESS",
        current_stage_id: "stage-quotation",
      },
    ],
    project_stages: [
      {
        id: "stage-quotation",
        project_id: "project-1",
        code: "QUOTATION",
        order_index: 4,
        status: "IN_PROGRESS",
        workflow_stages: { sla_hours: 48 },
      },
      {
        id: "stage-payment",
        project_id: "project-1",
        code: "PAYMENT",
        order_index: 5,
        status: "PENDING",
        workflow_stages: { sla_hours: 72 },
      },
      {
        id: "stage-loan-docs",
        project_id: "project-1",
        code: "LOAN_DOCUMENT_COLLECTION",
        order_index: 6,
        status: "SKIPPED",
        workflow_stages: { sla_hours: 72 },
      },
      {
        id: "stage-loan-submission",
        project_id: "project-1",
        code: "LOAN_SUBMISSION",
        order_index: 7,
        status: "SKIPPED",
        workflow_stages: { sla_hours: 48 },
      },
    ],
    activity_logs: [],
    notifications: [],
    notification_deliveries: [],
  };

  const result = await switchFinancePath(
    fakeSupabase(db),
    "project-1",
    "SWITCH_TO_LOAN",
    "Customer chose installment at quotation.",
    "user-1",
    "stage-quotation",
  );

  assert.equal(result.ok, true);
  assert.equal(result.paymentType, "LOAN");
  assert.equal(result.nextStageId, "stage-quotation");
  assert.equal(db.projects[0].payment_type, "LOAN");
  assert.equal(db.projects[0].finance_state, "LOAN_DOC_COLLECTION");
  assert.equal(db.projects[0].current_stage_id, "stage-quotation");
  assert.equal(db.project_stages.find((stage) => stage.id === "stage-payment").status, "SKIPPED");
  assert.equal(db.project_stages.find((stage) => stage.id === "stage-loan-docs").status, "PENDING");
  assert.equal(db.project_stages.find((stage) => stage.id === "stage-loan-docs").started_at, null);
  assert.equal(db.activity_logs[0].action, "SWITCH_TO_LOAN");
  assert.equal(db.activity_logs[0].after_state.decision_stage_code, "QUOTATION");
});

test("switchFinancePath outside Quotation moves the active stage immediately", async () => {
  const db = {
    projects: [
      {
        id: "project-1",
        payment_type: "LOAN",
        finance_state: "LOAN_DOC_COLLECTION",
        payment_path_history: [],
        status: "IN_PROGRESS",
        current_stage_id: "stage-loan-docs",
      },
    ],
    project_stages: [
      {
        id: "stage-payment",
        project_id: "project-1",
        code: "PAYMENT",
        order_index: 5,
        status: "SKIPPED",
        workflow_stages: { sla_hours: 72 },
      },
      {
        id: "stage-loan-docs",
        project_id: "project-1",
        code: "LOAN_DOCUMENT_COLLECTION",
        order_index: 6,
        status: "IN_PROGRESS",
        workflow_stages: { sla_hours: 72 },
      },
    ],
    activity_logs: [],
    notifications: [],
    notification_deliveries: [],
  };

  const result = await switchFinancePath(fakeSupabase(db), "project-1", "SWITCH_TO_CASH", "Customer switched to cash.", "user-1");

  assert.equal(result.ok, true);
  assert.equal(result.nextStageId, "stage-payment");
  assert.equal(db.projects[0].payment_type, "CASH");
  assert.equal(db.projects[0].current_stage_id, "stage-payment");
  assert.equal(db.project_stages.find((stage) => stage.id === "stage-payment").status, "IN_PROGRESS");
  assert.ok(db.project_stages.find((stage) => stage.id === "stage-payment").started_at);
  assert.equal(db.project_stages.find((stage) => stage.id === "stage-loan-docs").status, "SKIPPED");
});
