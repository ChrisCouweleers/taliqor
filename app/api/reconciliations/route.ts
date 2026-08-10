import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { consumeRateLimit, requestBodyTooLarge } from "@/lib/security";

const fromDatabase = (item: Record<string, any>) => ({
  id: item.id,
  organizationId: item.organization_id,
  createdBy: item.created_by,
  name: item.name,
  leftName: item.left_name,
  rightName: item.right_name,
  matches: item.matches || [],
  periodEnd: item.period_end,
  closePeriodId: item.close_period_id,
  profileId: item.profile_id,
  method: item.method || "transaction",
  status: item.status || "draft",
  materiality: Number(item.materiality || 0),
  sourceBalance:
    item.source_balance == null ? undefined : Number(item.source_balance),
  comparisonBalance:
    item.comparison_balance == null
      ? undefined
      : Number(item.comparison_balance),
  beginningBalance:
    item.beginning_balance == null ? undefined : Number(item.beginning_balance),
  periodActivity:
    item.period_activity == null ? undefined : Number(item.period_activity),
  conclusion: item.conclusion || "",
  certification: item.certification || {},
  rules: item.rules || {},
  priorReconciliationId: item.prior_reconciliation_id,
  createdAt: item.created_at,
  updatedAt: item.updated_at,
});

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [{ data: runs, error }, { data: templates }, { data: rules }] =
    await Promise.all([
      supabase
        .from("reconciliations")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("mapping_templates").select("*"),
      supabase.from("matching_rules").select("*").order("created_at"),
    ]);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    runs: (runs || []).map(fromDatabase),
    templates: (templates || []).map((item) => ({
      id: item.id,
      organizationId: item.organization_id,
      name: item.name,
      fingerprint: item.fingerprint,
      mapping: item.mapping,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    })),
    rules: (rules || []).map((item) => ({
      id: item.id,
      name: item.name,
      settings: item.settings,
      createdAt: item.created_at,
    })),
  });
}
export async function POST(request: Request) {
  if (requestBodyTooLarge(request, 8 * 1024 * 1024))
    return NextResponse.json({ error: "The reconciliation is too large." }, { status: 413 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await consumeRateLimit(supabase, "create_reconciliation")))
    return NextResponse.json(
      { error: "Too many reconciliations were created. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();
  if (!membership)
    return NextResponse.json(
      { error: "Organization unavailable." },
      { status: 403 },
    );
  const body = await request.json();
  const name = String(body.name || "").trim();
  const leftName = String(body.leftName || "").trim();
  const rightName = String(body.rightName || "").trim();
  if (!name || name.length > 120 || !leftName || leftName.length > 160 || !rightName || rightName.length > 160)
    return NextResponse.json({ error: "Check the reconciliation and file names." }, { status: 400 });
  if (!Array.isArray(body.matches) || body.matches.length > 100_000)
    return NextResponse.json({ error: "The reconciliation contains too many rows." }, { status: 400 });
  const { data, error } = await supabase
    .from("reconciliations")
    .insert({
      organization_id: membership.organization_id,
      created_by: user.id,
      name,
      left_name: leftName,
      right_name: rightName,
      matches: body.matches,
      period_end: body.periodEnd || null,
      close_period_id: body.closePeriodId || null,
      profile_id: body.profileId || null,
      method: body.method || "transaction",
      materiality: body.materiality || 0,
      source_balance: body.sourceBalance,
      comparison_balance: body.comparisonBalance,
      rules: body.rules || {},
      prior_reconciliation_id: body.priorReconciliationId || null,
    })
    .select()
    .single();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  for (const template of body.templates || [])
    await supabase.from("mapping_templates").upsert(
      {
        organization_id: membership.organization_id,
        name: template.name,
        fingerprint: template.fingerprint,
        mapping: template.mapping,
      },
      { onConflict: "organization_id,fingerprint" },
    );
  return NextResponse.json({ run: fromDatabase(data) });
}
