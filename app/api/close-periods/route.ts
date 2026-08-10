import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appendAuditEvent, userDisplayName } from "@/lib/audit";

const shape = (item: Record<string, any>) => ({
  id: item.id, name: item.name, periodType: item.period_type, periodEnd: item.period_end,
  status: item.status, materiality: Number(item.materiality || 0), tasks: item.tasks || [],
  variances: item.variances || [], closedAt: item.closed_at, createdAt: item.created_at,
  closeConclusion: item.close_conclusion || "", reopenReason: item.reopen_reason || "",
  closedBy: item.closed_by, reopenedAt: item.reopened_at,
});

async function context() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, membership: null };
  const { data: membership } = await supabase.from("organization_members").select("organization_id").eq("user_id", user.id).single();
  return { supabase, user, membership };
}

export async function GET() {
  const { supabase, user } = await context();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase.from("close_periods").select("*").order("period_end", { ascending: false });
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ periods: (data || []).map(shape) });
}

export async function POST(request: Request) {
  const { supabase, user, membership } = await context();
  if (!user || !membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const { data, error } = await supabase.from("close_periods").insert({
    organization_id: membership.organization_id, created_by: user.id, name: body.name,
    period_type: body.periodType || "month", period_end: body.periodEnd,
    materiality: body.materiality || 0, tasks: body.tasks || [], variances: body.variances || [],
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const [{ data: recurringEntries }, { data: reversingEntries }, { data: existingReversals }] = await Promise.all([
    supabase.from("journal_adjustments").select("*").eq("organization_id", membership.organization_id).eq("recurring", true).eq("entry_kind", "original").order("created_at", { ascending: false }),
    supabase.from("journal_adjustments").select("*").eq("organization_id", membership.organization_id).eq("auto_reverse", true).eq("status", "posted").order("created_at", { ascending: false }),
    supabase.from("journal_adjustments").select("origin_adjustment_id").eq("organization_id", membership.organization_id).eq("entry_kind", "reversal"),
  ]);
  const sourceEntries = [...(recurringEntries || []), ...(reversingEntries || [])].filter(
    (entry, index, list) => list.findIndex((item) => item.id === entry.id) === index,
  );
  const seeded: Record<string, unknown>[] = [];
  const alreadyReversed = new Set((existingReversals || []).map((item) => item.origin_adjustment_id));
  for (const entry of sourceEntries || []) {
    const common = {
      organization_id: membership.organization_id, created_by: user.id, close_period_id: data.id,
      title: entry.title, description: entry.description, posting_date: data.period_end,
      status: "draft", prepared_by: user.user_metadata?.name || user.email || "",
      origin_adjustment_id: entry.id, recurring: false, auto_reverse: false,
    };
    if (entry.recurring && entry.entry_kind === "original") seeded.push({ ...common, lines: entry.lines, recurring: true, auto_reverse: entry.auto_reverse, entry_kind: "recurring_copy" });
    if (entry.auto_reverse && entry.status === "posted" && !alreadyReversed.has(entry.id)) seeded.push({
      ...common, title: `Reversal — ${entry.title}`, description: `Automatic reversal of ${entry.title}`,
      lines: (entry.lines || []).map((line: Record<string, unknown>) => ({ ...line, debit: Number(line.credit || 0), credit: Number(line.debit || 0) })),
      entry_kind: "reversal",
    });
  }
  if (seeded.length) await supabase.from("journal_adjustments").upsert(seeded, { onConflict: "close_period_id,origin_adjustment_id,entry_kind", ignoreDuplicates: true });
  await appendAuditEvent(supabase, { organizationId: membership.organization_id, actorId: user.id, actorName: userDisplayName(user), entityType: "close", entityId: data.id, action: "created", summary: "Close workspace created", details: { periodEnd: data.period_end, periodType: data.period_type } });
  return NextResponse.json({ period: shape(data), seededAdjustments: seeded.length });
}
