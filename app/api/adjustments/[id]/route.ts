import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid, requestBodyTooLarge } from "@/lib/security";
import { shapeAdjustment, validateJournalLines } from "@/lib/adjustments";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (requestBodyTooLarge(request, 128 * 1024)) return NextResponse.json({ error: "The adjustment update is too large." }, { status: 413 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await context.params).id;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid adjustment." }, { status: 400 });
  const body = await request.json();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status !== undefined) {
    if (!["draft", "review", "approved", "posted", "no_entry"].includes(body.status)) return NextResponse.json({ error: "Invalid adjustment status." }, { status: 400 });
    update.status = body.status;
  }
  if (body.lines !== undefined) {
    const lines = validateJournalLines(body.lines);
    if (!lines) return NextResponse.json({ error: "Journal debits and credits must balance." }, { status: 400 });
    update.lines = lines;
  }
  for (const [client, database, limit] of [
    ["title", "title", 160], ["description", "description", 2000], ["externalReference", "external_reference", 160],
    ["preparedBy", "prepared_by", 120], ["reviewedBy", "reviewed_by", 120],
  ] as const) if (body[client] !== undefined) update[database] = String(body[client] || "").trim().slice(0, limit);
  for (const [client, database] of [["postingDate", "posting_date"], ["reversalDate", "reversal_date"]] as const)
    if (body[client] !== undefined) update[database] = body[client] || null;
  for (const [client, database] of [["recurring", "recurring"], ["autoReverse", "auto_reverse"]] as const)
    if (body[client] !== undefined) update[database] = Boolean(body[client]);
  if (body.status === "posted") {
    const { data: current } = await supabase.from("journal_adjustments").select("external_reference").eq("id", id).maybeSingle();
    const reference = String(body.externalReference ?? current?.external_reference ?? "").trim();
    if (!reference)
      return NextResponse.json(
        { error: "Enter the accounting-system posting reference before marking this entry posted." },
        { status: 400 },
      );
  }
  const { data, error } = await supabase.from("journal_adjustments").update(update).eq("id", id).select().single();
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ adjustment: shapeAdjustment(data) });
}
