import test from "node:test";
import assert from "node:assert/strict";

import { calculateStageSlaStatus, maxSlaStatus } from "../services/workflow/slaRules.ts";

const NOW = new Date("2026-05-09T12:00:00.000Z").getTime();

function stage(overrides = {}) {
  return {
    id: "stage-1",
    name: "Survey",
    owner_role: "ops",
    status: "IN_PROGRESS",
    sla_status: "ON_TRACK",
    due_at: "2026-05-10T12:00:00.000Z",
    ...overrides,
  };
}

test("calculateStageSlaStatus keeps paused SLA paused", () => {
  assert.equal(calculateStageSlaStatus(stage({ sla_status: "SLA_PAUSED", due_at: "2026-05-01T00:00:00.000Z" }), NOW), "SLA_PAUSED");
});

test("calculateStageSlaStatus ignores inactive, missing, and invalid due dates", () => {
  assert.equal(calculateStageSlaStatus(stage({ status: "COMPLETED", due_at: "2026-05-01T00:00:00.000Z" }), NOW), "ON_TRACK");
  assert.equal(calculateStageSlaStatus(stage({ due_at: null }), NOW), "ON_TRACK");
  assert.equal(calculateStageSlaStatus(stage({ due_at: "bad-date" }), NOW), "ON_TRACK");
});

test("calculateStageSlaStatus detects near and over SLA", () => {
  assert.equal(calculateStageSlaStatus(stage({ due_at: "2026-05-09T11:59:00.000Z" }), NOW), "OVER_SLA");
  assert.equal(calculateStageSlaStatus(stage({ due_at: "2026-05-09T18:00:00.000Z" }), NOW), "NEAR_SLA");
  assert.equal(calculateStageSlaStatus(stage({ due_at: "2026-05-10T18:00:00.000Z" }), NOW), "ON_TRACK");
});

test("maxSlaStatus returns highest operational priority", () => {
  assert.equal(maxSlaStatus(["ON_TRACK", "NEAR_SLA"]), "NEAR_SLA");
  assert.equal(maxSlaStatus(["ON_TRACK", "OVER_SLA", "NEAR_SLA"]), "OVER_SLA");
  assert.equal(maxSlaStatus(["OVER_SLA", "SLA_PAUSED"]), "SLA_PAUSED");
});
