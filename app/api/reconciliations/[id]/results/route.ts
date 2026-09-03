import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appendAuditEvent, userDisplayName } from "@/lib/audit";
import { isUuid, requestBodyTooLarge } from "@/lib/security";

const PAGE_SIZE = 5_000;
const WRITE_BATCH_SIZE = 1_000;
const editable = new Set(["status", "decision", "exceptionType", "explanation", "owner", "dueDate", "proposedAdjustment", "resolvedAt", "supportUrl"]);

async function contextFor(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: membership } = await supabase.from("organization_members").select("organization_id").eq("user_id", user.id).single();
  if (!membership) return { error: NextResponse.json({ error: "Workspace unavailable." }, { status: 403 }) };
  const { data: run } = await supabase.from("reconciliations").select("id,status,close_period_id,result_storage,result_count,resolved_count,open_count").eq("id", id).eq("organization_id", membership.organization_id).maybeSingle();
  if (!run) return { error: NextResponse.json({ error: "Reconciliation unavailable." }, { status: 404 }) };
  return { supabase, user, membership, run };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = (await context.params).id;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid reconciliation." }, { status: 400 });
  const auth = await contextFor(id);
  if (auth.error) return auth.error;
  const page = Math.max(0, Number(new URL(request.url).searchParams.get("page") || 0));
  const from = page * PAGE_SIZE;
  const { data, error } = await auth.supabase.from("reconciliation_results").select("result").eq("reconciliation_id", id).order("position").range(from, from + PAGE_SIZE - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ results: (data || []).map((item) => item.result), page, hasMore: (data || []).length === PAGE_SIZE });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (requestBodyTooLarge(request, 2 * 1024 * 1024)) return NextResponse.json({ error: "The result batch is too large." }, { status: 413 });
  const id = (await context.params).id;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid reconciliation." }, { status: 400 });
  const auth = await contextFor(id);
  if (auth.error) return auth.error;
  const body = await request.json();
  if (!Array.isArray(body.results) || body.results.length > WRITE_BATCH_SIZE || !Number.isInteger(body.offset) || body.offset < 0)
    return NextResponse.json({ error: "Invalid result batch." }, { status: 400 });
  const rows = body.results.map((result: Record<string, any>, index: number) => ({ organization_id: auth.membership.organization_id, reconciliation_id: id, position: body.offset + index, result_id: String(result.id || ""), result, match_status: String(result.status || "unmatched"), decision: String(result.decision || "pending"), source_amount: Number(result.left?.amount || 0), exception_type: result.exceptionType || "", explanation: result.explanation || "" }));
  if (rows.some((row: { result_id: string }) => !row.result_id)) return NextResponse.json({ error: "Every result needs an ID." }, { status: 400 });
  const { error } = await auth.supabase.from("reconciliation_results").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ saved: rows.length });
}

export async function PUT(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = (await context.params).id;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid reconciliation." }, { status: 400 });
  const auth = await contextFor(id);
  if (auth.error) return auth.error;
  const { count, error } = await auth.supabase.from("reconciliation_results").select("id", { count: "exact", head: true }).eq("reconciliation_id", id);
  if (error || count !== auth.run.result_count) return NextResponse.json({ error: `Only ${(count || 0).toLocaleString()} of ${auth.run.result_count.toLocaleString()} results were saved.` }, { status: 409 });
  const { error: updateError } = await auth.supabase.from("reconciliations").update({ import_status: "ready", matches: [], updated_at: new Date().toISOString() }).eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
  await appendAuditEvent(auth.supabase, { organizationId: auth.membership.organization_id, actorId: auth.user.id, actorName: userDisplayName(auth.user), entityType: "reconciliation", entityId: id, action: "created", summary: "Large reconciliation imported", details: { resultCount: count, storage: "rows" } });
  return NextResponse.json({ ready: true, resultCount: count });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (requestBodyTooLarge(request, 32 * 1024)) return NextResponse.json({ error: "The result update is too large." }, { status: 413 });
  const id = (await context.params).id;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid reconciliation." }, { status: 400 });
  const auth = await contextFor(id);
  if (auth.error) return auth.error;
  if (auth.run.close_period_id) {
    const { data: period } = await auth.supabase.from("close_periods").select("status").eq("id", auth.run.close_period_id).maybeSingle();
    if (period?.status === "closed") return NextResponse.json({ error: "Reopen the close before changing this result." }, { status: 409 });
  }
  const body = await request.json();
  const resultId = String(body.resultId || "");
  const patch = Object.fromEntries(Object.entries(body.patch || {}).filter(([key]) => editable.has(key)));
  const { data: row } = await auth.supabase.from("reconciliation_results").select("id,result").eq("reconciliation_id", id).eq("result_id", resultId).maybeSingle();
  if (!row) return NextResponse.json({ error: "Result unavailable." }, { status: 404 });
  const previous = row.result as Record<string, unknown>;
  const result = { ...previous, ...patch };
  const wasResolved = previous.status === "matched" || previous.decision === "approved";
  const isResolved = result.status === "matched" || result.decision === "approved";
  const { error } = await auth.supabase.from("reconciliation_results").update({ result, match_status: result.status, decision: result.decision, exception_type: result.exceptionType || "", explanation: result.explanation || "", updated_at: new Date().toISOString() }).eq("id", row.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (wasResolved !== isResolved) await auth.supabase.from("reconciliations").update({ resolved_count: auth.run.resolved_count + (isResolved ? 1 : -1), open_count: auth.run.open_count + (isResolved ? -1 : 1), updated_at: new Date().toISOString() }).eq("id", id);
  await appendAuditEvent(auth.supabase, { organizationId: auth.membership.organization_id, actorId: auth.user.id, actorName: userDisplayName(auth.user), entityType: "reconciliation", entityId: id, action: "result_updated", summary: isResolved ? "Reconciliation result resolved" : "Reconciliation result updated", details: { resultId, changedFields: Object.keys(patch) } });
  return NextResponse.json({ result });
}
