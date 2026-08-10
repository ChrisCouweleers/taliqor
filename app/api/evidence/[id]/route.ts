import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/security";
import { appendAuditEvent, userDisplayName } from "@/lib/audit";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await context.params).id;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid evidence file." }, { status: 400 });
  const { data: membership } = await supabase.from("organization_members").select("organization_id").eq("user_id", user.id).single();
  if (!membership) return NextResponse.json({ error: "Workspace unavailable." }, { status: 403 });
  const { data: record } = await supabase.from("evidence_files").select("storage_path,file_name,reconciliation_id,adjustment_id").eq("id", id).eq("organization_id", membership.organization_id).maybeSingle();
  if (!record) return NextResponse.json({ error: "Evidence file not found." }, { status: 404 });
  const { error: storageError } = await supabase.storage.from("supporting-evidence").remove([record.storage_path]);
  if (storageError) return NextResponse.json({ error: "The archived evidence could not be removed." }, { status: 400 });
  const { error } = await supabase.from("evidence_files").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const auditEntityId = record.reconciliation_id || record.adjustment_id;
  if (record.reconciliation_id) await supabase.from("reconciliations").update({ status: "changes_requested", locked_at: null, reviewed_by_id: null, change_reason: "Supporting evidence changed after submission." }).eq("id", record.reconciliation_id).in("status", ["review", "certified"]);
  if (auditEntityId) await appendAuditEvent(supabase, { organizationId: membership.organization_id, actorId: user.id, actorName: userDisplayName(user), entityType: "evidence", entityId: auditEntityId, action: "evidence_removed", summary: `Supporting evidence removed: ${record.file_name}`, details: { evidenceId: id } });
  return NextResponse.json({ deleted: true });
}
