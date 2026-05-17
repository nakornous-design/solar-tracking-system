type SupabaseClientLike = {
  from: (table: string) => any;
};

type NotificationChannel = "IN_APP" | "EMAIL" | "LINE";
type NotificationSeverity = "INFO" | "WARNING" | "HIGH" | "CRITICAL";

type NotificationInput = {
  projectId?: string | null;
  projectStageId?: string | null;
  exceptionId?: string | null;
  approvalRequestId?: string | null;
  recipientRole?: string | null;
  recipientId?: string | null;
  channel?: NotificationChannel;
  severity?: NotificationSeverity;
  title: string;
  message?: string | null;
  actionUrl?: string | null;
  escalationLevel?: number;
  metadata?: Record<string, unknown>;
  scheduledAt?: string;
};

type NotificationResult =
  | {
      ok: true;
      notificationId: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

const ROLE_TO_USER_ROLE: Record<string, string> = {
  scheduler: "ops",
  installer: "contractor",
  installation: "contractor",
  survey: "ops",
  engineering: "engineer",
  handover: "ops",
  billing: "finance",
};

function normalizeRecipientRole(role?: string | null) {
  if (!role) return null;
  const normalized = String(role).toLowerCase();
  return ROLE_TO_USER_ROLE[normalized] || normalized;
}

export async function createNotification(
  supabase: SupabaseClientLike,
  input: NotificationInput,
): Promise<NotificationResult> {
  if (!input.title?.trim()) {
    return { ok: false, status: 400, error: "Notification title is required." };
  }

  const channel = input.channel || "IN_APP";
  const { data: notification, error: notificationError } = await supabase
    .from("notifications")
    .insert({
      project_id: input.projectId || null,
      project_stage_id: input.projectStageId || null,
      exception_id: input.exceptionId || null,
      approval_request_id: input.approvalRequestId || null,
      recipient_role: normalizeRecipientRole(input.recipientRole),
      recipient_id: input.recipientId || null,
      channel,
      status: "PENDING",
      severity: input.severity || "INFO",
      title: input.title.trim(),
      message: input.message || null,
      action_url: input.actionUrl || null,
      escalation_level: input.escalationLevel || 0,
      metadata: input.metadata || {},
      scheduled_at: input.scheduledAt || new Date().toISOString(),
    })
    .select("id")
    .single();

  if (notificationError) throw notificationError;

  const { error: deliveryError } = await supabase
    .from("notification_deliveries")
    .insert({
      notification_id: notification.id,
      channel,
      status: "PENDING",
      provider: channel === "IN_APP" ? "internal" : null,
      payload: {
        title: input.title,
        message: input.message || null,
        action_url: input.actionUrl || null,
      },
    });

  if (deliveryError) throw deliveryError;

  return {
    ok: true,
    notificationId: notification.id,
  };
}

export async function notifyStageOwner(
  supabase: SupabaseClientLike,
  params: {
    projectId: string;
    projectStageId?: string | null;
    ownerRole?: string | null;
    severity?: NotificationSeverity;
    title: string;
    message?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  return createNotification(supabase, {
    projectId: params.projectId,
    projectStageId: params.projectStageId,
    recipientRole: params.ownerRole,
    severity: params.severity || "INFO",
    title: params.title,
    message: params.message,
    metadata: {
      source: "stage_owner",
      ...(params.metadata || {}),
    },
  });
}

export async function notifyExceptionOwner(
  supabase: SupabaseClientLike,
  params: {
    projectId: string;
    projectStageId?: string | null;
    exceptionId?: string | null;
    ownerRole?: string | null;
    severity?: NotificationSeverity;
    title: string;
    message?: string | null;
    escalationLevel?: number;
    metadata?: Record<string, unknown>;
  },
) {
  return createNotification(supabase, {
    projectId: params.projectId,
    projectStageId: params.projectStageId,
    exceptionId: params.exceptionId,
    recipientRole: params.ownerRole,
    severity: params.severity || "WARNING",
    title: params.title,
    message: params.message,
    escalationLevel: params.escalationLevel || 0,
    metadata: {
      source: "exception_engine",
      ...(params.metadata || {}),
    },
  });
}

export async function markInAppNotificationSent(
  supabase: SupabaseClientLike,
  notificationId: string,
) {
  const now = new Date().toISOString();
  await Promise.all([
    supabase
      .from("notifications")
      .update({ status: "SENT", sent_at: now })
      .eq("id", notificationId)
      .eq("channel", "IN_APP"),
    supabase
      .from("notification_deliveries")
      .update({ status: "SENT", attempted_at: now, delivered_at: now })
      .eq("notification_id", notificationId)
      .eq("channel", "IN_APP"),
  ]);
}

export async function deliverNotification(
  supabase: SupabaseClientLike,
  notificationId: string,
) {
  const { data: notification, error: notificationError } = await supabase
    .from("notifications")
    .select("id, channel, status")
    .eq("id", notificationId)
    .single();

  if (notificationError || !notification) {
    return { ok: false, status: 404, error: "Notification was not found." };
  }

  if (notification.status !== "PENDING") {
    return { ok: true, notificationId, status: notification.status };
  }

  if (notification.channel === "IN_APP") {
    await markInAppNotificationSent(supabase, notificationId);
    return { ok: true, notificationId, status: "SENT" };
  }

  const now = new Date().toISOString();
  const failureReason = `${notification.channel} provider is not configured.`;

  await Promise.all([
    supabase
      .from("notifications")
      .update({ status: "FAILED", failed_at: now, failure_reason: failureReason })
      .eq("id", notificationId),
    supabase
      .from("notification_deliveries")
      .update({
        status: "FAILED",
        attempted_at: now,
        failed_at: now,
        failure_reason: failureReason,
        response: { error: failureReason },
      })
      .eq("notification_id", notificationId)
      .eq("channel", notification.channel),
  ]);

  return { ok: false, status: 501, error: failureReason };
}

export async function deliverPendingNotifications(
  supabase: SupabaseClientLike,
  now = new Date(),
  limit = 50,
) {
  const { data: pending, error } = await supabase
    .from("notifications")
    .select("id, scheduled_at, status")
    .eq("status", "PENDING")
    .order("scheduled_at", { ascending: true })
    .limit(limit);

  if (error) throw error;

  const dueNotifications = (pending || []).filter((notification: any) => {
    const scheduledAt = notification.scheduled_at ? new Date(notification.scheduled_at) : now;
    return Number.isFinite(scheduledAt.getTime()) && scheduledAt <= now;
  });

  const results = [];
  for (const notification of dueNotifications) {
    results.push(await deliverNotification(supabase, notification.id));
  }

  return {
    processed: results.length,
    results,
  };
}
