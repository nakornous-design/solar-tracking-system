import assert from "node:assert/strict";
import test from "node:test";

import { fakeSupabase } from "./helpers/fakeSupabase.mjs";
import { attachStageEvidence, checkInProjectStage } from "../services/workflow/fieldOpsEngine.ts";

test("checkInProjectStage records field check-in metadata and audit log", async () => {
  const db = {
    project_stages: [
      {
        id: "stage-install",
        project_id: "project-1",
        code: "INSTALLATION",
        name: "Installation",
        status: "IN_PROGRESS",
        metadata: { scheduled_at: "2026-05-09T08:00:00.000Z" },
      },
    ],
    activity_logs: [],
  };

  const result = await checkInProjectStage(fakeSupabase(db), "stage-install", "user-1");

  assert.equal(result.ok, true);
  assert.equal(result.projectId, "project-1");
  assert.ok(result.checkedInAt);
  assert.equal(db.project_stages[0].metadata.scheduled_at, "2026-05-09T08:00:00.000Z");
  assert.equal(db.project_stages[0].metadata.field_check_in.source, "field_ops_api");
  assert.equal(db.project_stages[0].metadata.field_check_in.checked_in_by, "user-1");
  assert.equal(db.activity_logs.length, 1);
  assert.equal(db.activity_logs[0].action, "FIELD_CHECKED_IN");
  assert.equal(db.activity_logs[0].actor_id, "user-1");
});

test("checkInProjectStage rejects completed or cancelled stages", async () => {
  const db = {
    project_stages: [
      { id: "stage-completed", project_id: "project-1", code: "INSTALLATION", name: "Installation", status: "COMPLETED", metadata: {} },
      { id: "stage-cancelled", project_id: "project-1", code: "INSTALLATION", name: "Installation", status: "CANCELLED", metadata: {} },
    ],
    activity_logs: [],
  };

  assert.deepEqual(await checkInProjectStage(fakeSupabase(db), "stage-completed", "user-1"), {
    ok: false,
    status: 409,
    error: "Only active field stages can be checked in.",
  });
  assert.deepEqual(await checkInProjectStage(fakeSupabase(db), "stage-cancelled", "user-1"), {
    ok: false,
    status: 409,
    error: "Only active field stages can be checked in.",
  });
  assert.equal(db.activity_logs.length, 0);
});

test("attachStageEvidence appends evidence metadata and writes audit log", async () => {
  const db = {
    project_stages: [
      {
        id: "stage-install",
        project_id: "project-1",
        code: "INSTALLATION",
        name: "Installation",
        metadata: {
          evidence_files: [{ fileId: "old-file", name: "old.jpg" }],
        },
      },
    ],
    activity_logs: [],
  };

  const result = await attachStageEvidence(fakeSupabase(db), {
    projectStageId: "stage-install",
    fileId: "drive-file-1",
    name: " inverter.jpg ",
    webViewLink: "https://drive.test/file",
    folderId: "folder-1",
    mimeType: "image/jpeg",
    actorUserId: "user-1",
  });

  assert.equal(result.ok, true);
  assert.equal(result.evidenceCount, 2);
  assert.equal(db.project_stages[0].metadata.evidence_files.length, 2);
  assert.equal(db.project_stages[0].metadata.evidence_files[1].name, "inverter.jpg");
  assert.equal(db.project_stages[0].metadata.evidence_files[1].uploadedBy, "user-1");
  assert.equal(db.activity_logs.length, 1);
  assert.equal(db.activity_logs[0].action, "STAGE_EVIDENCE_UPLOADED");
  assert.deepEqual(db.activity_logs[0].before_state, { evidence_count: 1 });
  assert.deepEqual(db.activity_logs[0].after_state, { evidence_count: 2, file_id: "drive-file-1" });
});
