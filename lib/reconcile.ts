import type { Match, ReconciliationRules, Transaction } from "./domain.ts";

function daysBetween(a: string, b: string) {
  const first = Date.parse(a), second = Date.parse(b);
  return Number.isFinite(first) && Number.isFinite(second) ? Math.abs(first - second) / 86400000 : 99;
}
function normalized(value: string) { return value.toLowerCase().replace(/[^a-z0-9]/g, ""); }
function dayKey(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.floor(parsed / 86400000) : undefined;
}
function amountKey(currency: string, amount: number) {
  return `${currency}\u0000${Math.round(amount * 100)}`;
}
function addIndex(map: Map<string | number, number[]>, key: string | number | undefined, index: number) {
  if (key === undefined || key === "") return;
  const values = map.get(key);
  if (values) values.push(index);
  else map.set(key, [index]);
}
function lowerBound(values: { amount: number; index: number }[], target: number) {
  let low = 0, high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle].amount < target) low = middle + 1;
    else high = middle;
  }
  return low;
}
function similarity(a: string, b: string) {
  const first = new Set(normalized(a).match(/.{1,2}/g) || []), second = new Set(normalized(b).match(/.{1,2}/g) || []);
  if (!first.size || !second.size) return 0;
  const overlap = [...first].filter((part) => second.has(part)).length;
  return (2 * overlap) / (first.size + second.size);
}

export function reconcile(left: Transaction[], right: Transaction[], rules: Partial<ReconciliationRules> = {}): Match[] {
  const dateTolerance = rules.dateTolerance ?? 3, amountTolerance = rules.amountTolerance ?? 1, autoApprove = rules.autoApprove ?? 90;
  const available = new Set(right.map((_, index) => index));
  const byId = new Map<string, number[]>(), byAmount = new Map<string, number[]>(), byDay = new Map<number, number[]>(), byCurrencyDay = new Map<string, { amount: number; index: number }[]>();
  right.forEach((candidate, index) => {
    addIndex(byId, normalized(candidate.id), index);
    addIndex(byAmount, amountKey(candidate.currency, candidate.amount), index);
    addIndex(byDay, dayKey(candidate.date), index);
    const day = dayKey(candidate.date);
    if (day !== undefined) {
      const key = `${candidate.currency}\u0000${day}`;
      const values = byCurrencyDay.get(key);
      const value = { amount: candidate.amount, index };
      if (values) values.push(value);
      else byCurrencyDay.set(key, [value]);
    }
  });
  byCurrencyDay.forEach((values) => values.sort((a, b) => a.amount - b.amount));
  const matches: Match[] = left.map((transaction, row) => {
    let bestIndex = -1, bestScore = -100;
    let bestEvidence: string[] = [];
    const candidateIndexes = new Set<number>();
    for (const index of byId.get(normalized(transaction.id)) || []) candidateIndexes.add(index);
    const exactAmountIndexes = byAmount.get(amountKey(transaction.currency, transaction.amount)) || [];
    for (const index of exactAmountIndexes) candidateIndexes.add(index);
    const tolerance = Math.max(Math.abs(transaction.amount) * (amountTolerance / 100), .01);
    const transactionDay = dayKey(transaction.date);
    // An exact amount is a stronger accounting candidate than a merely
    // tolerated amount. Only expand the date window when no exact amount is
    // available, while exact-reference candidates are always considered.
    if (!exactAmountIndexes.length && transactionDay !== undefined) {
      for (let offset = -dateTolerance; offset <= dateTolerance; offset++) {
        const values = byCurrencyDay.get(`${transaction.currency}\u0000${transactionDay + offset}`) || [];
        for (let index = lowerBound(values, transaction.amount - tolerance); index < values.length && values[index].amount <= transaction.amount + tolerance; index++)
          candidateIndexes.add(values[index].index);
      }
    }
    candidateIndexes.forEach((index) => {
      if (!available.has(index)) return;
      const candidate = right[index];
      let score = 0;
      const evidence: string[] = [];
      const exactId = Boolean(transaction.id && candidate.id && normalized(transaction.id) === normalized(candidate.id));
      const amountDelta = Math.abs(transaction.amount - candidate.amount);
      const tolerance = Math.max(Math.abs(transaction.amount) * (amountTolerance / 100), .01);
      const dayDelta = daysBetween(transaction.date, candidate.date);
      const textSimilarity = similarity(transaction.description, candidate.description);
      if (transaction.currency !== candidate.currency) { score -= 100; evidence.push("Currency differs"); }
      if (exactId) { score += 55; evidence.push("Reference exact"); }
      if (amountDelta < .005) { score += 30; evidence.push("Amount exact"); }
      else if (amountDelta <= tolerance) { score += 14; evidence.push(`Amount within ${((amountDelta / Math.max(Math.abs(transaction.amount), 1)) * 100).toFixed(1)}%`); }
      if (dayDelta === 0) { score += 10; evidence.push("Date exact"); }
      else if (dayDelta <= dateTolerance) { score += 6; evidence.push(`Dates ${dayDelta} day${dayDelta === 1 ? "" : "s"} apart`); }
      if (textSimilarity > .72) { score += 8; evidence.push("Description similar"); }
      if (score > bestScore) { bestScore = score; bestIndex = index; bestEvidence = evidence; }
    });
    if (bestIndex >= 0 && bestScore >= 30) {
      available.delete(bestIndex);
      const confidence = Math.max(1, Math.min(100, Math.round(bestScore)));
      return { id: `m-${row}-${bestIndex}`, left: transaction, right: right[bestIndex], status: confidence >= autoApprove ? "matched" : "review", decision: confidence >= autoApprove ? "approved" : "pending", confidence, reason: bestEvidence.join(" · "), evidence: bestEvidence };
    }
    if (rules.allowGrouping !== false) {
      const groupingIndexes = new Set<number>();
      if (transactionDay !== undefined) {
        for (let offset = -dateTolerance; offset <= dateTolerance; offset++)
          for (const index of byDay.get(transactionDay + offset) || []) groupingIndexes.add(index);
      }
      const candidates = [...groupingIndexes].filter((index) => available.has(index) && right[index].currency === transaction.currency).sort((a, b) => right[a].amount - right[b].amount);
      let first = 0, second = candidates.length - 1;
      while (first < second) {
        const indexes = [candidates[first], candidates[second]];
        const sum = right[indexes[0]].amount + right[indexes[1]].amount;
        if (Math.abs(sum - transaction.amount) <= tolerance) {
          indexes.forEach((index) => available.delete(index));
          const grouped = indexes.map((index) => right[index]);
          return { id:`group-${row}-${indexes.join("-")}`, left:transaction, right:grouped[0], groupedRight:grouped, status:"review", decision:"pending", confidence:88, reason:`${grouped.length} transactions total ${transaction.amount.toFixed(2)}`, evidence:["Many-to-one amount match", `Dates within ${dateTolerance} days`] };
        }
        if (sum < transaction.amount) first++;
        else second--;
      }
    }
    return { id: `m-${row}-none`, left: transaction, status: "unmatched", decision: "pending", confidence: 0, reason: "No corresponding transaction found", evidence: ["No candidate passed the matching threshold"] };
  });
  available.forEach((index) => matches.push({ id: `right-${index}`, left: right[index], status: "unmatched", decision: "pending", confidence: 0, reason: `Only found in ${right[index].source}`, evidence: ["No corresponding source transaction"] }));
  return matches;
}
