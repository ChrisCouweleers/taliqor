import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appendAuditEvent, userDisplayName } from "@/lib/audit";

const shape = (item: Record<string, any>) => ({
  id: item.id,
  name: item.name,
  accountNumber: item.account_number,
  accountType: item.account_type,
  method: item.method,
  frequency: item.frequency,
  risk: item.risk,
  materiality: Number(item.materiality || 0),
  preparer: item.preparer,
  reviewer: item.reviewer,
  preparerId: item.preparer_id,
  reviewerId: item.reviewer_id,
  dueOffset: Number(item.due_offset || 5),
  dimensions: item.dimensions || {},
  requiredSupport: item.required_support || [],
  active: item.active,
  createdAt: item.created_at,
});

async function context() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, membership: null };
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();
  return { supabase, user, membership };
}

export async function GET() {
  const { supabase, user, membership } = await context();
  if (!user || !membership)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase
    .from("reconciliation_profiles")
    .select("*")
    .eq("organization_id", membership.organization_id)
    .order("name");
  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json({ profiles: (data || []).map(shape) });
}

export async function POST(request: Request) {
  const { supabase, user, membership } = await context();
  if (!user || !membership)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const { data, error } = await supabase
    .from("reconciliation_profiles")
    .insert({
      organization_id: membership.organization_id,
      name: String(body.name || "").trim(),
      account_number: String(body.accountNumber || "").trim() || null,
      account_type: body.accountType || "other",
      method: body.method || "balance",
      frequency: body.frequency || "monthly",
      risk: body.risk || "medium",
      materiality: Number(body.materiality || 0),
      preparer: String(body.preparer || "").trim(),
      reviewer: String(body.reviewer || "").trim(),
      preparer_id: body.preparerId || null,
      reviewer_id: body.reviewerId || null,
      due_offset: Math.max(-30, Math.min(90, Number(body.dueOffset ?? 5))),
      dimensions: body.dimensions || {},
      required_support: Array.isArray(body.requiredSupport) ? body.requiredSupport.slice(0, 20) : [],
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await appendAuditEvent(supabase, { organizationId: membership.organization_id, actorId: user.id, actorName: userDisplayName(user), entityType: "profile", entityId: data.id, action: "created", summary: "Recurring reconciliation account added", details: { frequency: data.frequency, accountNumber: data.account_number } });
  return NextResponse.json({ profile: shape(data) });
}
