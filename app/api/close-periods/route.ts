import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const shape = (item:Record<string,any>) => ({id:item.id,name:item.name,periodType:item.period_type,periodEnd:item.period_end,status:item.status,materiality:Number(item.materiality || 0),tasks:item.tasks || [],variances:item.variances || [],closedAt:item.closed_at,createdAt:item.created_at});
async function context() {
  const supabase = await createClient();
  const { data:{user} } = await supabase.auth.getUser();
  if (!user) return {supabase,user:null,membership:null};
  const {data:membership} = await supabase.from("organization_members").select("organization_id").eq("user_id",user.id).single();
  return {supabase,user,membership};
}
export async function GET() {
  const {supabase,user}=await context();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {data,error}=await supabase.from("close_periods").select("*").order("period_end",{ascending:false});
  return error ? NextResponse.json({error:error.message},{status:500}) : NextResponse.json({periods:(data || []).map(shape)});
}
export async function POST(request:Request) {
  const {supabase,user,membership}=await context();
  if(!user || !membership) return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await request.json();
  const {data,error}=await supabase.from("close_periods").insert({organization_id:membership.organization_id,created_by:user.id,name:body.name,period_type:body.periodType || "month",period_end:body.periodEnd,materiality:body.materiality || 0,tasks:body.tasks || [],variances:body.variances || []}).select().single();
  return error ? NextResponse.json({error:error.message},{status:400}) : NextResponse.json({period:shape(data)});
}
