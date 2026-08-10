import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { consumeRateLimit, isUuid, requestBodyTooLarge } from "@/lib/security";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (requestBodyTooLarge(request, 8 * 1024 * 1024))
    return NextResponse.json({ error: "The update is too large." }, { status: 413 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await consumeRateLimit(supabase, "update_reconciliation")))
    return NextResponse.json(
      { error: "Too many updates. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  const id = (await context.params).id;
  if (!isUuid(id))
    return NextResponse.json({ error: "Invalid reconciliation." }, { status: 400 });
  const body = await request.json();
  const update: Record<string, unknown> = {};
  if (body.matches !== undefined) {
    if (!Array.isArray(body.matches) || body.matches.length > 100_000)
      return NextResponse.json({ error: "The reconciliation contains too many rows." }, { status: 400 });
    update.matches = body.matches;
  }
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name || name.length > 120)
      return NextResponse.json({ error: "Check the reconciliation name." }, { status: 400 });
    update.name = name;
  }
  for (const [clientKey, databaseKey] of [
    ["status", "status"],
    ["conclusion", "conclusion"],
    ["certification", "certification"],
    ["materiality", "materiality"],
    ["sourceBalance", "source_balance"],
    ["comparisonBalance", "comparison_balance"],
    ["rules", "rules"],
    ["closePeriodId", "close_period_id"],
    ["profileId", "profile_id"],
  ] as const)
    if (body[clientKey] !== undefined)
      update[databaseKey] = body[clientKey] || null;
  const { data, error } = await supabase
    .from("reconciliations")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json({ run: data });
}
