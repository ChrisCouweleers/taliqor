import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    })
    .select()
    .single();
  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json({ profile: shape(data) });
}
