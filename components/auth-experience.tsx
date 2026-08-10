"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowRight, Bank, Check, CheckCircle, Eye, EyeSlash, FileCsv, Lightning, LockKey, TrendUp } from "@phosphor-icons/react";
import { Logo, Mark } from "./logo";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup";

export function AuthExperience({ mode }: { mode: Mode }) {
  const signup = mode === "signup";
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim(), password = String(form.get("password") || "");
    try {
      const supabase = createClient();
      if (signup) {
        const firstName = String(form.get("firstName") || "").trim(), lastName = String(form.get("lastName") || "").trim(), company = String(form.get("company") || "").trim();
        const { data, error: authError } = await supabase.auth.signUp({ email, password, options: { data: { first_name: firstName, last_name: lastName, name: `${firstName} ${lastName}`.trim(), company, organization_name: company || `${firstName}'s workspace` }, emailRedirectTo: `${location.origin}/dashboard` } });
        if (authError) throw authError;
        if (!data.session) { setError("Your workspace is ready. Check your inbox to confirm your email."); return; }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
      }
      location.assign("/dashboard");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again."); }
    finally { setBusy(false); }
  }

  return <div className={`auth-experience ${signup ? "signup-mode" : "login-mode"}`}>
    <nav className="auth-nav"><Link href="/" aria-label="Taliqor home"><Logo/></Link><div><span>{signup ? "Already reconciling?" : "New to Taliqor?"}</span><Link href={signup ? "/login" : "/signup"}>{signup ? "Log in" : "Create free workspace"}<ArrowRight/></Link></div></nav>
    <main className="auth-stage">
      <section className="auth-visual" aria-hidden="true">
        <div className="auth-grid-glow"/><div className="auth-orbit orbit-one"/><div className="auth-orbit orbit-two"/>
        <div className="auth-visual-copy"><span className="auth-signal"><i/>LIVE RECONCILIATION ENGINE</span><h1>{signup ? <>Bring the books.<br/><em>We’ll find the truth.</em></> : <>Your numbers.<br/><em>Right where you left them.</em></>}</h1><p>{signup ? "Map messy exports, match transactions, and resolve every exception from one beautifully clear workspace." : "Return to a workspace where every transaction has context, every variance has an owner, and every close gets cleaner."}</p></div>
        <FinanceMachine mode={mode}/>
        <div className="auth-trust"><span><LockKey/>Encrypted workspace</span><span><CheckCircle/>Explainable matches</span><span><Lightning/>Built for the close</span></div>
      </section>
      <section className="auth-form-side"><div className="auth-form-wrap">
        <span className="form-index">{signup ? "01 / CREATE WORKSPACE" : "01 / SECURE ACCESS"}</span>
        <h2>{signup ? "Start reconciling." : "Welcome back."}</h2>
        <p>{signup ? "Free to use. No card, trial clock, or sales call." : "Log in to continue your reconciliation work."}</p>
        <form onSubmit={submit}>
          {signup && <div className="name-fields"><Field label="First name" name="firstName" placeholder="Daniel" autoComplete="given-name"/><Field label="Last name" name="lastName" placeholder="Morgan" autoComplete="family-name"/></div>}
          {signup && <Field label="Company" hint="Optional" name="company" placeholder="Northline Finance" autoComplete="organization" required={false}/>} 
          <Field label="Work email" name="email" type="email" placeholder="you@company.com" autoComplete="email"/>
          <label className="field"><span>Password {signup && <small>8+ characters</small>}</span><div className="password-field"><input required minLength={8} name="password" type={showPassword ? "text" : "password"} placeholder={signup ? "Create a secure password" : "Enter your password"} autoComplete={signup ? "new-password" : "current-password"}/><button type="button" onClick={()=>setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeSlash/> : <Eye/>}</button></div></label>
          {!signup && <div className="forgot-row"><label><input type="checkbox"/>Keep me signed in</label><button type="button" onClick={()=>setError("Password recovery is coming next. Contact your workspace owner for access.")}>Forgot password?</button></div>}
          {error && <div className={error.startsWith("Your workspace") ? "auth-message success" : "auth-message"}>{error}</div>}
          <button className="auth-submit" disabled={busy}>{busy ? <><i/>Securing workspace…</> : <>{signup ? "Create my workspace" : "Enter Taliqor"}<ArrowRight/></>}</button>
        </form>
        {signup && <small className="terms">By creating an account, you agree to use Taliqor responsibly and keep financial exports appropriately secured.</small>}
        <div className="mobile-auth-switch">{signup ? "Already have an account?" : "Need an account?"} <Link href={signup ? "/login" : "/signup"}>{signup ? "Log in" : "Sign up free"}</Link></div>
      </div></section>
    </main>
  </div>;
}

function Field({ label, hint, name, type="text", placeholder, autoComplete, required=true }: { label:string; hint?:string; name:string; type?:string; placeholder:string; autoComplete:string; required?:boolean }) {
  return <label className="field"><span>{label}{hint&&<small>{hint}</small>}</span><input required={required} name={name} type={type} placeholder={placeholder} autoComplete={autoComplete}/></label>;
}

function FinanceMachine({ mode }: { mode: Mode }) {
  const rows = mode === "signup" ? [["Atlas & Co.","$12,450.00","MATCHED"],["Northstar Labs","$8,920.00","MATCHED"],["Finbridge","$6,715.00","REVIEW"]] : [["Verity Partners","$4,280.00","MATCHED"],["AscendCo","$2,200.00","REVIEW"],["Atlas & Co.","$12,450.00","MATCHED"]];
  return <div className="finance-machine"><div className="machine-top"><span><Mark small/><b>Taliqor engine</b></span><span className="machine-live"><i/>Processing</span></div><div className="machine-metrics"><div><small>RECONCILED</small><strong>{mode === "signup" ? "98.7%" : "99.2%"}</strong><span><TrendUp/>+2.4%</span></div><div><small>IN FLOW</small><strong>{mode === "signup" ? "$2.84M" : "$3.12M"}</strong><span>this month</span></div></div><div className="machine-flow"><div className="source-node bank-node"><Bank weight="fill"/><span>BANK</span></div><div className="flow-track"><i/><i/><i/></div><div className="engine-node"><Mark/><span>MAP · MATCH · VERIFY</span></div><div className="flow-track outgoing"><i/><i/><i/></div><div className="source-node ledger-node"><FileCsv weight="fill"/><span>LEDGER</span></div></div><div className="machine-ledger">{rows.map((row,index)=><div className="machine-row" style={{"--row":index} as React.CSSProperties} key={row[0]}><span className="row-check"><Check/></span><div><strong>{row[0]}</strong><small>TXN-{10482-index*3}</small></div><em>{row[1]}</em><b className={row[2] === "REVIEW" ? "review" : ""}>{row[2]}</b></div>)}</div><div className="machine-scan"/></div>;
}
