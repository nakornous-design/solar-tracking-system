type SupabaseClientLike = {
  from: (table: string) => any;
};

type AuditLogInput = {
  actorId?: string | null;
  action: string;
  reason?: string | null;
  evidence?: unknown[];
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function writeAuditLog(supabase: SupabaseClientLike, input: AuditLogInput) {
  const { error } = await supabase.from("activity_logs").insert({
    project_id: null,
    project_stage_id: null,
    actor_id: input.actorId || null,
    action: input.action,
    reason: input.reason || null,
    evidence: input.evidence || [],
    before_state: input.beforeState || null,
    after_state: input.afterState || null,
    related_entity_type: input.relatedEntityType || null,
    related_entity_id: input.relatedEntityId || null,
    metadata: input.metadata || {},
  });

  if (error) throw error;
}
