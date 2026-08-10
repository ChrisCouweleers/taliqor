type AuditClient = {
  from: (table: string) => {
    insert: (value: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
  };
};

export async function appendAuditEvent(
  client: AuditClient,
  event: {
    organizationId: string;
    actorId: string;
    actorName: string;
    entityType: "reconciliation" | "close" | "adjustment" | "evidence" | "profile" | "variance";
    entityId: string;
    action: string;
    summary: string;
    details?: Record<string, unknown>;
  },
) {
  const { error } = await client.from("audit_events").insert({
    organization_id: event.organizationId,
    actor_id: event.actorId,
    actor_name: event.actorName.slice(0, 120),
    entity_type: event.entityType,
    entity_id: event.entityId,
    action: event.action.slice(0, 80),
    summary: event.summary.slice(0, 500),
    details: event.details || {},
  });
  if (error) throw new Error(`Audit history could not be recorded: ${error.message}`);
}

export function userDisplayName(user: { email?: string; user_metadata?: Record<string, unknown> }) {
  const name = String(user.user_metadata?.name || "").trim();
  return name || user.email || "Workspace member";
}
