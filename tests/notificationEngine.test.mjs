import test from "node:test";
import assert from "node:assert/strict";

import {
  createNotification,
  deliverNotification,
  deliverPendingNotifications,
  markInAppNotificationSent,
  notifyExceptionOwner,
  notifyStageOwner,
} from "../services/workflow/notificationEngine.ts";
import { fakeSupabase } from "./helpers/fakeSupabase.mjs";

test("createNotification validates title and creates delivery audit record", async () => {
  const emptyResult = await createNotification(fakeSupabase({}), { title: "   " });
  assert.deepEqual(emptyResult, { ok: false, status: 400, error: "Notification title is required." });

  const db = { notifications: [], notification_deliveries: [] };
  const result = await createNotification(fakeSupabase(db), {
    projectId: "project-1",
    projectStageId: "stage-1",
    recipientRole: "installer",
    severity: "HIGH",
    title: " Install delayed ",
    message: "Team is late",
  });

  assert.equal(result.ok, true);
  assert.equal(db.notifications[0].title, "Install delayed");
  assert.equal(db.notifications[0].recipient_role, "contractor");
  assert.equal(db.notifications[0].status, "PENDING");
  assert.equal(db.notification_deliveries[0].provider, "internal");
  assert.equal(db.notification_deliveries[0].notification_id, result.notificationId);
});

test("notify helpers stamp their source metadata", async () => {
  const db = { notifications: [], notification_deliveries: [] };

  await notifyStageOwner(fakeSupabase(db), {
    projectId: "project-1",
    projectStageId: "stage-1",
    ownerRole: "billing",
    title: "Stage needs attention",
    metadata: { event: "TEST" },
  });

  await notifyExceptionOwner(fakeSupabase(db), {
    projectId: "project-1",
    exceptionId: "exception-1",
    ownerRole: "ops",
    title: "Exception opened",
  });

  assert.equal(db.notifications[0].recipient_role, "finance");
  assert.deepEqual(db.notifications[0].metadata, { source: "stage_owner", event: "TEST" });
  assert.equal(db.notifications[1].severity, "WARNING");
  assert.deepEqual(db.notifications[1].metadata, { source: "exception_engine" });
});

test("markInAppNotificationSent only marks matching in-app notification and delivery", async () => {
  const db = {
    notifications: [
      { id: "n-1", channel: "IN_APP", status: "PENDING" },
      { id: "n-2", channel: "EMAIL", status: "PENDING" },
    ],
    notification_deliveries: [
      { id: "d-1", notification_id: "n-1", channel: "IN_APP", status: "PENDING" },
      { id: "d-2", notification_id: "n-2", channel: "EMAIL", status: "PENDING" },
    ],
  };

  await markInAppNotificationSent(fakeSupabase(db), "n-1");

  assert.equal(db.notifications[0].status, "SENT");
  assert.equal(db.notifications[1].status, "PENDING");
  assert.equal(db.notification_deliveries[0].status, "SENT");
  assert.ok(db.notification_deliveries[0].delivered_at);
  assert.equal(db.notification_deliveries[1].status, "PENDING");
});

test("deliverNotification sends in-app notifications and fails unsupported provider channels audibly", async () => {
  const db = { notifications: [], notification_deliveries: [] };
  const supabase = fakeSupabase(db);

  const inApp = await createNotification(supabase, { title: "In-app ready", channel: "IN_APP" });
  const email = await createNotification(supabase, { title: "Email ready", channel: "EMAIL" });

  const inAppResult = await deliverNotification(supabase, inApp.notificationId);
  assert.deepEqual(inAppResult, { ok: true, notificationId: inApp.notificationId, status: "SENT" });
  assert.equal(db.notifications[0].status, "SENT");
  assert.equal(db.notification_deliveries[0].status, "SENT");

  const emailResult = await deliverNotification(supabase, email.notificationId);
  assert.equal(emailResult.ok, false);
  assert.equal(emailResult.status, 501);
  assert.equal(emailResult.error, "EMAIL provider is not configured.");
  assert.equal(db.notifications[1].status, "FAILED");
  assert.equal(db.notifications[1].failure_reason, "EMAIL provider is not configured.");
  assert.equal(db.notification_deliveries[1].status, "FAILED");
  assert.equal(db.notification_deliveries[1].response.error, "EMAIL provider is not configured.");
});

test("deliverPendingNotifications processes only due pending notifications", async () => {
  const db = { notifications: [], notification_deliveries: [] };
  const supabase = fakeSupabase(db);
  const now = new Date("2026-05-09T10:00:00.000Z");

  const due = await createNotification(supabase, {
    title: "Due now",
    channel: "IN_APP",
    scheduledAt: "2026-05-09T09:59:00.000Z",
  });
  await createNotification(supabase, {
    title: "Future",
    channel: "IN_APP",
    scheduledAt: "2026-05-09T10:30:00.000Z",
  });

  const result = await deliverPendingNotifications(supabase, now);

  assert.equal(result.processed, 1);
  assert.equal(result.results[0].notificationId, due.notificationId);
  assert.equal(db.notifications[0].status, "SENT");
  assert.equal(db.notifications[1].status, "PENDING");
});
