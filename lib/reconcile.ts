import { Match, Transaction } from "./domain";

function daysBetween(a: string, b: string) {
  const first = Date.parse(a), second = Date.parse(b);
  return Number.isFinite(first) && Number.isFinite(second) ? Math.abs(first - second) / 86400000 : 99;
}
function normalized(value: string) { return value.toLowerCase().replace(/[^a-z0-9]/g, ""); }
function similarity(a: string, b: string) {
  const first = new Set(normalized(a).match(/.{1,2}/g) || []), second = new Set(normalized(b).match(/.{1,2}/g) || []);
  if (!first.size || !second.size) return 0;
  const overlap = [...first].filter((part) => second.has(part)).length;
  return (2 * overlap) / (first.size + second.size);
}

export function reconcile(left: Transaction[], right: Transaction[]): Match[] {
  const available = new Set(right.map((_, index) => index));
  const matches: Match[] = left.map((transaction, row) => {
    let bestIndex = -1, bestScore = -100;
    let bestEvidence: string[] = [];
    right.forEach((candidate, index) => {
      if (!available.has(index)) return;
      let score = 0;
      const evidence: string[] = [];
      const exactId = Boolean(transaction.id && candidate.id && normalized(transaction.id) === normalized(candidate.id));
      const amountDelta = Math.abs(transaction.amount - candidate.amount);
      const tolerance = Math.max(Math.abs(transaction.amount) * .01, 1);
      const dayDelta = daysBetween(transaction.date, candidate.date);
      const textSimilarity = similarity(transaction.description, candidate.description);
      if (transaction.currency !== candidate.currency) { score -= 100; evidence.push("Currency differs"); }
      if (exactId) { score += 55; evidence.push("Reference exact"); }
      if (amountDelta < .005) { score += 30; evidence.push("Amount exact"); }
      else if (amountDelta <= tolerance) { score += 14; evidence.push(`Amount within ${((amountDelta / Math.max(Math.abs(transaction.amount), 1)) * 100).toFixed(1)}%`); }
      if (dayDelta === 0) { score += 10; evidence.push("Date exact"); }
      else if (dayDelta <= 3) { score += 6; evidence.push(`Dates ${dayDelta} day${dayDelta === 1 ? "" : "s"} apart`); }
      if (textSimilarity > .72) { score += 8; evidence.push("Description similar"); }
      if (score > bestScore) { bestScore = score; bestIndex = index; bestEvidence = evidence; }
    });
    if (bestIndex >= 0 && bestScore >= 30) {
      available.delete(bestIndex);
      const confidence = Math.max(1, Math.min(100, Math.round(bestScore)));
      return { id: `m-${row}-${bestIndex}`, left: transaction, right: right[bestIndex], status: confidence >= 90 ? "matched" : "review", decision: confidence >= 90 ? "approved" : "pending", confidence, reason: bestEvidence.join(" · "), evidence: bestEvidence };
    }
    return { id: `m-${row}-none`, left: transaction, status: "unmatched", decision: "pending", confidence: 0, reason: "No corresponding transaction found", evidence: ["No candidate passed the matching threshold"] };
  });
  available.forEach((index) => matches.push({ id: `right-${index}`, left: right[index], status: "unmatched", decision: "pending", confidence: 0, reason: `Only found in ${right[index].source}`, evidence: ["No corresponding source transaction"] }));
  return matches;
}
