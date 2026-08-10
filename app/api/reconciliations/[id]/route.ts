import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const update: Record<string, unknown> = {};
  if (body.matches) update.matches = body.matches;
  if (body.name) update.name = body.name;
  for (const [clientKey, databaseKey] of [
    ["status", "status"],
    ["conclusion", "conclusion"],
    ["certification", "certification"],
    ["materiality", "materiality"],
    ["sourceBalance", "source_balance"],
    ["comparisonBalance", "comparison_balance"],
    ["rules", "rules"],
    ["closePeriodId", "close_period_id"],
  ] as const)
    if (body[clientKey] !== undefined)
      update[databaseKey] = body[clientKey] || null;
  const { data, error } = await supabase
    .from("reconciliations")
    .update(update)
    .eq("id", (await context.params).id)
    .select()
    .single();
  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json({ run: data });
}
