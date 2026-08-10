import "server-only";

type SupabaseRpcClient = {
  rpc: (
    name: string,
    parameters: Record<string, string | number>,
  ) => PromiseLike<{ data: boolean | null; error: { message: string } | null }>;
};

export async function consumeRateLimit(
  supabase: SupabaseRpcClient,
  action: "upload" | "create_reconciliation" | "update_reconciliation" | "invite",
) {
  const settings = {
    upload: { limit: 20, windowSeconds: 3600 },
    create_reconciliation: { limit: 120, windowSeconds: 3600 },
    update_reconciliation: { limit: 600, windowSeconds: 3600 },
    invite: { limit: 10, windowSeconds: 3600 },
  }[action];
  const { data, error } = await supabase.rpc("consume_request_limit", {
    p_action: action,
    p_limit: settings.limit,
    p_window_seconds: settings.windowSeconds,
  });

  // Do not lock legitimate users out if the limiter is temporarily unavailable.
  return error ? true : data === true;
}

export function requestBodyTooLarge(request: Request, maxBytes: number) {
  const contentLength = Number(request.headers.get("content-length"));
  return Number.isFinite(contentLength) && contentLength > maxBytes;
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
