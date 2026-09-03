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

test("matches 100,000 rows without quadratic candidate scanning", { timeout: 10_000 }, () => {
  const rows = 100_000;
  const left = Array.from({ length: rows }, (_, index) => transaction(`L-${index}`, index + 0.25));
  const right = Array.from({ length: rows }, (_, index) => transaction(`R-${index}`, index + 0.25));
  const started = performance.now();
  const results = reconcile(left, right);
  assert.equal(results.length, rows);
  assert.ok(performance.now() - started < 5_000, "100K matching exceeded five seconds");
});
