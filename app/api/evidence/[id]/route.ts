import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/security";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await context.params).id;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid evidence file." }, { status: 400 });
  const { data: record } = await supabase.from("evidence_files").select("storage_path").eq("id", id).maybeSingle();
  if (!record) return NextResponse.json({ error: "Evidence file not found." }, { status: 404 });
  const { error: storageError } = await supabase.storage.from("supporting-evidence").remove([record.storage_path]);
  if (storageError) return NextResponse.json({ error: "The archived evidence could not be removed." }, { status: 400 });
  const { error } = await supabase.from("evidence_files").delete().eq("id", id);
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ deleted: true });
}
