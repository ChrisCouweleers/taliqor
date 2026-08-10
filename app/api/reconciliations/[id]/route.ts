import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appendAuditEvent, userDisplayName } from "@/lib/audit";
import { consumeRateLimit, isUuid, requestBodyTooLarge } from "@/lib/security";

const contentKeys = new Set(["matches", "name", "conclusion", "materiality", "sourceBalance", "comparisonBalance", "beginningBalance", "periodActivity", "rules", "dimensions"]);

function describeChanges(body: Record<string, any>, current: Record<string, any>) {
  const changes: { label: string; from?: string | number; to?: string | number }[] = [];
  const fields = [
    ["name", "Reconciliation name", "name"], ["conclusion", "Conclusion", "conclusion"],
    ["materiality", "Materiality", "materiality"], ["sourceBalance", "Source balance", "source_balance"],
    ["comparisonBalance", "Comparison balance", "comparison_balance"], ["beginningBalance", "Beginning balance", "beginning_balance"],
    ["periodActivity", "Period activity", "period_activity"], ["closePeriodId", "Connected close", "close_period_id"],
    ["profileId", "Recurring account", "profile_id"],
  ] as const;
  for (const [client, label, database] of fields) {
    if (body[client] === undefined || String(body[client] ?? "") === String(current[database] ?? "")) continue;
    const clean = (value: unknown) => typeof value === "string" ? value.slice(0, 180) : Number.isFinite(Number(value)) && value !== null && value !== "" ? Number(value) : String(value ?? "None");
    changes.push({ label, from: clean(current[database]), to: clean(body[client]) });
  }
  if (body.rules !== undefined) changes.push({ label: "Matching rules updated" });
  if (body.dimensions !== undefined) changes.push({ label: "Accounting dimensions updated" });
  if (Array.isArray(body.matches)) {
    const before = new Map((current.matches || []).map((item: Record<string, any>) => [item.id, item]));
    const changed = body.matches.filter((item: Record<string, any>) => {
      const old = before.get(item.id) as Record<string, any> | undefined;
      return old && ["status", "decision", "exceptionType", "explanation", "owner", "dueDate", "proposedAdjustment"].some((key) => String(item[key] ?? "") !== String(old[key] ?? ""));
    });
    const resolved = changed.filter((item: Record<string, any>) => item.decision === "approved").length;
    const reopened = changed.filter((item: Record<string, any>) => item.decision === "pending").length;
    if (changed.length) changes.push({ label: `${changed.length} result${changed.length === 1 ? "" : "s"} updated${resolved ? ` · ${resolved} resolved` : ""}${reopened ? ` · ${reopened} reopened` : ""}` });
  }
  const summary = changes.length === 1 ? changes[0].label : changes.length ? `${changes.length} reconciliation changes saved` : "Reconciliation details updated";
  return { summary, changes };
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (requestBodyTooLarge(request, 8 * 1024 * 1024)) return NextResponse.json({ error: "The update is too large." }, { status: 413 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await consumeRateLimit(supabase, "update_reconciliation"))) return NextResponse.json({ error: "Too many updates. Please wait before trying again." }, { status: 429, headers: { "Retry-After": "3600" } });
  const id = (await context.params).id;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid reconciliation." }, { status: 400 });
  const { data: membership } = await supabase.from("organization_members").select("organization_id").eq("user_id", user.id).single();
  if (!membership) return NextResponse.json({ error: "Workspace unavailable." }, { status: 403 });
  const { data: current } = await supabase.from("reconciliations").select("*").eq("id", id).eq("organization_id", membership.organization_id).maybeSingle();
  if (!current) return NextResponse.json({ error: "Reconciliation unavailable." }, { status: 404 });
  const body = await request.json();
  if (current.close_period_id) {
    const { data: period } = await supabase.from("close_periods").select("status").eq("id", current.close_period_id).maybeSingle();
    if (period?.status === "closed") return NextResponse.json({ error: "This reconciliation belongs to a closed period. Reopen the close before making changes." }, { status: 409 });
  }
  const requestedStatus = body.status as string | undefined;
  const reason = String(body.changeReason || "").trim().slice(0, 500);
  const contentChanged = Object.keys(body).some((key) => contentKeys.has(key));
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.matches !== undefined) {
    if (!Array.isArray(body.matches) || body.matches.length > 100_000) return NextResponse.json({ error: "The reconciliation contains too many rows." }, { status: 400 });
    update.matches = body.matches;
  }
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name || name.length > 120) return NextResponse.json({ error: "Check the reconciliation name." }, { status: 400 });
    update.name = name;
  }
  for (const [clientKey, databaseKey] of [["conclusion","conclusion"],["materiality","materiality"],["sourceBalance","source_balance"],["comparisonBalance","comparison_balance"],["beginningBalance","beginning_balance"],["periodActivity","period_activity"],["rules","rules"],["dimensions","dimensions"],["closePeriodId","close_period_id"],["profileId","profile_id"]] as const) {
    if (body[clientKey] !== undefined) update[databaseKey] = body[clientKey] === "" ? null : body[clientKey];
  }

  const actorName = userDisplayName(user);
  let action = "updated";
  const described = describeChanges(body, current);
  let summary = described.summary;

  if (requestedStatus === "review") {
    if (!String(body.conclusion ?? current.conclusion ?? "").trim()) return NextResponse.json({ error: "Add a conclusion before submitting for review." }, { status: 400 });
    update.status = "review";
    update.prepared_by_id = user.id;
    update.reviewed_by_id = null;
    update.locked_at = null;
    update.change_reason = "";
    update.certification = { ...(current.certification || {}), preparedBy: actorName, preparedById: user.id, preparedAt: new Date().toISOString(), reviewedBy: undefined, reviewedById: undefined, reviewedAt: undefined };
    action = "submitted_for_review"; summary = "Reconciliation submitted for review";
  } else if (requestedStatus === "certified") {
    if (current.status !== "review") return NextResponse.json({ error: "Submit the reconciliation for review before certifying it." }, { status: 409 });
    const openMaterial = (current.matches || []).filter((item: Record<string, any>) => item.status !== "matched" && item.decision !== "approved" && Math.abs(Number(item.left?.amount || 0)) > Number(current.materiality || 0) && (!item.exceptionType || !String(item.explanation || "").trim()));
    if (openMaterial.length) return NextResponse.json({ error: `Classify and explain ${openMaterial.length} material exception${openMaterial.length === 1 ? "" : "s"} before certification.` }, { status: 409 });
    if (current.beginning_balance != null && current.period_activity != null && current.source_balance != null && Math.abs(Number(current.beginning_balance) + Number(current.period_activity) - Number(current.source_balance)) > 0.01) return NextResponse.json({ error: "The beginning balance plus period activity must equal the source ending balance before certification." }, { status: 409 });
    if (current.profile_id) {
      const [{ data: profile }, { count: evidenceCount }] = await Promise.all([
        supabase.from("reconciliation_profiles").select("required_support").eq("id", current.profile_id).maybeSingle(),
        supabase.from("evidence_files").select("id", { count: "exact", head: true }).eq("reconciliation_id", id),
      ]);
      const required = profile?.required_support || [];
      if (required.length > (evidenceCount || 0)) return NextResponse.json({ error: `Attach the required support before certification: ${required.join(", ")}.` }, { status: 409 });
    }
    const { count } = await supabase.from("organization_members").select("user_id", { count: "exact", head: true }).eq("organization_id", membership.organization_id);
    if ((count || 0) > 1 && current.prepared_by_id === user.id) return NextResponse.json({ error: "The preparer cannot certify their own reconciliation. Ask another team member to review it." }, { status: 403 });
    update.status = "certified";
    update.reviewed_by_id = user.id;
    update.locked_at = new Date().toISOString();
    update.certification_version = Number(current.certification_version || 0) + 1;
    update.certification = { ...(current.certification || {}), reviewedBy: actorName, reviewedById: user.id, reviewedAt: new Date().toISOString(), selfReviewed: (count || 0) === 1 };
    action = "certified"; summary = (count || 0) === 1 ? "Reconciliation self-reviewed and certified in a one-person workspace" : "Reconciliation independently reviewed and certified";
  } else if (requestedStatus === "changes_requested") {
    if (!reason) return NextResponse.json({ error: "Add a reason so the preparer knows what needs to change." }, { status: 400 });
    update.status = "changes_requested";
    update.reviewed_by_id = null;
    update.locked_at = null;
    update.change_reason = reason;
    update.certification = { ...(current.certification || {}), reviewedBy: undefined, reviewedById: undefined, reviewedAt: undefined };
    action = current.status === "certified" ? "certification_reopened" : "changes_requested";
    summary = current.status === "certified" ? `Certification reopened: ${reason}` : `Changes requested: ${reason}`;
  } else if (contentChanged && ["review", "certified"].includes(current.status)) {
    update.status = "changes_requested";
    update.reviewed_by_id = null;
    update.locked_at = null;
    update.change_reason = reason || "Work changed after it was submitted for review.";
    update.certification = { ...(current.certification || {}), reviewedBy: undefined, reviewedById: undefined, reviewedAt: undefined };
    action = current.status === "certified" ? "post_certification_change" : "post_submission_change";
    summary = current.status === "certified" ? "Certified work changed and now requires recertification" : "Submitted work changed and returned to the preparer";
  } else if (requestedStatus && ["draft", "review", "changes_requested", "certified"].includes(requestedStatus)) {
    update.status = requestedStatus;
  }

  const { data, error } = await supabase.from("reconciliations").update(update).eq("id", id).eq("organization_id", membership.organization_id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  try {
    await appendAuditEvent(supabase, { organizationId: membership.organization_id, actorId: user.id, actorName, entityType: "reconciliation", entityId: id, action, summary, details: { previousStatus: current.status, status: data.status, changedFields: Object.keys(body).filter((key) => key !== "matches"), changes: described.changes } });
  } catch (auditError) {
    return NextResponse.json({ error: auditError instanceof Error ? auditError.message : "Audit history could not be recorded." }, { status: 500 });
  }
  return NextResponse.json({ run: data });
}
