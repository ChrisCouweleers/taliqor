import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const entityId = url.searchParams.get("entityId") || "";
  let query = supabase.from("audit_events").select("*").order("created_at", { ascending: false }).limit(100);
  if (entityId) query = query.eq("entity_id", entityId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ events: (data || []).map((item) => ({
    id: item.id, actorName: item.actor_name, entityType: item.entity_type,
    entityId: item.entity_id, action: item.action, summary: item.summary,
    details: item.details || {}, createdAt: item.created_at,
  })) }, { headers: { "Cache-Control": "no-store" } });
}
