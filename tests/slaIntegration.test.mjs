import test from "node:test";
import assert from "node:assert/strict";

import { pauseStageSla, refreshProjectSla, resumeStageSla } from "../services/workflow/slaEngine.ts";
import { fakeSupabase } from "./helpers/fakeSupabase.mjs";

async function withNow(value, fn) {
  const originalNow = Date.now;
  Date.now = () => new Date(value).getTime();
  try {
    await fn();
  } finally {
    Date.now = originalNow;
  }
}

test("refreshProjectSla updates stage/project status and creates SLA exception notification", async () => {
  await withNow("2026-05-09T12:00:00.000Z", async () => {
    const db = {
      projects: [{ id: "project-1", sla_status: "ON_TRACK" }],
      project_stages: [
        {
          id: "stage-survey",
          project_id: "project-1",
          name: "Survey",
          owner_role: "ops",
          status: "IN_PROGRESS",
          sla_status: "ON_TRACK",
          due_at: "2026-05-09T11:00:00.000Z",
        },
        {
          id: "stage-tssr",
          project_id: "project-1",
          name: "TSSR",
          owner_role: "engineer",
          status: "IN_PROGRESS",
          sla_status: "ON_TRACK",
          due_at: "2026-05-09T18:00:00.000Z",
        },
      ],
      project_exceptions: [],
      notifications: [],
      notification_deliveries: [],
    };

    const result = await refreshProjectSla(fakeSupabase(db), "project-1");

    assert.equal(result.ok, true);
    assert.equal(result.projectSlaStatus, "OVER_SLA");
    assert.equal(result.checkedStageCount, 2);
    assert.equal(result.updatedStageCount, 2);
    assert.equal(result.openSlaExceptionCount, 1);
    assert.equal(db.project_stages[0].sla_status, "OVER_SLA");
    assert.equal(db.project_stages[1].sla_status, "NEAR_SLA");
    assert.equal(db.projects[0].sla_status, "OVER_SLA");
    assert.equal(db.project_exceptions.length, 1);
    assert.equal(db.project_exceptions[0].category, "SLA");
    assert.equal(db.project_exceptions[0].severity, "HIGH");
    assert.equal(db.project_exceptions[0].metadata.source, "sla_engine");
    assert.equal(db.notifications[0].exception_id, db.project_exceptions[0].id);
    assert.equal(db.notifications[0].metadata.event, "SLA_OVERDUE");
    assert.equal(db.notification_deliveries[0].notification_id, db.notifications[0].id);
  });
});

test("refreshProjectSla does not duplicate open SLA exceptions and resolves recovered stages", async () => {
  await withNow("2026-05-09T12:00:00.000Z", async () => {
    const db = {
      projects: [{ id: "project-1", sla_status: "OVER_SLA" }],
      project_stages: [
        {
          id: "stage-survey",
          project_id: "project-1",
          name: "Survey",
          owner_role: "ops",
          status: "IN_PROGRESS",
          sla_status: "OVER_SLA",
          due_at: "2026-05-10T12:00:00.000Z",
        },
      ],
      project_exceptions: [
        {
          id: "exception-1",
          project_id: "project-1",
          project_stage_id: "stage-survey",
          category: "SLA",
          status: "OPEN",
        },
      ],
      notifications: [],
      notification_deliveries: [],
    };

    const result = await refreshProjectSla(fakeSupabase(db), "project-1");

    assert.equal(result.ok, true);
    assert.equal(result.projectSlaStatus, "ON_TRACK");
    assert.equal(result.updatedStageCount, 1);
    assert.equal(result.openSlaExceptionCount, 0);
    assert.equal(db.project_stages[0].sla_status, "ON_TRACK");
    assert.equal(db.projects[0].sla_status, "ON_TRACK");
    assert.equal(db.project_exceptions.length, 1);
    assert.equal(db.project_exceptions[0].status, "RESOLVED");
    assert.ok(db.project_exceptions[0].resolved_at);
    assert.equal(db.project_exceptions[0].resolution_notes, "SLA status returned below OVER_SLA.");
    assert.equal(db.notifications.length, 0);
  });
});

test("pauseStageSla and resumeStageSla preserve remaining time and audit the lifecycle", async () => {
  const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const db = {
    projects: [{ id: "project-1", sla_status: "ON_TRACK" }],
    project_stages: [
      {
        id: "stage-1",
        project_id: "project-1",
        name: "Installation",
        owner_role: "contractor",
        status: "IN_PROGRESS",
        sla_status: "ON_TRACK",
        due_at: dueAt,
        metadata: {},
      },
    ],
    project_exceptions: [],
    activity_logs: [],
    notifications: [],
    notification_deliveries: [],
  };
  const supabase = fakeSupabase(db);

  const paused = await pauseStageSla(supabase, "project-1", "stage-1", "Waiting for customer site access.");
  assert.equal(paused.ok, true);
  assert.equal(paused.slaStatus, "SLA_PAUSED");
  assert.equal(db.project_stages[0].sla_status, "SLA_PAUSED");
  assert.equal(db.projects[0].sla_status, "SLA_PAUSED");
  assert.equal(db.project_stages[0].metadata.sla_pause.reason, "Waiting for customer site access.");
  assert.equal(db.activity_logs[0].action, "SLA_PAUSED");

  const resumed = await resumeStageSla(supabase, "project-1", "stage-1");
  assert.equal(resumed.ok, true);
  assert.equal(resumed.slaStatus, "ON_TRACK");
  assert.equal(db.project_stages[0].sla_status, "ON_TRACK");
  assert.ok(db.project_stages[0].due_at);
  assert.equal(db.project_stages[0].metadata.sla_pause, undefined);
  assert.equal(db.project_stages[0].metadata.sla_pause_history.length, 1);
  assert.equal(db.activity_logs[1].action, "SLA_RESUMED");
  assert.equal(db.projects[0].sla_status, "ON_TRACK");
});
