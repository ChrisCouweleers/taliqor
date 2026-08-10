import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requestBodyTooLarge } from "@/lib/security";
import { shapeAdjustment, validateJournalLines } from "@/lib/adjustments";

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
    const { data: period } = await supabase.from("close_periods").select("id").eq("id", body.closePeriodId).eq("organization_id", membership.organization_id).maybeSingle();
    if (!period) return NextResponse.json({ error: "Close period unavailable." }, { status: 400 });
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
    prepared_by: String(body.preparedBy || "").trim().slice(0, 120),
  }).select().single();
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ adjustment: shapeAdjustment(data) });
}
