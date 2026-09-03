import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { consumeRateLimit, isUuid, requestBodyTooLarge } from "@/lib/security";
import { parseSpreadsheetBuffer } from "@/lib/spreadsheet";
import { parseCsvPreview } from "@/lib/csv";

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

  try {
    const parsed = parseCsvPreview(text);
    if (parsed.rows.length > MAX_ROWS)
      return `CSV files are limited to ${MAX_ROWS.toLocaleString()} rows.`;
    if (parsed.headers.length > MAX_COLUMNS)
      return `CSV files are limited to ${MAX_COLUMNS} columns.`;
  } catch (error) {
    return error instanceof Error ? error.message : "We couldn't read this CSV.";
  }
  return null;
}

async function validateSpreadsheet(file: File) {
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "xlsm") return "Macro-enabled .xlsm workbooks are not supported.";
  if (!extension || !["csv", "xlsx", "xls"].includes(extension))
    return "Choose CSV, XLSX, or XLS files.";
  if (!file.size) return "Spreadsheet files cannot be empty.";
  if (extension === "csv") return validateCsv(file, await file.text());
  const buffer = await file.arrayBuffer();
  const signature = new Uint8Array(buffer.slice(0, 8));
  const isXlsx =
    signature[0] === 0x50 && signature[1] === 0x4b && signature[2] === 0x03;
  const isXls = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every(
    (byte, index) => signature[index] === byte,
  );
  if ((extension === "xlsx" && !isXlsx) || (extension === "xls" && !isXls))
    return "This file's contents do not match its Excel extension.";
  try {
    parseSpreadsheetBuffer(buffer, file.name);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "We couldn't read this workbook.";
  }
}

function contentTypeFor(fileName: string) {
  const extension = fileName.toLowerCase().split(".").pop();
  if (extension === "xlsx")
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (extension === "xls") return "application/vnd.ms-excel";
  return "text/csv";
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
    const validationError = await validateSpreadsheet(file);
    if (validationError)
      return NextResponse.json({ error: validationError }, { status: 400 });
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
    const path = `${membership.organization_id}/${runId}/${crypto.randomUUID()}-${safeName}`;
    const { error } = await supabase.storage.from("reconciliation-files").upload(path, file, { contentType: contentTypeFor(file.name), upsert: false });
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
