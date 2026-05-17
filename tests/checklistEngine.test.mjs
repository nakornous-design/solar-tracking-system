import assert from "node:assert/strict";
import test from "node:test";

import { fakeSupabase } from "./helpers/fakeSupabase.mjs";
import { passProjectChecklist, updateProjectChecklist } from "../services/workflow/checklistEngine.ts";

test("passProjectChecklist marks a checklist passed and writes an activity log", async () => {
  const db = {
    project_checklists: [
      {
        id: "check-1",
        project_id: "project-1",
        project_stage_id: "stage-1",
        code: "SITE_READY",
        label: "Site is ready",
        status: "PENDING",
        metadata: { source: "seed" },
      },
    ],
    activity_logs: [],
  };

  const result = await passProjectChecklist(fakeSupabase(db), "check-1", "user-1");

  assert.equal(result.ok, true);
  assert.equal(result.alreadyPassed, false);
  assert.equal(db.project_checklists[0].status, "PASSED");
  assert.equal(db.project_checklists[0].completed_by, "user-1");
  assert.ok(db.project_checklists[0].completed_at);
  assert.equal(db.project_checklists[0].metadata.source, "seed");
  assert.equal(db.project_checklists[0].metadata.passed_source, "project_checklist_api");
  assert.equal(db.activity_logs.length, 1);
  assert.equal(db.activity_logs[0].action, "CHECKLIST_PASSED");
  assert.deepEqual(db.activity_logs[0].before_state, { status: "PENDING", notes: null });
  assert.deepEqual(db.activity_logs[0].after_state, { status: "PASSED", notes: null });
});

test("passProjectChecklist is idempotent for already-passed checklist items", async () => {
  const db = {
    project_checklists: [
      {
        id: "check-1",
        project_id: "project-1",
        project_stage_id: "stage-1",
        code: "SITE_READY",
        label: "Site is ready",
        status: "PASSED",
        metadata: {},
      },
    ],
    activity_logs: [],
  };

  const result = await passProjectChecklist(fakeSupabase(db), "check-1", "user-1");

  assert.equal(result.ok, true);
  assert.equal(result.alreadyPassed, true);
  assert.equal(db.activity_logs.length, 0);
});

test("passProjectChecklist returns not found for missing checklist item", async () => {
  const result = await passProjectChecklist(fakeSupabase({ project_checklists: [] }), "missing", "user-1");

  assert.deepEqual(result, {
    ok: false,
    status: 404,
    error: "Project checklist was not found.",
  });
});

test("passProjectChecklist blocks schedule confirmation without saved schedule", async () => {
  const db = {
    project_checklists: [
      {
        id: "check-schedule",
        project_id: "project-1",
        project_stage_id: "stage-scheduling",
        code: "SCHEDULE_CONFIRMED",
        label: "Installation schedule confirmed",
        status: "PENDING",
        metadata: {},
      },
    ],
    project_stages: [{ id: "stage-scheduling", metadata: {} }],
    activity_logs: [],
  };

  const result = await passProjectChecklist(fakeSupabase(db), "check-schedule", "user-1");

  assert.deepEqual(result, {
    ok: false,
    status: 400,
    error: "Installation schedule must be saved before this checklist can pass.",
  });
  assert.equal(db.project_checklists[0].status, "PENDING");
  assert.equal(db.activity_logs.length, 0);
});

test("passProjectChecklist allows schedule confirmation after schedule is saved", async () => {
  const db = {
    project_checklists: [
      {
        id: "check-schedule",
        project_id: "project-1",
        project_stage_id: "stage-scheduling",
        code: "SCHEDULE_CONFIRMED",
        label: "Installation schedule confirmed",
        status: "PENDING",
        metadata: {},
      },
    ],
    project_stages: [{ id: "stage-scheduling", metadata: { scheduled_at: "2026-05-12T02:00:00.000Z" } }],
    activity_logs: [],
  };

  const result = await passProjectChecklist(fakeSupabase(db), "check-schedule", "user-1");

  assert.equal(result.ok, true);
  assert.equal(db.project_checklists[0].status, "PASSED");
  assert.equal(db.activity_logs[0].action, "CHECKLIST_PASSED");
});

test("updateProjectChecklist saves notes and can move checklist back to pending", async () => {
  const db = {
    project_checklists: [
      {
        id: "check-1",
        project_id: "project-1",
        project_stage_id: "stage-1",
        code: "CUSTOMER_PROFILE_CAPTURED",
        label: "Customer profile captured",
        status: "PASSED",
        notes: "Initial note",
        metadata: { source: "seed" },
      },
    ],
    activity_logs: [],
  };

  const result = await updateProjectChecklist(
    fakeSupabase(db),
    "check-1",
    { status: "PENDING", notes: "Missing GPS pin." },
    "user-1",
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, "PENDING");
  assert.equal(result.notes, "Missing GPS pin.");
  assert.equal(db.project_checklists[0].status, "PENDING");
  assert.equal(db.project_checklists[0].notes, "Missing GPS pin.");
  assert.equal(db.project_checklists[0].completed_by, null);
  assert.equal(db.project_checklists[0].completed_at, null);
  assert.equal(db.project_checklists[0].metadata.source, "seed");
  assert.equal(db.project_checklists[0].metadata.updated_source, "project_checklist_api");
  assert.equal(db.activity_logs[0].action, "CHECKLIST_UPDATED");
  assert.deepEqual(db.activity_logs[0].before_state, { status: "PASSED", notes: "Initial note" });
  assert.deepEqual(db.activity_logs[0].after_state, { status: "PENDING", notes: "Missing GPS pin." });
});

test("updateProjectChecklist can mark a checklist failed", async () => {
  const db = {
    project_checklists: [
      {
        id: "check-1",
        project_id: "project-1",
        project_stage_id: "stage-1",
        code: "SITE_READY",
        label: "Site is ready",
        status: "PENDING",
        metadata: {},
      },
    ],
    activity_logs: [],
  };

  const result = await updateProjectChecklist(fakeSupabase(db), "check-1", { status: "FAILED" }, "user-1");

  assert.equal(result.ok, true);
  assert.equal(result.status, "FAILED");
  assert.equal(db.project_checklists[0].status, "FAILED");
  assert.equal(db.project_checklists[0].completed_by, null);
  assert.equal(db.project_checklists[0].completed_at, null);
  assert.equal(db.activity_logs.length, 1);
  assert.equal(db.activity_logs[0].action, "CHECKLIST_UPDATED");
  assert.deepEqual(db.activity_logs[0].before_state, { status: "PENDING", notes: null });
  assert.deepEqual(db.activity_logs[0].after_state, { status: "FAILED", notes: null });
});
