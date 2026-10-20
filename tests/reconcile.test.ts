import assert from "node:assert/strict";
import test from "node:test";
import { reconcile } from "../lib/reconcile.ts";
import type { Transaction } from "../lib/domain.ts";

function transaction(id: string, amount: number, date = "2026-08-31"): Transaction {
  return { id, amount, date, description: `NetSuite ${id}`, currency: "USD", source: "NetSuite.csv", raw: {} };
}

test("matches exact amounts and references while retaining explainable evidence", () => {
  const results = reconcile(
    [transaction("JE-100", 1250), transaction("JE-101", 99)],
    [transaction("JE-100", 1250), transaction("BANK-9", 99)],
  );
  assert.equal(results.length, 2);
  assert.equal(results[0].status, "matched");
  assert.match(results[0].reason, /Reference exact/);
  assert.equal(results[1].right?.amount, 99);
});

test("matches transactions within date tolerance when amounts are exact", () => {
  const left = [transaction("JE-150", 750, "2026-09-01")];
  const right = [transaction("BANK-150", 750, "2026-09-03")];
  const results = reconcile(left, right, { dateTolerance: 3 });
  assert.equal(results[0].status, "matched");
  assert.match(results[0].reason, /Dates \d day/);
});

test("does not match transactions with different currencies", () => {
  const usd = { id: "JE-200", amount: 500, date: "2026-08-31", description: "Payment", currency: "USD", source: "Bank.csv", raw: {} };
  const eur = { id: "JE-200", amount: 500, date: "2026-08-31", description: "Payment", currency: "EUR", source: "Ledger.csv", raw: {} };
  const results = reconcile([usd], [eur]);
  assert.equal(results.find((m) => m.left.id === "JE-200")?.status, "unmatched");
});

test("returns unmatched right-side rows when no left transaction claims them", () => {
  const left = [transaction("JE-300", 100)];
  const right = [transaction("JE-300", 100), transaction("JE-301", 200)];
  const results = reconcile(left, right);
  const unmatched = results.filter((m) => m.status === "unmatched");
  assert.equal(unmatched.length, 1);
  assert.equal(unmatched[0].left.id, "JE-301");
});

test("matches 100,000 rows without quadratic candidate scanning", { timeout: 10_000 }, () => {
  const rows = 100_000;
  const left = Array.from({ length: rows }, (_, index) => transaction(`L-${index}`, index + 0.25));
  const right = Array.from({ length: rows }, (_, index) => transaction(`R-${index}`, index + 0.25));
  const started = performance.now();
  const results = reconcile(left, right);
  assert.equal(results.length, rows);
  assert.ok(performance.now() - started < 5_000, "100K matching exceeded five seconds");
});
