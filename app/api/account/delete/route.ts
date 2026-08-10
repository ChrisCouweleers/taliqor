import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requestBodyTooLarge } from "@/lib/security";

const buckets = ["reconciliation-files", "supporting-evidence"];

async function listFiles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bucket: string,
  folder: string,
): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(folder, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    if (!data?.length) break;
    for (const item of data) {
      const path = `${folder}/${item.name}`;
      if (item.id) paths.push(path);
      else paths.push(...(await listFiles(supabase, bucket, path)));
    }
    if (data.length < 1000) break;
  }
  return paths;
}

export async function POST(request: Request) {
  if (requestBodyTooLarge(request, 16 * 1024))
    return NextResponse.json({ error: "The request is too large." }, { status: 413 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const email = String(body.email || "").trim();
  if (body.confirmation !== "DELETE" || email.toLowerCase() !== user.email.toLowerCase())
    return NextResponse.json(
      { error: "Enter your account email and DELETE to confirm." },
      { status: 400 },
    );

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership) {
    const { count } = await supabase
      .from("organization_members")
      .select("user_id", { count: "exact", head: true })
      .eq("organization_id", membership.organization_id);
    if (count === 1) {
      try {
        for (const bucket of buckets) {
          const paths = await listFiles(supabase, bucket, membership.organization_id);
          for (let index = 0; index < paths.length; index += 1000) {
            const { error } = await supabase.storage.from(bucket).remove(paths.slice(index, index + 1000));
            if (error) throw error;
          }
        }
      } catch {
        return NextResponse.json(
          { error: "Archived files could not be removed. Your account was not deleted." },
          { status: 500 },
        );
      }
    }
  }

  const { data, error } = await supabase.rpc("delete_own_account", { p_email: email });
  if (error)
    return NextResponse.json({ error: "Your account could not be deleted safely." }, { status: 400 });

  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
