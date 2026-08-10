import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}) {
  const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await request.json(), update:Record<string,unknown>={updated_at:new Date().toISOString()};
  if(body.tasks) update.tasks=body.tasks; if(body.variances) update.variances=body.variances; if(body.status) {update.status=body.status;update.closed_at=body.status==="closed"?new Date().toISOString():null;} if(body.materiality!==undefined) update.materiality=body.materiality;
  const {data,error}=await supabase.from("close_periods").update(update).eq("id",(await context.params).id).select().single();
  return error?NextResponse.json({error:error.message},{status:400}):NextResponse.json({period:data});
}
