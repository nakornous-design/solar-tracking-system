import test from "node:test";
import assert from "node:assert/strict";

import {
  createProjectInputError,
  getWorkflowTemplate,
  lockedPaymentType,
  lockedProjectType,
  standardLookup,
} from "../services/workflow/createProjectRules.ts";

test("create project input validation requires customer code and name", () => {
  assert.equal(createProjectInputError({ customerCode: "", customerName: "ACME" }), "Customer code and customer name are required.");
  assert.equal(createProjectInputError({ customerCode: "C-001", customerName: "" }), "Customer code and customer name are required.");
  assert.equal(createProjectInputError({ customerCode: "C-001", customerName: "ACME" }), null);
});

test("workflow template helper supports object and array relation shapes", () => {
  assert.deepEqual(getWorkflowTemplate({ workflow_templates: [{ project_type: "RES-S", payment_type: "CASH" }] }), {
    project_type: "RES-S",
    payment_type: "CASH",
  });
  assert.deepEqual(getWorkflowTemplate({ workflow_templates: { project_type: "RES-L", payment_type: "LOAN" } }), {
    project_type: "RES-L",
    payment_type: "LOAN",
  });
  assert.deepEqual(getWorkflowTemplate({ workflow_templates: [] }), {});
});

test("locked project/payment values prefer workflow version snapshot", () => {
  const workflowVersion = { workflow_templates: { project_type: "RES-S", payment_type: "CASH" } };
  assert.equal(lockedProjectType(workflowVersion, "B2G"), "RES-S");
  assert.equal(lockedPaymentType(workflowVersion, "LOAN"), "CASH");
  assert.equal(lockedProjectType({}, "B2G"), "B2G");
  assert.equal(lockedPaymentType({}, "LOAN"), "LOAN");
});

test("standard lookup uses uuid id when possible and V8R2 code fallback otherwise", () => {
  assert.deepEqual(standardLookup("550e8400-e29b-41d4-a716-446655440000"), {
    column: "id",
    value: "550e8400-e29b-41d4-a716-446655440000",
  });
  assert.deepEqual(standardLookup("V9"), { column: "code", value: "V9" });
  assert.deepEqual(standardLookup(), { column: "code", value: "V8R2" });
});
