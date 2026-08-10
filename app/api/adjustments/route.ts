import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requestBodyTooLarge } from "@/lib/security";
import { shapeAdjustment, validateJournalLines } from "@/lib/adjustments";
import { appendAuditEvent, userDisplayName } from "@/lib/audit";

async function context() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, membership: null };
  const { data: membership } = await supabase.from("organization_members").select("organization_id").eq("user_id", user.id).single();
  return { supabase, user, membership };
}

export async function GET() {
  const { supabase, user, membership } = await context();
  if (!user || !membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase.from("journal_adjustments").select("*").eq("organization_id", membership.organization_id).order("created_at", { ascending: false });
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ adjustments: (data || []).map(shapeAdjustment) });
}

export async function POST(request: Request) {
  if (requestBodyTooLarge(request, 128 * 1024)) return NextResponse.json({ error: "The adjustment is too large." }, { status: 413 });
  const { supabase, user, membership } = await context();
  if (!user || !membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const title = String(body.title || "").trim();
  const lines = validateJournalLines(body.lines);
  if (!title || title.length > 160 || !lines) return NextResponse.json({ error: "Enter a title and balanced debit and credit lines." }, { status: 400 });
  if (body.reconciliationId) {
    const { data: reconciliation } = await supabase.from("reconciliations").select("id").eq("id", body.reconciliationId).eq("organization_id", membership.organization_id).maybeSingle();
    if (!reconciliation) return NextResponse.json({ error: "Reconciliation unavailable." }, { status: 400 });
  }
  if (body.closePeriodId) {
    const { data: period } = await supabase.from("close_periods").select("id,status").eq("id", body.closePeriodId).eq("organization_id", membership.organization_id).maybeSingle();
    if (!period) return NextResponse.json({ error: "Close period unavailable." }, { status: 400 });
    if (period.status === "closed") return NextResponse.json({ error: "Reopen the close before adding an adjustment." }, { status: 409 });
  }
  const { data, error } = await supabase.from("journal_adjustments").insert({
    organization_id: membership.organization_id,
    created_by: user.id,
    reconciliation_id: body.reconciliationId || null,
    close_period_id: body.closePeriodId || null,
    match_id: String(body.matchId || "") || null,
    title,
    description: String(body.description || "").trim().slice(0, 2000),
    posting_date: body.postingDate || null,
    lines,
    recurring: Boolean(body.recurring),
    auto_reverse: Boolean(body.autoReverse),
    reversal_date: body.reversalDate || null,
    prepared_by: userDisplayName(user),
    prepared_by_id: user.id,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (data.reconciliation_id) await supabase.from("reconciliations").update({ status: "changes_requested", locked_at: null, reviewed_by_id: null, change_reason: "An adjusting journal entry changed after submission." }).eq("id", data.reconciliation_id).in("status", ["review", "certified"]);
  await appendAuditEvent(supabase, { organizationId: membership.organization_id, actorId: user.id, actorName: userDisplayName(user), entityType: "adjustment", entityId: data.id, action: "created", summary: "Adjusting journal entry prepared", details: { reconciliationId: data.reconciliation_id, closePeriodId: data.close_period_id } });
  return NextResponse.json({ adjustment: shapeAdjustment(data) });
}
