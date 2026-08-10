export function validatedMatchingRule(body: Record<string, unknown>) {
  const name = String(body.name || "").trim();
  const raw = body.settings as Record<string, unknown> | undefined;
  const dateTolerance = Number(raw?.dateTolerance);
  const amountTolerance = Number(raw?.amountTolerance);
  const autoApprove = Number(raw?.autoApprove);
  if (
    !name ||
    name.length > 100 ||
    !Number.isFinite(dateTolerance) ||
    dateTolerance < 0 ||
    dateTolerance > 365 ||
    !Number.isFinite(amountTolerance) ||
    amountTolerance < 0 ||
    amountTolerance > 100 ||
    !Number.isFinite(autoApprove) ||
    autoApprove < 1 ||
    autoApprove > 100
  )
    return null;
  return {
    name,
    settings: {
      dateTolerance,
      amountTolerance,
      autoApprove,
      allowGrouping: raw?.allowGrouping !== false,
    },
  };
}
