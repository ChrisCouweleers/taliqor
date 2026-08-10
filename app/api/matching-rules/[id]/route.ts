import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid, requestBodyTooLarge } from "@/lib/security";
import { validatedMatchingRule } from "@/lib/matching-rules";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (requestBodyTooLarge(request, 32 * 1024))
    return NextResponse.json({ error: "The rule update is too large." }, { status: 413 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await context.params).id;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid rule." }, { status: 400 });
  const rule = validatedMatchingRule(await request.json());
  if (!rule)
    return NextResponse.json({ error: "Check the matching rule." }, { status: 400 });
  const { data, error } = await supabase
    .from("matching_rules")
    .update({ ...rule, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json({
        rule: { id: data.id, name: data.name, settings: data.settings, createdAt: data.created_at },
      });
}
