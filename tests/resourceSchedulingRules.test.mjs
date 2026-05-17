import test from "node:test";
import assert from "node:assert/strict";

import { addHours, detectResourceConflict, overlaps, sameScheduleDay, skillsContain } from "../services/workflow/resourceSchedulingRules.ts";

test("resource scheduling date helpers detect day and overlap boundaries", () => {
  assert.equal(addHours("2026-05-10T02:00:00.000Z", 8), "2026-05-10T10:00:00.000Z");
  assert.equal(sameScheduleDay("2026-05-10T02:00:00.000Z", "2026-05-10T23:00:00.000Z"), true);
  assert.equal(overlaps("2026-05-10T02:00:00.000Z", "2026-05-10T04:00:00.000Z", "2026-05-10T04:00:00.000Z", "2026-05-10T06:00:00.000Z"), false);
  assert.equal(overlaps("2026-05-10T02:00:00.000Z", "2026-05-10T05:00:00.000Z", "2026-05-10T04:00:00.000Z", "2026-05-10T06:00:00.000Z"), true);
});

test("resource scheduling skill matching is case-insensitive", () => {
  assert.equal(skillsContain(["Installation", "survey"], "installation"), true);
  assert.equal(skillsContain(["survey"], "installation"), false);
  assert.equal(skillsContain([], null), true);
});

test("resource conflict detection prioritizes skill and territory mismatches", () => {
  assert.deepEqual(
    detectResourceConflict({
      team: { name: "Team A", territory: "BKK", daily_capacity: 2, skills: ["survey"] },
      scheduledStart: "2026-05-10T02:00:00.000Z",
      scheduledEnd: "2026-05-10T10:00:00.000Z",
      requiredSkill: "installation",
      territory: "BKK",
      assignments: [],
      currentProjectStageId: "stage-1",
    }),
    { status: "SKILL_MISMATCH", reason: "Team does not have required skill: installation" },
  );

  assert.deepEqual(
    detectResourceConflict({
      team: { name: "Team A", territory: "BKK", daily_capacity: 2, skills: ["installation"] },
      scheduledStart: "2026-05-10T02:00:00.000Z",
      scheduledEnd: "2026-05-10T10:00:00.000Z",
      requiredSkill: "installation",
      territory: "CNX",
      assignments: [],
      currentProjectStageId: "stage-1",
    }),
    { status: "TERRITORY_MISMATCH", reason: "Team territory BKK does not match CNX." },
  );
});

test("resource conflict detection catches time and daily capacity conflicts", () => {
  const team = { name: "Team A", territory: "BKK", daily_capacity: 1, skills: ["installation"] };

  assert.deepEqual(
    detectResourceConflict({
      team,
      scheduledStart: "2026-05-10T02:00:00.000Z",
      scheduledEnd: "2026-05-10T10:00:00.000Z",
      requiredSkill: "installation",
      territory: "BKK",
      assignments: [{ project_stage_id: "other", scheduled_start: "2026-05-10T08:00:00.000Z", scheduled_end: "2026-05-10T12:00:00.000Z" }],
      currentProjectStageId: "stage-1",
    }),
    { status: "TIME_CONFLICT", reason: "Resource team already has an overlapping assignment." },
  );

  assert.deepEqual(
    detectResourceConflict({
      team,
      scheduledStart: "2026-05-10T12:00:00.000Z",
      scheduledEnd: "2026-05-10T14:00:00.000Z",
      requiredSkill: "installation",
      territory: "BKK",
      assignments: [{ project_stage_id: "other", scheduled_start: "2026-05-10T02:00:00.000Z", scheduled_end: "2026-05-10T10:00:00.000Z" }],
      currentProjectStageId: "stage-1",
    }),
    { status: "CAPACITY_CONFLICT", reason: "Daily capacity exceeded for Team A." },
  );
});
