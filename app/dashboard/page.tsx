import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export default async function DashboardPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return <div className="setup-page"><h1>Connect Supabase to continue</h1><p>Copy <code>.env.example</code> to <code>.env.local</code>, add your project URL and anon key, then run the included SQL migration.</p></div>;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");
  const { data: profile } = await supabase.from("profiles").select("name").eq("id", user.id).single();
  const { data: membership } = await supabase.from("organization_members").select("organizations(name)").eq("user_id", user.id).single();
  const organization = membership?.organizations as unknown as { name: string } | null;
  return <Dashboard user={{ name: profile?.name || user.email?.split("@")[0] || "there", email: user.email || "", organizationName: organization?.name || "Your workspace" }}/>;
}
