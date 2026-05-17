import test from "node:test";
import assert from "node:assert/strict";

import { createProjectDocumentVersion, rejectProjectDocument, verifyProjectDocument } from "../services/documents/documentEngine.ts";
import { fakeSupabase } from "./helpers/fakeSupabase.mjs";

function baseDocument(overrides = {}) {
  return {
    id: "doc-1",
    project_id: "project-1",
    project_stage_id: "stage-1",
    workflow_required_document_id: "workflow-doc-1",
    code: "PAC",
    name: "PAC",
    is_required: true,
    requires_verification: true,
    gate_severity: "HARD",
    status: "UPLOADED",
    version_number: 1,
    google_drive_folder_id: "folder-1",
    metadata: { source: "test" },
    ...overrides,
  };
}

test("rejectProjectDocument requires reason and blocks superseded documents", async () => {
  assert.deepEqual(await rejectProjectDocument(fakeSupabase({}), "doc-1", " "), {
    ok: false,
    status: 400,
    error: "Rejection reason is required.",
  });

  const db = { project_documents: [baseDocument({ status: "SUPERSEDED" })], activity_logs: [] };
  assert.deepEqual(await rejectProjectDocument(fakeSupabase(db), "doc-1", "bad file"), {
    ok: false,
    status: 400,
    error: "Superseded documents cannot be rejected.",
  });
});

test("rejectProjectDocument marks document rejected and writes audit log", async () => {
  const db = { project_documents: [baseDocument()], activity_logs: [] };

  const result = await rejectProjectDocument(fakeSupabase(db), "doc-1", " missing signature ", "user-1");

  assert.deepEqual(result, {
    ok: true,
    documentId: "doc-1",
    status: "REJECTED",
    versionNumber: 1,
    supersedesDocumentId: null,
  });
  assert.equal(db.project_documents[0].status, "REJECTED");
  assert.equal(db.project_documents[0].rejection_reason, "missing signature");
  assert.equal(db.activity_logs[0].action, "DOCUMENT_REJECTED");
  assert.equal(db.activity_logs[0].actor_id, "user-1");
});

test("createProjectDocumentVersion creates next required version and supersedes old document", async () => {
  const db = { project_documents: [baseDocument({ status: "REJECTED" })], activity_logs: [] };

  const result = await createProjectDocumentVersion(fakeSupabase(db), "doc-1", "user-1");

  assert.equal(result.ok, true);
  assert.equal(result.status, "REQUIRED");
  assert.equal(result.versionNumber, 2);
  assert.equal(result.supersedesDocumentId, "doc-1");
  assert.equal(db.project_documents.find((item) => item.id === "doc-1").status, "SUPERSEDED");
  assert.equal(db.project_documents.find((item) => item.id !== "doc-1").metadata.source, "test");
  assert.equal(db.activity_logs[0].action, "DOCUMENT_VERSION_CREATED");
  assert.equal(db.activity_logs[0].actor_id, "user-1");
});

test("createProjectDocumentVersion reuses existing next version idempotently", async () => {
  const db = {
    project_documents: [
      baseDocument({ status: "REJECTED" }),
      baseDocument({ id: "doc-2", status: "REQUIRED", version_number: 2, supersedes_document_id: "doc-1" }),
    ],
    activity_logs: [],
  };

  const result = await createProjectDocumentVersion(fakeSupabase(db), "doc-1");

  assert.deepEqual(result, {
    ok: true,
    documentId: "doc-2",
    status: "REQUIRED",
    versionNumber: 2,
    supersedesDocumentId: "doc-1",
  });
  assert.equal(db.project_documents.length, 2);
  assert.equal(db.project_documents[0].status, "SUPERSEDED");
});

test("verifyProjectDocument marks uploaded documents verified and writes audit log", async () => {
  const db = {
    project_documents: [
      {
        id: "doc-1",
        project_id: "project-1",
        project_stage_id: "stage-1",
        code: "PAC",
        name: "PAC",
        status: "UPLOADED",
        version_number: 1,
      },
    ],
    activity_logs: [],
  };

  const result = await verifyProjectDocument(fakeSupabase(db), "doc-1", "user-1");

  assert.equal(result.ok, true);
  assert.equal(result.status, "VERIFIED");
  assert.equal(db.project_documents[0].status, "VERIFIED");
  assert.equal(db.project_documents[0].verified_by, "user-1");
  assert.ok(db.project_documents[0].verified_at);
  assert.equal(db.activity_logs.length, 1);
  assert.equal(db.activity_logs[0].action, "DOCUMENT_VERIFIED");
  assert.equal(db.activity_logs[0].actor_id, "user-1");
  assert.deepEqual(db.activity_logs[0].before_state, { document_id: "doc-1", status: "UPLOADED" });
  assert.deepEqual(db.activity_logs[0].after_state, { document_id: "doc-1", status: "VERIFIED" });
});

test("verifyProjectDocument blocks rejected and superseded document versions", async () => {
  const db = {
    project_documents: [
      { id: "doc-rejected", project_id: "project-1", project_stage_id: "stage-1", code: "PAC", name: "PAC", status: "REJECTED", version_number: 1 },
      { id: "doc-super", project_id: "project-1", project_stage_id: "stage-1", code: "PAC", name: "PAC", status: "SUPERSEDED", version_number: 1 },
    ],
  };

  assert.deepEqual(await verifyProjectDocument(fakeSupabase(db), "doc-rejected", "user-1"), {
    ok: false,
    status: 400,
    error: "Rejected documents require a new version before verification.",
  });
  assert.deepEqual(await verifyProjectDocument(fakeSupabase(db), "doc-super", "user-1"), {
    ok: false,
    status: 400,
    error: "Superseded documents cannot be verified.",
  });
});
