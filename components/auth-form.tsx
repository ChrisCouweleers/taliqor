"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowRight, CheckCircle } from "@phosphor-icons/react";
import { Logo } from "./logo";
import { createClient } from "@/lib/supabase/client";

export function AuthForm() {
  const [signup, setSignup] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget), email = String(form.get("email")), password = String(form.get("password"));
    try {
      const supabase = createClient();
      const result = signup ? await supabase.auth.signUp({ email, password, options: { data: { name: form.get("name"), organization_name: form.get("organization") }, emailRedirectTo: `${location.origin}/dashboard` } }) : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (signup && !result.data.session) { setError("Check your inbox to confirm your email, then sign in."); setSignup(false); }
      else location.assign("/dashboard");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Something went wrong."); }
    finally { setBusy(false); }
  }
  return <div className="auth-shell"><section className="auth-brand"><Link href="/"><Logo /></Link><div><span className="eyebrow light"><span/>Free reconciliation workspace</span><h1>Close the books<br/>with confidence.</h1><p>Bring your spreadsheets. Taliqor finds the matches, explains the exceptions, and remembers your workflow.</p><ul><li><CheckCircle weight="fill"/>Unlimited reconciliation runs</li><li><CheckCircle weight="fill"/>Reusable CSV mappings</li><li><CheckCircle weight="fill"/>No card. No trial clock.</li></ul></div><small>Revenue, reconciled.</small></section><main className="auth-main"><div className="auth-card"><span className="auth-kicker">{signup ? "CREATE YOUR WORKSPACE" : "WELCOME BACK"}</span><h2>{signup ? "Start using Taliqor" : "Log in to Taliqor"}</h2><p>{signup ? "Free while we build the future of reconciliation." : "Continue where your team left off."}</p><form onSubmit={submit}>{signup && <><label>Your name<input required name="name" autoComplete="name" placeholder="Daniel Morgan"/></label><label>Company or team<input required name="organization" placeholder="Northline Finance"/></label></>}<label>Work email<input required type="email" name="email" autoComplete="email" placeholder="you@company.com"/></label><label>Password<input required minLength={8} type="password" name="password" autoComplete={signup ? "new-password" : "current-password"} placeholder="At least 8 characters"/></label>{error && <div className="auth-error">{error}</div>}<button disabled={busy}>{busy ? "One moment…" : signup ? "Create free account" : "Log in"}<ArrowRight/></button></form><div className="auth-switch">{signup ? "Already have an account?" : "New to Taliqor?"}<button onClick={() => { setSignup(!signup); setError(""); }}>{signup ? "Log in" : "Create an account"}</button></div></div></main></div>;
}
