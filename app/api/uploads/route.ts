import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: membership } = await supabase.from("organization_members").select("organization_id").eq("user_id", user.id).single();
  const form = await request.formData();
  const runId = String(form.get("runId") || crypto.randomUUID());
  const files = form.getAll("files").filter((item): item is File => item instanceof File);
  if (!membership || files.length !== 2) return NextResponse.json({ error: "Two files are required." }, { status: 400 });
  const paths: string[] = [];
  for (const file of files) {
    if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "Each file must be smaller than 15 MB." }, { status: 400 });
    const path = `${membership.organization_id}/${runId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error } = await supabase.storage.from("reconciliation-files").upload(path, file, { contentType: file.type || "text/csv" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    paths.push(path);
  }
  return NextResponse.json({ paths });
}
