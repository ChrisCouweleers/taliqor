type SignupRecord = {
  id?: string;
  name?: string;
  email?: string;
  company?: string | null;
  signup_ip?: string | null;
  signup_location?: string | null;
  created_at?: string;
};

type DatabaseWebhook = {
  type?: string;
  table?: string;
  schema?: string;
  record?: SignupRecord;
};

const jsonHeaders = { "Content-Type": "application/json" };

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

function reply(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

async function isTrustedWebhook(request: Request) {
  const suppliedSecret = request.headers.get("x-taliqor-webhook-secret");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!suppliedSecret || !supabaseUrl || !serviceRoleKey) return false;

  const verification = await fetch(`${supabaseUrl}/rest/v1/rpc/verify_signup_webhook`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ supplied_secret: suppliedSecret }),
  });

  return verification.ok && await verification.json() === true;
}

function brandedEmail(record: SignupRecord) {
  const name = escapeHtml(record.name?.trim() || "New user");
  const email = escapeHtml(record.email?.trim() || "Not supplied");
  const company = escapeHtml(record.company?.trim() || "Independent workspace");
  const ip = escapeHtml(record.signup_ip?.trim() || "Not available");
  const location = escapeHtml(record.signup_location?.trim() || "Not available");
  const createdDate = record.created_at ? new Date(record.created_at) : null;
  const created = createdDate && !Number.isNaN(createdDate.valueOf())
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }).format(createdDate)
    : "Just now";
  const userUrl = record.id
    ? `https://supabase.com/dashboard/project/kvwukntfxqycavqfmaoz/auth/users?search=${encodeURIComponent(record.id)}`
    : "https://supabase.com/dashboard/project/kvwukntfxqycavqfmaoz/auth/users";

  return `<!doctype html><html><body style="margin:0;background:#eef2f5;font-family:Arial,sans-serif;color:#0b1733"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px;background:#eef2f5"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #dfe5ea"><tr><td style="height:7px;background:#12b9a4"></td></tr><tr><td style="padding:30px 34px 24px;background:#07142d;color:#fff"><div style="font-size:24px;font-weight:700">Taliqor<span style="color:#19c9b0">.</span></div><div style="margin-top:20px;color:#59d8c6;font-size:12px;font-weight:700;letter-spacing:1.4px">NEW WORKSPACE CREATED</div><h1 style="margin:10px 0 8px;font-size:30px;line-height:1.18">Someone new just joined.</h1><p style="margin:0;color:#afbbce;font-size:15px;line-height:1.55">A fresh Taliqor workspace is ready to reconcile.</p></td></tr><tr><td style="padding:28px 34px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e7eb;border-radius:12px;overflow:hidden"><tr><td style="padding:15px 18px;background:#f7f9fa;color:#7c8797;font-size:12px;font-weight:700;letter-spacing:.8px;width:34%">NAME</td><td style="padding:15px 18px;background:#f7f9fa;color:#15223b;font-size:15px;font-weight:700">${name}</td></tr><tr><td style="padding:15px 18px;border-top:1px solid #e2e7eb;color:#7c8797;font-size:12px;font-weight:700;letter-spacing:.8px">WORK EMAIL</td><td style="padding:15px 18px;border-top:1px solid #e2e7eb;color:#15223b;font-size:15px">${email}</td></tr><tr><td style="padding:15px 18px;border-top:1px solid #e2e7eb;background:#f7f9fa;color:#7c8797;font-size:12px;font-weight:700;letter-spacing:.8px">COMPANY</td><td style="padding:15px 18px;border-top:1px solid #e2e7eb;background:#f7f9fa;color:#15223b;font-size:15px">${company}</td></tr><tr><td style="padding:15px 18px;border-top:1px solid #e2e7eb;color:#7c8797;font-size:12px;font-weight:700;letter-spacing:.8px">IP ADDRESS</td><td style="padding:15px 18px;border-top:1px solid #e2e7eb;color:#15223b;font-size:15px">${ip}</td></tr><tr><td style="padding:15px 18px;border-top:1px solid #e2e7eb;background:#f7f9fa;color:#7c8797;font-size:12px;font-weight:700;letter-spacing:.8px">LOCATION</td><td style="padding:15px 18px;border-top:1px solid #e2e7eb;background:#f7f9fa;color:#15223b;font-size:15px">${location}</td></tr><tr><td style="padding:15px 18px;border-top:1px solid #e2e7eb;color:#7c8797;font-size:12px;font-weight:700;letter-spacing:.8px">SIGNED UP</td><td style="padding:15px 18px;border-top:1px solid #e2e7eb;color:#15223b;font-size:15px">${escapeHtml(created)} CT</td></tr></table><table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px"><tr><td style="background:#0b9f8b;border-radius:8px"><a href="${userUrl}" style="display:inline-block;padding:14px 22px;color:#fff;text-decoration:none;font-weight:700;font-size:15px">View user in Supabase &rarr;</a></td></tr></table></td></tr><tr><td style="padding:18px 34px;background:#f7f9fa;border-top:1px solid #e6eaee;color:#8d97a6;font-size:12px"><strong style="color:#526075">Taliqor operations</strong> &nbsp;&middot;&nbsp; Signup notification &nbsp;&middot;&nbsp; <a href="https://taliqor.com" style="color:#0b9482">taliqor.com</a></td></tr></table></td></tr></table></body></html>`;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  if (!await isTrustedWebhook(request)) {
    return reply({ error: "Unauthorized" }, 401);
  }

  let payload: DatabaseWebhook;
  try {
    payload = await request.json();
  } catch {
    return reply({ error: "Invalid JSON" }, 400);
  }

  if (payload.type !== "INSERT" || payload.schema !== "public" || payload.table !== "profiles") {
    return reply({ error: "Unsupported webhook event" }, 400);
  }

  const record = payload.record;
  if (!record?.id || !record.email) return reply({ error: "Missing signup details" }, 400);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const adminEmail = Deno.env.get("ADMIN_SIGNUP_EMAIL");
  if (!resendKey || !adminEmail) return reply({ error: "Notification secrets are not configured" }, 500);

  const label = (record.company?.trim() || record.name?.trim() || "New user").replace(/[\r\n]+/g, " ").slice(0, 120);
  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `taliqor-signup/${record.id}`,
    },
    body: JSON.stringify({
      from: "Taliqor <notifications@auth.taliqor.com>",
      to: [adminEmail],
      subject: `New Taliqor signup — ${label}`,
      html: brandedEmail(record),
    }),
  });

  if (!resendResponse.ok) {
    const detail = await resendResponse.text();
    console.error("Resend rejected signup notification", resendResponse.status, detail);
    return reply({ error: "Email delivery failed" }, 502);
  }

  return reply({ delivered: true });
});
