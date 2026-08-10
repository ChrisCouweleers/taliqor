import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { consumeRateLimit, requestBodyTooLarge } from "@/lib/security";

async function ownerContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, membership: null };
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .single();
  return { supabase, user, membership };
}

export async function GET() {
  const { supabase, user, membership } = await ownerContext();
  if (!user || !membership)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: memberships, error: memberError } = await supabase
    .from("organization_members")
    .select("user_id, role, created_at")
    .eq("organization_id", membership.organization_id)
    .order("created_at");
  if (memberError)
    return NextResponse.json({ error: memberError.message }, { status: 400 });

  const userIds = (memberships || []).map((item) => item.user_id);
  const { data: profiles } = userIds.length
    ? await supabase
        .from("profiles")
        .select("id, name, email")
        .in("id", userIds)
    : { data: [] };
  const profileById = new Map((profiles || []).map((item) => [item.id, item]));

  const { data: invitations, error: invitationError } =
    membership.role === "owner"
      ? await supabase
          .from("team_invitations")
          .select("id, email, token, status, expires_at, created_at")
          .eq("organization_id", membership.organization_id)
          .in("status", ["pending", "accepted"])
          .order("created_at", { ascending: false })
      : { data: [], error: null };
  if (invitationError)
    return NextResponse.json(
      { error: invitationError.message },
      { status: 400 },
    );

  return NextResponse.json({
    role: membership.role,
    members: (memberships || []).map((item) => ({
      id: item.user_id,
      role: item.role,
      joinedAt: item.created_at,
      name: profileById.get(item.user_id)?.name || "Team member",
      email: profileById.get(item.user_id)?.email || "",
    })),
    invitations: invitations || [],
  });
}

export async function POST(request: Request) {
  if (requestBodyTooLarge(request, 16 * 1024))
    return NextResponse.json({ error: "The request is too large." }, { status: 413 });
  const { supabase, user, membership } = await ownerContext();
  if (!user || !membership)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (membership.role !== "owner")
    return NextResponse.json(
      { error: "Only the workspace owner can invite teammates." },
      { status: 403 },
    );
  if (!(await consumeRateLimit(supabase, "invite")))
    return NextResponse.json(
      { error: "Too many invitations. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": "3600" } },
    );

  const body = await request.json();
  const email = String(body.email || "")
    .trim()
    .toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const { data, error } = await supabase
    .from("team_invitations")
    .insert({
      organization_id: membership.organization_id,
      invited_by: user.id,
      email,
    })
    .select("id, email, token, status, expires_at, created_at")
    .single();
  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json({ invitation: data });
}

export async function PATCH(request: Request) {
  const { supabase, user, membership } = await ownerContext();
  if (!user || !membership)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (membership.role !== "owner")
    return NextResponse.json(
      { error: "Only the workspace owner can manage invitations." },
      { status: 403 },
    );

  const body = await request.json();
  const { error } = await supabase
    .from("team_invitations")
    .update({ status: "revoked" })
    .eq("id", String(body.id || ""))
    .eq("organization_id", membership.organization_id)
    .eq("status", "pending");
  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json({ ok: true });
}
