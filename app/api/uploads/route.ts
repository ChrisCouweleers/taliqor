import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { consumeRateLimit, isUuid, requestBodyTooLarge } from "@/lib/security";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_FILE_BYTES * 2 + 1024 * 1024;
const MAX_ROWS = 100_000;
const MAX_COLUMNS = 250;

function validateCsv(file: File, text: string) {
  if (!file.name.toLowerCase().endsWith(".csv"))
    return "Choose files with a .csv extension.";
  if (!file.size) return "CSV files cannot be empty.";
  if (text.includes("\0")) return "This file does not appear to be a valid text CSV.";

  const normalizedStart = text.slice(0, 512).replace(/^\uFEFF/, "").trimStart().toLowerCase();
  if (
    normalizedStart.startsWith("<html") ||
    normalizedStart.startsWith("<!doctype html") ||
    normalizedStart.startsWith("<?xml") ||
    normalizedStart.startsWith("mz") ||
    normalizedStart.startsWith("pk\u0003\u0004")
  )
    return "This file's contents do not match a CSV file.";

  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return "Each CSV needs a header and at least one data row.";
  if (lines.length > MAX_ROWS + 1)
    return `CSV files are limited to ${MAX_ROWS.toLocaleString()} rows.`;
  const delimiterCounts = [",", ";", "\t", "|"].map((delimiter) => ({
    delimiter,
    count: (lines[0].match(new RegExp(delimiter === "|" ? "\\|" : delimiter, "g")) || []).length,
  }));
  const columns = Math.max(...delimiterCounts.map(({ count }) => count + 1));
  if (columns < 2) return "We couldn't detect multiple columns in this CSV.";
  if (columns > MAX_COLUMNS) return `CSV files are limited to ${MAX_COLUMNS} columns.`;
  return null;
}

export async function POST(request: Request) {
  if (requestBodyTooLarge(request, MAX_REQUEST_BYTES))
    return NextResponse.json({ error: "The upload is too large." }, { status: 413 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await consumeRateLimit(supabase, "upload")))
    return NextResponse.json(
      { error: "Too many uploads. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  const { data: membership } = await supabase.from("organization_members").select("organization_id").eq("user_id", user.id).single();
  const form = await request.formData();
  const runId = String(form.get("runId") || "");
  const files = form.getAll("files").filter((item): item is File => item instanceof File);
  if (!membership || files.length !== 2) return NextResponse.json({ error: "Two files are required." }, { status: 400 });
  if (!isUuid(runId))
    return NextResponse.json({ error: "Invalid reconciliation." }, { status: 400 });
  const { data: reconciliation } = await supabase
    .from("reconciliations")
    .select("id")
    .eq("id", runId)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  if (!reconciliation)
    return NextResponse.json({ error: "Reconciliation not found." }, { status: 404 });

  const paths: string[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "Each file must be smaller than 15 MB." }, { status: 413 });
    const text = await file.text();
    const validationError = validateCsv(file, text);
    if (validationError)
      return NextResponse.json({ error: validationError }, { status: 400 });
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
    const path = `${membership.organization_id}/${runId}/${crypto.randomUUID()}-${safeName}`;
    const { error } = await supabase.storage.from("reconciliation-files").upload(path, file, { contentType: "text/csv", upsert: false });
    if (error) {
      if (paths.length) await supabase.storage.from("reconciliation-files").remove(paths);
      return NextResponse.json({ error: "The files could not be securely archived." }, { status: 400 });
    }
    paths.push(path);
  }
  return NextResponse.json(
    { paths },
    { headers: { "Cache-Control": "no-store" } },
  );
}
