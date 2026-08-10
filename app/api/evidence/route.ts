import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid, requestBodyTooLarge } from "@/lib/security";
import { parseSpreadsheetBuffer } from "@/lib/spreadsheet";
import { appendAuditEvent, userDisplayName } from "@/lib/audit";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function evidenceContentType(extension: string) {
  return {
    pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    txt: "text/plain", csv: "text/csv", xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }[extension] || "application/octet-stream";
}

async function context() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, membership: null };
  const { data: membership } = await supabase.from("organization_members").select("organization_id").eq("user_id", user.id).single();
  return { supabase, user, membership };
}

export async function GET() {
  const { supabase, user, membership } = await context();
  if (!user || !membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase.from("evidence_files").select("*").eq("organization_id", membership.organization_id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const evidence = await Promise.all((data || []).map(async (item) => {
    const { data: signed } = await supabase.storage.from("supporting-evidence").createSignedUrl(item.storage_path, 3600);
    return {
      id: item.id, reconciliationId: item.reconciliation_id, adjustmentId: item.adjustment_id,
      matchId: item.match_id, fileName: item.file_name, mimeType: item.mime_type,
      sizeBytes: item.size_bytes, url: signed?.signedUrl || "", createdAt: item.created_at,
    };
  }));
  return NextResponse.json({ evidence }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (requestBodyTooLarge(request, MAX_FILE_BYTES + 1024 * 1024)) return NextResponse.json({ error: "The evidence upload is too large." }, { status: 413 });
  const { supabase, user, membership } = await context();
  if (!user || !membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  const reconciliationId = String(form.get("reconciliationId") || "");
  const adjustmentId = String(form.get("adjustmentId") || "");
  const matchId = String(form.get("matchId") || "").slice(0, 240);
  if (!(file instanceof File) || !file.size || file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "Choose an evidence file smaller than 10 MB." }, { status: 400 });
  if (reconciliationId && !isUuid(reconciliationId)) return NextResponse.json({ error: "Invalid reconciliation." }, { status: 400 });
  if (adjustmentId && !isUuid(adjustmentId)) return NextResponse.json({ error: "Invalid adjustment." }, { status: 400 });
  if (reconciliationId) {
    const { data: reconciliation } = await supabase.from("reconciliations").select("id").eq("id", reconciliationId).eq("organization_id", membership.organization_id).maybeSingle();
    if (!reconciliation) return NextResponse.json({ error: "Reconciliation unavailable." }, { status: 400 });
  }
  if (adjustmentId) {
    const { data: adjustment } = await supabase.from("journal_adjustments").select("id").eq("id", adjustmentId).eq("organization_id", membership.organization_id).maybeSingle();
    if (!adjustment) return NextResponse.json({ error: "Adjustment unavailable." }, { status: 400 });
  }
  const extension = file.name.toLowerCase().split(".").pop() || "";
  if (!["pdf", "png", "jpg", "jpeg", "txt", "csv", "xlsx", "xls"].includes(extension)) return NextResponse.json({ error: "Use PDF, image, text, CSV, XLSX, or XLS evidence files." }, { status: 400 });
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer.slice(0, 8));
  const valid = extension === "pdf" ? String.fromCharCode(...bytes.slice(0, 4)) === "%PDF"
    : extension === "png" ? [0x89,0x50,0x4e,0x47].every((v,i) => bytes[i] === v)
    : ["jpg","jpeg"].includes(extension) ? bytes[0] === 0xff && bytes[1] === 0xd8
    : true;
  if (!valid) return NextResponse.json({ error: "The evidence contents do not match the file extension." }, { status: 400 });
  if (["txt", "csv"].includes(extension)) {
    const text = new TextDecoder().decode(buffer.slice(0, 1024)).replace(/^\uFEFF/, "").trimStart().toLowerCase();
    if (text.includes("\0") || text.startsWith("<html") || text.startsWith("<!doctype html") || text.startsWith("<?xml"))
      return NextResponse.json({ error: "This file does not appear to be safe text evidence." }, { status: 400 });
  }
  if (["xlsx", "xls"].includes(extension)) {
    try { parseSpreadsheetBuffer(buffer, file.name); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid workbook." }, { status: 400 }); }
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  const path = `${membership.organization_id}/${reconciliationId || "close"}/${crypto.randomUUID()}-${safeName}`;
  const contentType = evidenceContentType(extension);
  const { error: uploadError } = await supabase.storage.from("supporting-evidence").upload(path, file, { contentType, upsert: false });
  if (uploadError) return NextResponse.json({ error: "The evidence could not be securely archived." }, { status: 400 });
  const { data, error } = await supabase.from("evidence_files").insert({
    organization_id: membership.organization_id, uploaded_by: user.id,
    reconciliation_id: reconciliationId || null, adjustment_id: adjustmentId || null,
    match_id: matchId || null, file_name: file.name, storage_path: path,
    mime_type: contentType, size_bytes: file.size,
  }).select().single();
  if (error) {
    await supabase.storage.from("supporting-evidence").remove([path]);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const { data: signed } = await supabase.storage.from("supporting-evidence").createSignedUrl(path, 3600);
  const auditEntityId = reconciliationId || adjustmentId;
  if (reconciliationId) await supabase.from("reconciliations").update({ status: "changes_requested", locked_at: null, reviewed_by_id: null, change_reason: "Supporting evidence changed after submission." }).eq("id", reconciliationId).in("status", ["review", "certified"]);
  if (auditEntityId) await appendAuditEvent(supabase, { organizationId: membership.organization_id, actorId: user.id, actorName: userDisplayName(user), entityType: "evidence", entityId: auditEntityId, action: "evidence_attached", summary: `Supporting evidence attached: ${file.name}`, details: { evidenceId: data.id, matchId: matchId || null } });
  return NextResponse.json({ evidence: {
    id: data.id, reconciliationId: data.reconciliation_id, adjustmentId: data.adjustment_id,
    matchId: data.match_id, fileName: data.file_name, mimeType: data.mime_type,
    sizeBytes: data.size_bytes, url: signed?.signedUrl || "", createdAt: data.created_at,
  }});
}
