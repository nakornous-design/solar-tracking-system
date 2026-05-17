import test from "node:test";
import assert from "node:assert/strict";

import {
  canRejectDocument,
  canUploadDocument,
  canVerifyDocument,
  documentGovernanceTone,
  isGatePassed,
  sortProjectDocuments,
  transitionSlaTone,
} from "../lib/project-ui.ts";

test("document upload and verification rules follow gate lifecycle", () => {
  assert.equal(canUploadDocument({ status: "REQUIRED" }), true);
  assert.equal(canUploadDocument({ status: "REJECTED" }), false);
  assert.equal(canUploadDocument({ status: "VERIFIED" }), false);

  assert.equal(canVerifyDocument({ status: "UPLOADED" }), true);
  assert.equal(canVerifyDocument({ status: "PENDING_VERIFY" }), true);
  assert.equal(canVerifyDocument({ status: "REQUIRED" }), false);

  assert.equal(canRejectDocument({ status: "VERIFIED" }), true);
  assert.equal(canRejectDocument({ status: "REQUIRED" }), false);
});

test("hard required document that is still uploadable is surfaced as risk", () => {
  assert.equal(documentGovernanceTone({ status: "REQUIRED", gate_severity: "HARD" }), "risk");
  assert.equal(documentGovernanceTone({ status: "PENDING_VERIFY", gate_severity: "HARD" }), "risk");
  assert.equal(documentGovernanceTone({ status: "VERIFIED", gate_severity: "HARD" }), "good");
});

test("documents sort by code/name and newest version first", () => {
  const sorted = sortProjectDocuments([
    { code: "B", name: "Invoice", version_number: 1 },
    { code: "A", name: "PAC", version_number: 1 },
    { code: "A", name: "PAC", version_number: 3 },
  ]);

  assert.deepEqual(sorted.map((item) => `${item.code}:${item.version_number}`), ["A:3", "A:1", "B:1"]);
});

test("gate pass and transition SLA tone rules are stable", () => {
  assert.equal(isGatePassed({ status: "PASSED" }), true);
  assert.equal(isGatePassed({ status: "VERIFIED" }), true);
  assert.equal(isGatePassed({ status: "WAIVED" }), true);
  assert.equal(isGatePassed({ status: "REQUIRED" }), false);

  assert.equal(
    transitionSlaTone(
      {
        actual_completed_at: "2026-05-01T10:00:00.000Z",
        workflow_definitions: { sla_hours: 8 },
      },
      { actual_completed_at: "2026-05-01T00:00:00.000Z" },
    ),
    "over",
  );
  assert.equal(
    transitionSlaTone(
      {
        actual_completed_at: "2026-05-01T07:00:00.000Z",
        workflow_definitions: { sla_hours: 8 },
      },
      { actual_completed_at: "2026-05-01T00:00:00.000Z" },
    ),
    "near",
  );
});
