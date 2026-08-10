import { JournalLine } from "./domain";

export function shapeAdjustment(item: Record<string, any>) {
  return {
    id: item.id,
    reconciliationId: item.reconciliation_id,
    closePeriodId: item.close_period_id,
    matchId: item.match_id,
    title: item.title,
    description: item.description || "",
    postingDate: item.posting_date,
    status: item.status,
    lines: item.lines || [],
    recurring: Boolean(item.recurring),
    autoReverse: Boolean(item.auto_reverse),
    reversalDate: item.reversal_date,
    externalReference: item.external_reference || "",
    preparedBy: item.prepared_by || "",
    reviewedBy: item.reviewed_by || "",
    entryKind: item.entry_kind || "original",
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

export function validateJournalLines(value: unknown) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 100) return null;
  const lines: JournalLine[] = [];
  for (const raw of value as Record<string, unknown>[]) {
    const account = String(raw.account || "").trim();
    const description = String(raw.description || "").trim();
    const debit = Number(raw.debit || 0);
    const credit = Number(raw.credit || 0);
    if (
      !account || account.length > 100 || description.length > 240 ||
      !Number.isFinite(debit) || !Number.isFinite(credit) || debit < 0 || credit < 0 ||
      (debit > 0 && credit > 0) || (debit === 0 && credit === 0)
    ) return null;
    lines.push({ account, description, debit, credit });
  }
  const debits = lines.reduce((sum, line) => sum + line.debit, 0);
  const credits = lines.reduce((sum, line) => sum + line.credit, 0);
  return Math.abs(debits - credits) < 0.005 ? lines : null;
}
