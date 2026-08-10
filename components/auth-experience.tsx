"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {
  ArrowRight,
  Bank,
  Check,
  CheckCircle,
  Eye,
  EyeSlash,
  FileCsv,
  Fingerprint,
  Lightning,
  LockKey,
  ShieldCheck,
  TrendUp,
  Warning,
} from "@phosphor-icons/react";
import { Logo, Mark } from "./logo";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup";

export function AuthExperience({ mode }: { mode: Mode }) {
  const signup = mode === "signup";
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [showPassword, setShowPassword] = useState(false);
  const [authStep, setAuthStep] = useState<"login" | "forgot" | "update">(
    "login",
  );
  const [inviteToken, setInviteToken] = useState("");

  useEffect(() => {
    if (signup) {
      setInviteToken(
        new URLSearchParams(window.location.search).get("invite") || "",
      );
      return;
    }
    if (signup || !new URLSearchParams(window.location.search).has("recovery"))
      return;
    setAuthStep("update");
    const supabase = createClient();
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setAuthStep("update");
    });
    return () => listener.subscription.unsubscribe();
  }, [signup]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim(),
      password = String(form.get("password") || "");
    try {
      const supabase = createClient();
      if (!signup && authStep === "forgot") {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(
          email,
          { redirectTo: `${location.origin}/login?recovery=1` },
        );
        if (authError) throw authError;
        setError(
          "Recovery email sent. Open the link in your inbox to choose a new password.",
        );
        return;
      } else if (!signup && authStep === "update") {
        const confirmation = String(form.get("confirmPassword") || "");
        if (password !== confirmation)
          throw new Error("The passwords do not match.");
        const { error: authError } = await supabase.auth.updateUser({
          password,
        });
        if (authError) throw authError;
        location.assign("/dashboard");
        return;
      } else if (signup) {
        const firstName = String(form.get("firstName") || "").trim(),
          lastName = String(form.get("lastName") || "").trim(),
          company = String(form.get("company") || "").trim();
        const contextResponse = await fetch("/api/signup-context", {
          cache: "no-store",
        });
        const context = contextResponse.ok
          ? ((await contextResponse.json()) as {
              ip?: string | null;
              location?: string | null;
            })
          : {};
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: firstName,
              last_name: lastName,
              name: `${firstName} ${lastName}`.trim(),
              company,
              organization_name: company || `${firstName}'s workspace`,
              invite_token: inviteToken || null,
              signup_ip: context.ip ?? null,
              signup_location: context.location ?? null,
            },
            emailRedirectTo: `${location.origin}/dashboard`,
          },
        });
        if (authError) throw authError;
        if (!data.session) {
          setError(
            "Your workspace is ready. Check your inbox to confirm your email.",
          );
          return;
        }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (authError) throw authError;
      }
      location.assign("/dashboard");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`auth-experience auth-canvas ${signup ? "signup-mode" : "login-mode"}`}
    >
      <div className="canvas-grid" />
      <div className="canvas-beam" />
      <div className="canvas-noise" />
      <div className="amount-tape tape-one" aria-hidden="true">
        <span>$12,450.00</span>
        <i>CR</i>
        <span>$8,920.00</span>
        <i>CR</i>
        <span>$4,280.00</span>
        <i>CR</i>
        <span>$6,715.00</span>
        <i>DR</i>
        <span>$3,100.00</span>
      </div>
      <div className="amount-tape tape-two" aria-hidden="true">
        <span>ORD-10482</span>
        <i>99.8%</i>
        <span>ORD-10481</span>
        <i>98.4%</i>
        <span>ORD-10479</span>
        <i>100%</i>
        <span>ORD-10476</span>
      </div>
      <nav className="auth-nav">
        <Link href="/" aria-label="Taliqor home">
          <Logo />
        </Link>
        <div>
          <span>
            {signup ? "Already have a workspace?" : "New to Taliqor?"}
          </span>
          <Link href={signup ? "/login" : "/signup"}>
            {signup ? "Log in" : "Create workspace"}
            <ArrowRight />
          </Link>
        </div>
      </nav>

      <main className="auth-control-room">
        <header className="control-intro">
          <span className="auth-signal">
            <i />
            {signup ? "NEW WORKSPACE PROTOCOL" : "SECURE WORKSPACE ACCESS"}
          </span>
          <h1>
            {signup ? (
              <>
                Reconcile the <em>unreconcilable.</em>
              </>
            ) : (
              <>
                Pick up exactly <em>where you closed.</em>
              </>
            )}
          </h1>
          <p>
            {signup
              ? "Create your workspace. Bring any two exports. Leave with one clear answer."
              : "Your mappings, match decisions, and open exceptions are waiting."}
          </p>
        </header>

        <section className="auth-system">
          <div className="ledger-sheet" aria-hidden="true">
            <div>
              <span>POSTED</span>
              <span>REFERENCE</span>
              <span>DEBIT</span>
              <span>CREDIT</span>
            </div>
            {[
              "10482",
              "10481",
              "10479",
              "10476",
              "10474",
              "10471",
              "10468",
            ].map((id, index) => (
              <div key={id}>
                <span>08/{String(9 - index).padStart(2, "0")}/26</span>
                <span>ORD-{id}</span>
                <span>
                  {index % 3 === 0 ? `$${[620, 280, 910][index % 3]}.00` : "—"}
                </span>
                <span>
                  {index % 3 !== 0
                    ? `$${[12450, 8920, 4280, 6715][index % 4].toLocaleString()}.00`
                    : "—"}
                </span>
              </div>
            ))}
          </div>
          <div className="balance-watermark" aria-hidden="true">
            <span>RECONCILED</span>
            <strong>$2,847,190.22</strong>
            <small>98.7% of ledger</small>
          </div>
          <div className="ledger-rail rail-in" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="ledger-rail rail-out" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="data-node node-bank">
            <span>
              <Bank weight="fill" />
            </span>
            <div>
              <small>SOURCE 01</small>
              <strong>Bank feed</strong>
            </div>
            <b>LIVE</b>
          </div>
          <div className="data-node node-ledger">
            <span>
              <FileCsv weight="fill" />
            </span>
            <div>
              <small>SOURCE 02</small>
              <strong>Revenue ledger</strong>
            </div>
            <b>READY</b>
          </div>
          <div className="data-node node-match">
            <span>
              <CheckCircle weight="fill" />
            </span>
            <div>
              <small>CONFIDENCE</small>
              <strong>99.2% match</strong>
            </div>
            <b>+2.4%</b>
          </div>
          <div className="data-node node-exception">
            <span>
              <Warning weight="fill" />
            </span>
            <div>
              <small>EXCEPTIONS</small>
              <strong>3 to review</strong>
            </div>
            <b>OPEN</b>
          </div>

          <section className="auth-terminal">
            <div className="terminal-cap">
              <span>
                <Mark small />
                <b>TALIQOR / AUTH</b>
              </span>
              <span>
                <i />
                ENCRYPTED
              </span>
            </div>
            <div className="terminal-heading">
              <span className="form-index">
                {signup
                  ? "CREATE / 001"
                  : authStep === "forgot"
                    ? "RECOVER / 001"
                    : authStep === "update"
                      ? "RESET / 002"
                      : "ACCESS / 001"}
              </span>
              <h2>
                {signup
                  ? inviteToken
                    ? "Join your team workspace"
                    : "Open your free workspace"
                  : authStep === "forgot"
                    ? "Recover your account"
                    : authStep === "update"
                      ? "Choose a new password"
                      : "Welcome back"}
              </h2>
              <p>
                {signup
                  ? inviteToken
                    ? "Create your account with the email address that received this invitation."
                    : "No card. No trial clock. Just clearer books."
                  : authStep === "forgot"
                    ? "We’ll send a secure recovery link to your work email."
                    : authStep === "update"
                      ? "Use at least eight characters for your new password."
                      : "Authenticate to continue your close."}
              </p>
            </div>
            <form onSubmit={submit}>
              {signup && (
                <div className="name-fields">
                  <Field
                    label="First name"
                    name="firstName"
                    placeholder="Marnie"
                    autoComplete="given-name"
                  />
                  <Field
                    label="Last name"
                    name="lastName"
                    placeholder="Kestrel"
                    autoComplete="family-name"
                  />
                </div>
              )}
              {signup && !inviteToken && (
                <Field
                  label="Company"
                  hint="Optional"
                  name="company"
                  placeholder="Blue Otter Foundry"
                  autoComplete="organization"
                  required={false}
                />
              )}
              {authStep !== "update" && (
                <Field
                  label="Work email"
                  name="email"
                  type="email"
                  placeholder={
                    signup
                      ? "marnie@blueotterfoundry.com"
                      : "ivo@thimbleworks.co"
                  }
                  autoComplete="email"
                />
              )}
              {authStep !== "forgot" && (
                <label className="field">
                  <span>
                    {authStep === "update" ? "New password" : "Password"}{" "}
                    {(signup || authStep === "update") && (
                      <small>8+ characters</small>
                    )}
                  </span>
                  <div className="password-field">
                    <input
                      required
                      minLength={8}
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder={
                        signup
                          ? "A phrase no ledger could guess"
                          : authStep === "update"
                            ? "Your new password"
                            : "The secret one"
                      }
                      autoComplete={
                        signup || authStep === "update"
                          ? "new-password"
                          : "current-password"
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showPassword ? <EyeSlash /> : <Eye />}
                    </button>
                  </div>
                </label>
              )}
              {authStep === "update" && (
                <Field
                  label="Confirm new password"
                  name="confirmPassword"
                  type="password"
                  placeholder="Repeat your new password"
                  autoComplete="new-password"
                />
              )}
              {!signup && authStep === "login" && (
                <div className="forgot-row">
                  <label>
                    <input type="checkbox" />
                    Keep me signed in
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthStep("forgot");
                      setError("");
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
              )}
              {!signup && authStep === "forgot" && (
                <div className="forgot-row">
                  <span />
                  <button
                    type="button"
                    onClick={() => {
                      setAuthStep("login");
                      setError("");
                    }}
                  >
                    Back to login
                  </button>
                </div>
              )}
              {error && (
                <div
                  className={
                    error.startsWith("Your workspace") ||
                    error.startsWith("Recovery email")
                      ? "auth-message success"
                      : "auth-message"
                  }
                >
                  {error}
                </div>
              )}
              <button className="auth-submit" disabled={busy}>
                {busy ? (
                  <>
                    <i />
                    Securing workspace…
                  </>
                ) : (
                  <>
                    {signup
                      ? "Create my workspace"
                      : authStep === "forgot"
                        ? "Send recovery email"
                        : authStep === "update"
                          ? "Save new password"
                          : "Enter Taliqor"}
                    <ArrowRight />
                  </>
                )}
              </button>
            </form>
            {signup && (
              <small className="terms">
                By creating an account, you agree to safeguard the financial
                data you upload.
              </small>
            )}
            <div className="terminal-foot">
              <span>
                <Fingerprint />
                Session protected
              </span>
              <span>taliqor.com</span>
            </div>
          </section>
        </section>

        <footer className="control-trust">
          <span>
            <LockKey />
            Encrypted at rest
          </span>
          <span>
            <ShieldCheck />
            Organization isolated
          </span>
          <span>
            <Lightning />
            Explainable matching
          </span>
          <span>
            <TrendUp />
            Built for the close
          </span>
        </footer>
      </main>
    </div>
  );
}

function Field({
  label,
  hint,
  name,
  type = "text",
  placeholder,
  autoComplete,
  required = true,
}: {
  label: string;
  hint?: string;
  name: string;
  type?: string;
  placeholder: string;
  autoComplete: string;
  required?: boolean;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <input
        required={required}
        name={name}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
    </label>
  );
}
