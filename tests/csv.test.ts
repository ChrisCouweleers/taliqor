import assert from "node:assert/strict";
import test from "node:test";
import { parseCsvPreview } from "../lib/csv.ts";

test("parses quoted NetSuite-style fields containing commas and newlines", () => {
  const csv = 'Internal ID,Date,Memo,Amount\r\n1,8/1/2026,"Deposit, batch A\nIncludes fees","1,250.00"\r\n';
  const parsed = parseCsvPreview(csv);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].Memo, "Deposit, batch A\nIncludes fees");
  assert.equal(parsed.rows[0].Amount, "1,250.00");
});

test("rejects an unclosed quoted field", () => {
  assert.throws(() => parseCsvPreview('ID,Memo\n1,"unfinished'), /unclosed quoted field/);
});
