import test from "node:test";
import assert from "node:assert/strict";

import {
  dueAtFromNow,
  forwardTransitionError,
  relationFirst,
  slaHoursFromRelatedStage,
  workflowVersionIdFromStage,
} from "../services/workflow/transitionRules.ts";

test("transition dueAtFromNow respects empty SLA and deterministic clock", () => {
  const now = new Date("2026-05-09T00:00:00.000Z").getTime();
  assert.equal(dueAtFromNow(null, now), null);
  assert.equal(dueAtFromNow(0, now), null);
  assert.equal(dueAtFromNow(8, now), "2026-05-09T08:00:00.000Z");
});

test("forward transition validation only allows active or blocked stages", () => {
  assert.equal(forwardTransitionError(null), "Current project stage was not found.");
  assert.equal(forwardTransitionError({ status: "PENDING" }), "Only an active or blocked stage can be completed.");
  assert.equal(forwardTransitionError({ status: "IN_PROGRESS" }), null);
  assert.equal(forwardTransitionError({ status: "BLOCKED" }), null);
});

test("transition relation helpers support Supabase object and array relation shapes", () => {
  assert.deepEqual(relationFirst([{ id: "a" }, { id: "b" }]), { id: "a" });
  assert.deepEqual(relationFirst({ id: "single" }), { id: "single" });
  assert.equal(relationFirst([]), null);

  assert.equal(workflowVersionIdFromStage({ workflow_stages: [{ workflow_version_id: "version-1" }] }), "version-1");
  assert.equal(workflowVersionIdFromStage({ workflow_stages: { workflow_version_id: "version-2" } }), "version-2");
  assert.equal(workflowVersionIdFromStage({}), null);

  assert.equal(slaHoursFromRelatedStage({ workflow_stages: [{ sla_hours: 24 }] }), 24);
  assert.equal(slaHoursFromRelatedStage({ workflow_stages: { sla_hours: 8 } }), 8);
  assert.equal(slaHoursFromRelatedStage({}), null);
});
