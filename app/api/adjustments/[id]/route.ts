import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid, requestBodyTooLarge } from "@/lib/security";
import { shapeAdjustment, validateJournalLines } from "@/lib/adjustments";
import { appendAuditEvent, userDisplayName } from "@/lib/audit";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (requestBodyTooLarge(request, 128 * 1024)) return NextResponse.json({ error: "The adjustment update is too large." }, { status: 413 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await context.params).id;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid adjustment." }, { status: 400 });
  const body = await request.json();
  const { data: membership } = await supabase.from("organization_members").select("organization_id").eq("user_id", user.id).single();
  if (!membership) return NextResponse.json({ error: "Workspace unavailable." }, { status: 403 });
  const { data: currentAdjustment } = await supabase.from("journal_adjustments").select("*").eq("id", id).eq("organization_id", membership.organization_id).maybeSingle();
  if (!currentAdjustment) return NextResponse.json({ error: "Adjustment unavailable." }, { status: 404 });
  if (currentAdjustment.close_period_id) {
    const { data: period } = await supabase.from("close_periods").select("status").eq("id", currentAdjustment.close_period_id).maybeSingle();
    if (period?.status === "closed") return NextResponse.json({ error: "This adjustment belongs to a closed period. Reopen the close before changing it." }, { status: 409 });
  }
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status !== undefined) {
    if (!["draft", "review", "approved", "posted", "no_entry"].includes(body.status)) return NextResponse.json({ error: "Invalid adjustment status." }, { status: 400 });
    update.status = body.status;
  }
  if (body.lines !== undefined) {
    const lines = validateJournalLines(body.lines);
    if (!lines) return NextResponse.json({ error: "Journal debits and credits must balance." }, { status: 400 });
    update.lines = lines;
  }
  for (const [client, database, limit] of [
    ["title", "title", 160], ["description", "description", 2000], ["externalReference", "external_reference", 160],
    ["preparedBy", "prepared_by", 120], ["reviewedBy", "reviewed_by", 120],
  ] as const) if (body[client] !== undefined) update[database] = String(body[client] || "").trim().slice(0, limit);
  for (const [client, database] of [["postingDate", "posting_date"], ["reversalDate", "reversal_date"]] as const)
    if (body[client] !== undefined) update[database] = body[client] || null;
  for (const [client, database] of [["recurring", "recurring"], ["autoReverse", "auto_reverse"]] as const)
    if (body[client] !== undefined) update[database] = Boolean(body[client]);
  if (body.status === "posted") {
    const { data: current } = await supabase.from("journal_adjustments").select("external_reference").eq("id", id).maybeSingle();
    const reference = String(body.externalReference ?? current?.external_reference ?? "").trim();
    if (!reference)
      return NextResponse.json(
        { error: "Enter the accounting-system posting reference before marking this entry posted." },
        { status: 400 },
      );
  }
  if (body.status === "review") update.prepared_by_id = user.id;
  if (body.status === "approved") {
    const { count } = await supabase.from("organization_members").select("user_id", { count: "exact", head: true }).eq("organization_id", membership.organization_id);
    if ((count || 0) > 1 && currentAdjustment.prepared_by_id === user.id) return NextResponse.json({ error: "The preparer cannot approve their own adjustment." }, { status: 403 });
    update.reviewed_by_id = user.id; update.reviewed_by = userDisplayName(user);
  }
  const { data, error } = await supabase.from("journal_adjustments").update(update).eq("id", id).eq("organization_id", membership.organization_id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (data.reconciliation_id) await supabase.from("reconciliations").update({ status: "changes_requested", locked_at: null, reviewed_by_id: null, change_reason: "An adjusting journal entry changed after submission." }).eq("id", data.reconciliation_id).in("status", ["review", "certified"]);
  const statusChanged = body.status && body.status !== currentAdjustment.status;
  await appendAuditEvent(supabase, { organizationId: membership.organization_id, actorId: user.id, actorName: userDisplayName(user), entityType: "adjustment", entityId: id, action: statusChanged ? `status_${body.status}` : "updated", summary: statusChanged ? `Adjustment marked ${String(body.status).replace("_", " ")}` : "Adjustment details updated", details: { previousStatus: currentAdjustment.status, status: data.status } });
  return NextResponse.json({ adjustment: shapeAdjustment(data) });
}
