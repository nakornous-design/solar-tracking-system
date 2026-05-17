import test from "node:test";
import assert from "node:assert/strict";

import { validateStageGates } from "../services/workflow/gateValidation.ts";
import { fakeSupabase } from "./helpers/fakeSupabase.mjs";

test("validateStageGates blocks incomplete hard checklist and documents", async () => {
  const supabase = fakeSupabase({
    project_stages: [{ id: "stage-1", project_id: "project-1" }],
    approval_requests: [],
    project_checklists: [
      { id: "check-1", project_stage_id: "stage-1", code: "SURVEY_DONE", label: "Survey done", status: "PENDING", gate_severity: "HARD", is_required: true },
      { id: "check-2", project_stage_id: "stage-1", code: "OPTIONAL", label: "Optional", status: "PENDING", gate_severity: "INFO", is_required: true },
    ],
    project_documents: [
      { id: "doc-1", project_stage_id: "stage-1", code: "PHOTO", name: "Survey photo", status: "UPLOADED", gate_severity: "HARD", is_required: true, requires_verification: true },
    ],
  });

  const result = await validateStageGates(supabase, "stage-1");

  assert.equal(result.passed, false);
  assert.deepEqual(result.violations.map((item) => item.id), ["check-1", "doc-1"]);
});

test("validateStageGates allows overrideable blockers when approved override exists", async () => {
  const supabase = fakeSupabase({
    project_stages: [{ id: "stage-1", project_id: "project-1" }],
    approval_requests: [{ id: "approval-1", project_id: "project-1", project_stage_id: "stage-1", type: "GATE_OVERRIDE", status: "APPROVED" }],
    project_checklists: [
      { id: "check-1", project_stage_id: "stage-1", code: "PAYMENT", label: "Payment", status: "PENDING", gate_severity: "OVERRIDEABLE", is_required: true },
    ],
    project_documents: [],
  });

  const result = await validateStageGates(supabase, "stage-1");

  assert.equal(result.passed, true);
  assert.deepEqual(result.violations, []);
});
