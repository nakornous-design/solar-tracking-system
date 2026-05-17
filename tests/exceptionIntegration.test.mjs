import test from "node:test";
import assert from "node:assert/strict";

import { transitionExceptionStatus } from "../services/workflow/exceptionEngine.ts";
import { fakeSupabase } from "./helpers/fakeSupabase.mjs";

function exceptionDb() {
  return {
    project_exceptions: [
      {
        id: "exception-1",
        project_id: "project-1",
        project_stage_id: "stage-1",
        status: "OPEN",
        title: "Missing survey photo",
        owner_role: "ops",
        severity: "HIGH",
      },
    ],
    activity_logs: [],
    notifications: [],
    notification_deliveries: [],
  };
}

test("transitionExceptionStatus acknowledges exceptions with audit log and notification", async () => {
  const db = exceptionDb();

  const result = await transitionExceptionStatus(fakeSupabase(db), "exception-1", "ACKNOWLEDGED");

  assert.equal(result.ok, true);
  assert.equal(result.status, "ACKNOWLEDGED");
  assert.equal(db.project_exceptions[0].status, "ACKNOWLEDGED");
  assert.ok(db.project_exceptions[0].acknowledged_at);
  assert.equal(db.activity_logs[0].action, "EXCEPTION_STATUS_CHANGED");
  assert.deepEqual(db.activity_logs[0].before_state, { exception_id: "exception-1", status: "OPEN" });
  assert.deepEqual(db.activity_logs[0].after_state, { exception_id: "exception-1", status: "ACKNOWLEDGED" });
  assert.equal(db.notifications[0].title, "Exception acknowledged: Missing survey photo");
  assert.equal(db.notifications[0].exception_id, "exception-1");
  assert.equal(db.notification_deliveries[0].notification_id, db.notifications[0].id);
});

test("transitionExceptionStatus supports WAIVED lifecycle status with resolution notes", async () => {
  const db = exceptionDb();

  const result = await transitionExceptionStatus(fakeSupabase(db), "exception-1", "WAIVED", "Approved by operations manager.");

  assert.equal(result.ok, true);
  assert.equal(result.status, "WAIVED");
  assert.equal(db.project_exceptions[0].status, "WAIVED");
  assert.ok(db.project_exceptions[0].waived_at);
  assert.equal(db.project_exceptions[0].resolution_notes, "Approved by operations manager.");
  assert.equal(db.activity_logs[0].after_state.status, "WAIVED");
  assert.equal(db.notifications[0].metadata.next_status, "WAIVED");
});

test("transitionExceptionStatus rejects unsupported status and missing exception", async () => {
  const db = exceptionDb();

  const unsupported = await transitionExceptionStatus(fakeSupabase(db), "exception-1", "OPEN");
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.status, 400);

  const missing = await transitionExceptionStatus(fakeSupabase(db), "missing", "RESOLVED");
  assert.equal(missing.ok, false);
  assert.equal(missing.status, 404);
});
