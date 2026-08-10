import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requestBodyTooLarge } from "@/lib/security";
import { validatedMatchingRule } from "@/lib/matching-rules";

export async function POST(request: Request) {
  if (requestBodyTooLarge(request, 32 * 1024))
    return NextResponse.json({ error: "The rule is too large." }, { status: 413 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();
  if (!membership)
    return NextResponse.json({ error: "Workspace unavailable." }, { status: 403 });
  const rule = validatedMatchingRule(await request.json());
  if (!rule)
    return NextResponse.json({ error: "Check the rule name and tolerance values." }, { status: 400 });
  const { data, error } = await supabase
    .from("matching_rules")
    .insert({ organization_id: membership.organization_id, ...rule })
    .select()
    .single();
  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json({
        rule: { id: data.id, name: data.name, settings: data.settings, createdAt: data.created_at },
      });
}
