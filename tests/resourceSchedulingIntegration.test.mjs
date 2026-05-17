import test from "node:test";
import assert from "node:assert/strict";

import { scheduleProjectStage } from "../services/workflow/resourceSchedulingEngine.ts";
import { fakeSupabase } from "./helpers/fakeSupabase.mjs";

function schedulingDb(overrides = {}) {
  return {
    projects: [{ id: "project-1", status: "IN_PROGRESS" }],
    project_stages: [
      {
        id: "stage-install",
        project_id: "project-1",
        code: "INSTALLATION",
        name: "Installation",
        owner_role: "contractor",
        status: "PENDING",
        metadata: {},
      },
    ],
    resource_teams: [
      {
        id: "team-1",
        name: "Install Team A",
        owner_role: "contractor",
        territory: "BKK",
        daily_capacity: 2,
        skills: ["installation"],
        is_active: true,
      },
    ],
    resource_assignments: [],
    project_checklists: [
      {
        id: "check-schedule",
        project_stage_id: "stage-install",
        code: "SCHEDULE_CONFIRMED",
        status: "PENDING",
        metadata: {},
      },
    ],
    project_exceptions: [],
    activity_logs: [],
    notifications: [],
    notification_deliveries: [],
    ...overrides,
  };
}

test("scheduleProjectStage confirms available team and updates stage metadata", async () => {
  const db = schedulingDb();
  const result = await scheduleProjectStage(fakeSupabase(db), {
    projectId: "project-1",
    projectStageId: "stage-install",
    scheduledStart: "2026-05-10T02:00:00.000Z",
    resourceTeamId: "team-1",
    requiredSkill: "installation",
    territory: "BKK",
    notes: "Morning install",
  });

  assert.equal(result.ok, true);
  assert.equal(result.conflictStatus, "NONE");
  assert.equal(db.resource_assignments.length, 1);
  assert.equal(db.resource_assignments[0].status, "CONFIRMED");
  assert.equal(db.resource_assignments[0].scheduled_end, "2026-05-10T10:00:00.000Z");
  assert.equal(db.project_stages[0].metadata.resource_team_id, "team-1");
  assert.equal(db.project_stages[0].metadata.schedule_conflict_status, "NONE");
  assert.equal(db.project_checklists[0].status, "PASSED");
  assert.equal(db.project_checklists[0].metadata.resource_team_name, "Install Team A");
  assert.equal(db.project_checklists[0].metadata.passed_source, "resource_scheduling_engine");
  assert.equal(db.activity_logs[0].action, "RESOURCE_SCHEDULED");
  assert.equal(db.notifications[0].title, "Schedule confirmed: Installation");
  assert.equal(db.notifications[0].recipient_role, "contractor");
});

test("scheduleProjectStage creates RESOURCE exception and warning notification for conflicts", async () => {
  const db = schedulingDb({
    resource_assignments: [
      {
        id: "assignment-existing",
        project_id: "other-project",
        project_stage_id: "other-stage",
        resource_team_id: "team-1",
        scheduled_start: "2026-05-10T04:00:00.000Z",
        scheduled_end: "2026-05-10T08:00:00.000Z",
        status: "CONFIRMED",
      },
    ],
  });

  const result = await scheduleProjectStage(fakeSupabase(db), {
    projectId: "project-1",
    projectStageId: "stage-install",
    scheduledStart: "2026-05-10T02:00:00.000Z",
    scheduledEnd: "2026-05-10T10:00:00.000Z",
    resourceTeamId: "team-1",
    requiredSkill: "installation",
    territory: "BKK",
  });

  assert.equal(result.ok, true);
  assert.equal(result.conflictStatus, "TIME_CONFLICT");
  assert.equal(db.resource_assignments.length, 2);
  assert.equal(db.resource_assignments[1].status, "PLANNED");
  assert.equal(db.resource_assignments[1].conflict_reason, "Resource team already has an overlapping assignment.");
  assert.equal(db.project_exceptions[0].category, "RESOURCE");
  assert.equal(db.project_exceptions[0].severity, "HIGH");
  assert.equal(db.project_exceptions[0].metadata.conflict_status, "TIME_CONFLICT");
  assert.equal(db.notifications[0].severity, "HIGH");
  assert.equal(db.notifications[0].metadata.event, "RESOURCE_CONFLICT");
});

test("scheduleProjectStage upserts existing stage assignment instead of duplicating it", async () => {
  const db = schedulingDb({
    resource_assignments: [
      {
        id: "assignment-1",
        project_id: "project-1",
        project_stage_id: "stage-install",
        resource_team_id: "team-1",
        scheduled_start: "2026-05-10T02:00:00.000Z",
        scheduled_end: "2026-05-10T10:00:00.000Z",
        status: "CONFIRMED",
        conflict_status: "NONE",
      },
    ],
  });

  const result = await scheduleProjectStage(fakeSupabase(db), {
    projectId: "project-1",
    projectStageId: "stage-install",
    scheduledStart: "2026-05-11T02:00:00.000Z",
    resourceTeamId: "team-1",
    requiredSkill: "installation",
    territory: "BKK",
  });

  assert.equal(result.ok, true);
  assert.equal(result.assignmentId, "assignment-1");
  assert.equal(db.resource_assignments.length, 1);
  assert.equal(db.resource_assignments[0].scheduled_start, "2026-05-11T02:00:00.000Z");
  assert.equal(db.resource_assignments[0].scheduled_end, "2026-05-11T10:00:00.000Z");
});
