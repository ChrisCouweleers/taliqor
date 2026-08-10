import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid, requestBodyTooLarge } from "@/lib/security";

async function authenticatedClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (requestBodyTooLarge(request, 16 * 1024))
    return NextResponse.json({ error: "The layout update is too large." }, { status: 413 });
  const { supabase, user } = await authenticatedClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await context.params).id;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid layout." }, { status: 400 });
  const body = await request.json();
  const name = String(body.name || "").trim();
  if (!name || name.length > 120)
    return NextResponse.json({ error: "Enter a layout name under 120 characters." }, { status: 400 });
  const { data, error } = await supabase
    .from("mapping_templates")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json({
        template: {
          id: data.id,
          organizationId: data.organization_id,
          name: data.name,
          fingerprint: data.fingerprint,
          mapping: data.mapping,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        },
      });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, user } = await authenticatedClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await context.params).id;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid layout." }, { status: 400 });
  const { error } = await supabase.from("mapping_templates").delete().eq("id", id);
  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json({ deleted: true });
}
