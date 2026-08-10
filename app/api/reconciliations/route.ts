import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const fromDatabase = (item: Record<string, any>) => ({ id: item.id, organizationId: item.organization_id, createdBy: item.created_by, name: item.name, leftName: item.left_name, rightName: item.right_name, matches: item.matches || [], createdAt: item.created_at, updatedAt: item.updated_at });

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [{ data: runs, error }, { data: templates }] = await Promise.all([supabase.from("reconciliations").select("*").order("created_at", { ascending: false }), supabase.from("mapping_templates").select("*")]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ runs: (runs || []).map(fromDatabase), templates: (templates || []).map((item) => ({ id: item.id, organizationId: item.organization_id, name: item.name, fingerprint: item.fingerprint, mapping: item.mapping, createdAt: item.created_at, updatedAt: item.updated_at })) });
}
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: membership } = await supabase.from("organization_members").select("organization_id").eq("user_id", user.id).single();
  if (!membership) return NextResponse.json({ error: "Organization unavailable." }, { status: 403 });
  const body = await request.json();
  const { data, error } = await supabase.from("reconciliations").insert({ organization_id: membership.organization_id, created_by: user.id, name: body.name, left_name: body.leftName, right_name: body.rightName, matches: body.matches }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  for (const template of body.templates || []) await supabase.from("mapping_templates").upsert({ organization_id: membership.organization_id, name: template.name, fingerprint: template.fingerprint, mapping: template.mapping }, { onConflict: "organization_id,fingerprint" });
  return NextResponse.json({ run: fromDatabase(data) });
}
