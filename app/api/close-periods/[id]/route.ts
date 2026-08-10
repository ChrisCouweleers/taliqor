import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appendAuditEvent, userDisplayName } from "@/lib/audit";
import { isUuid, requestBodyTooLarge } from "@/lib/security";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (requestBodyTooLarge(request, 2 * 1024 * 1024)) return NextResponse.json({ error: "The close update is too large." }, { status: 413 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await context.params).id;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid close period." }, { status: 400 });
  const { data: membership } = await supabase.from("organization_members").select("organization_id").eq("user_id", user.id).single();
  if (!membership) return NextResponse.json({ error: "Workspace unavailable." }, { status: 403 });
  const { data: current } = await supabase.from("close_periods").select("*").eq("id", id).eq("organization_id", membership.organization_id).maybeSingle();
  if (!current) return NextResponse.json({ error: "Close period unavailable." }, { status: 404 });
  const body = await request.json();
  if (current.status === "closed" && body.status !== "open") return NextResponse.json({ error: "This period is locked. Reopen it with a reason before changing close work." }, { status: 409 });
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.tasks !== undefined) {
    if (!Array.isArray(body.tasks) || body.tasks.length > 250) return NextResponse.json({ error: "The close has too many checklist items." }, { status: 400 });
    update.tasks = body.tasks;
  }
  if (body.variances !== undefined) {
    if (!Array.isArray(body.variances) || body.variances.length > 10_000) return NextResponse.json({ error: "The variance review has too many rows." }, { status: 400 });
    update.variances = body.variances;
  }
  if (body.materiality !== undefined) update.materiality = Math.max(0, Number(body.materiality || 0));
  if (body.closeConclusion !== undefined) update.close_conclusion = String(body.closeConclusion || "").trim().slice(0, 4000);

  const actorName = userDisplayName(user);
  let action = body.variances ? "variance_review_updated" : body.tasks ? "checklist_updated" : "updated";
  let summary = body.variances ? "Variance review updated" : body.tasks ? "Close checklist updated" : "Close details updated";
  if (body.status === "closed") {
    const conclusion = String(body.closeConclusion ?? current.close_conclusion ?? "").trim();
    const tasks = body.tasks || current.tasks || [];
    const variances = body.variances || current.variances || [];
    const [{ data: runs }, { data: adjustments }] = await Promise.all([
      supabase.from("reconciliations").select("id,status").eq("close_period_id", id),
      supabase.from("journal_adjustments").select("status,lines").eq("close_period_id", id),
    ]);
    const blockers: string[] = [];
    if (!tasks.length || tasks.some((task: Record<string, unknown>) => task.status !== "done")) blockers.push("complete every checklist item");
    if (!runs?.length) blockers.push("connect at least one reconciliation");
    else if (runs.some((run) => run.status !== "certified")) blockers.push("certify every connected reconciliation");
    if (variances.some((item: Record<string, unknown>) => (Math.abs(Number(item.difference || 0)) > Number(current.materiality || 0) || Math.abs(Number(item.percent || 0)) > Number(item.percentageThreshold ?? 10)) && item.status !== "reviewed")) blockers.push("review every material variance");
    if ((adjustments || []).some((item) => !["posted", "no_entry"].includes(item.status) && (item.lines || []).reduce((sum: number, line: Record<string, unknown>) => sum + Number(line.debit || 0), 0) > Number(current.materiality || 0))) blockers.push("post or clear every material adjustment");
    if (!conclusion) blockers.push("add a close conclusion");
    if (blockers.length) return NextResponse.json({ error: `Before closing, ${blockers.join(", ")}.`, blockers }, { status: 409 });
    update.status = "closed"; update.closed_at = new Date().toISOString(); update.closed_by = user.id; update.close_conclusion = conclusion; update.reopen_reason = "";
    action = "closed"; summary = "Close period approved and closed";
  } else if (body.status === "open" && current.status === "closed") {
    const reason = String(body.reopenReason || "").trim().slice(0, 500);
    if (!reason) return NextResponse.json({ error: "Explain why this closed period must be reopened." }, { status: 400 });
    update.status = "open"; update.closed_at = null; update.reopened_by = user.id; update.reopened_at = new Date().toISOString(); update.reopen_reason = reason;
    action = "reopened"; summary = `Close period reopened: ${reason}`;
  }
  const { data, error } = await supabase.from("close_periods").update(update).eq("id", id).eq("organization_id", membership.organization_id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  try { await appendAuditEvent(supabase, { organizationId: membership.organization_id, actorId: user.id, actorName, entityType: "close", entityId: id, action, summary, details: { previousStatus: current.status, status: data.status } }); }
  catch (auditError) { return NextResponse.json({ error: auditError instanceof Error ? auditError.message : "Audit history could not be recorded." }, { status: 500 }); }
  return NextResponse.json({ period: data });
}
