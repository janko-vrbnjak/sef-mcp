import { test } from "node:test";
import assert from "node:assert/strict";
import { formatAmount, lineAmount, parseDecimal, taxAmount } from "../src/money.js";

test("parseDecimal scales exactly", () => {
  assert.equal(parseDecimal("12.5", 2), 1250n);
  assert.equal(parseDecimal("0", 2), 0n);
  assert.throws(() => parseDecimal("1,5", 2));
  assert.throws(() => parseDecimal("1.555", 2));
  assert.throws(() => parseDecimal("-1", 2));
});

test("lineAmount rounds half-up without floats", () => {
  // 0.1 * 0.2 would be 0.020000000000000004 with floats
  assert.equal(formatAmount(lineAmount("0.1", "0.20")), "0.02");
  assert.equal(formatAmount(lineAmount("3", "0.33")), "0.99");
  assert.equal(formatAmount(lineAmount("0.005", "1.00")), "0.01"); // 0.005 → half-up
  assert.throws(() => lineAmount("1", "0.335"), /more than 2 decimals/);
});

test("lineAmount for hours × rate", () => {
  assert.equal(formatAmount(lineAmount("12.5", "6273.15")), "78414.38");
  assert.equal(formatAmount(lineAmount("1", "727844.12")), "727844.12");
});

test("taxAmount at 20% and 0%", () => {
  assert.equal(formatAmount(taxAmount(10000n, "20")), "20.00");
  assert.equal(formatAmount(taxAmount(12345n, "20")), "24.69");
  assert.equal(formatAmount(taxAmount(12345n, "0")), "0.00");
});
