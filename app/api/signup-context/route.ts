import { NextResponse, type NextRequest } from "next/server";

function clean(value: string | null, maxLength = 120) {
  if (!value) return null;
  try {
    return decodeURIComponent(value).replace(/[\r\n]/g, " ").trim().slice(0, maxLength) || null;
  } catch {
    return value.replace(/[\r\n]/g, " ").trim().slice(0, maxLength) || null;
  }
}

export function GET(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0] ?? null;
  const ip = clean(request.headers.get("x-vercel-forwarded-for") ?? forwardedFor ?? request.headers.get("x-real-ip"), 64);
  const city = clean(request.headers.get("x-vercel-ip-city"));
  const region = clean(request.headers.get("x-vercel-ip-country-region"));
  const country = clean(request.headers.get("x-vercel-ip-country"), 8);
  const location = [city, region, country].filter(Boolean).join(", ") || null;

  return NextResponse.json(
    { ip, location },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
