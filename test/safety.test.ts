import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertWriteAllowed, loadRuntimeConfig } from "../src/env.js";
import { parseProfile } from "../src/profile.js";
import { redact, resolveInside } from "../src/safety.js";
import { requestIdFromHash, sha256, Store } from "../src/store.js";
import { readFileSync } from "node:fs";

test("redact removes the key and ApiKey-shaped values", () => {
  const key = "super-secret-key-123";
  assert.equal(redact(`boom ${key} boom`, [key]), "boom [REDACTED] boom");
  assert.match(redact(`{"ApiKey":"abcdef123"}`, []), /\[REDACTED\]/);
});

test("default environment is demo and writes are allowed there", () => {
  const cfg = loadRuntimeConfig({});
  assert.equal(cfg.env, "demo");
  assert.doesNotThrow(() => assertWriteAllowed(cfg, "send"));
});

test("prod writes need the second switch", () => {
  const cfg = loadRuntimeConfig({ SEF_ENV: "prod" });
  assert.throws(() => assertWriteAllowed(cfg, "send"), /SEF_MCP_ALLOW_PROD_WRITE/);
  const ok = loadRuntimeConfig({ SEF_ENV: "prod", SEF_MCP_ALLOW_PROD_WRITE: "true" });
  assert.doesNotThrow(() => assertWriteAllowed(ok, "send"));
});

test("read-only mode blocks writes everywhere", () => {
  const cfg = loadRuntimeConfig({ SEF_MCP_READ_ONLY: "1" });
  assert.throws(() => assertWriteAllowed(cfg, "send"), /read-only/);
});

test("unresolved 1Password reference is ignored and reported with a helpful message", () => {
  const cfg = loadRuntimeConfig({ SEF_API_KEY: "op://Vault/SEF/credential" });
  assert.equal(cfg.apiKey, undefined);
  assert.ok(cfg.problems.some((p) => p.includes("op run")));
});

test("resolveInside blocks traversal and symlink escape", () => {
  const root = mkdtempSync(join(tmpdir(), "sef-att-"));
  const outside = mkdtempSync(join(tmpdir(), "sef-out-"));
  writeFileSync(join(root, "ok.pdf"), "%PDF-1.4");
  writeFileSync(join(outside, "secret.txt"), "x");
  symlinkSync(join(outside, "secret.txt"), join(root, "link.pdf"));
  mkdirSync(join(root, "sub"));
  assert.ok(resolveInside(root, "ok.pdf").endsWith("ok.pdf"));
  assert.throws(() => resolveInside(root, "../" + outside.split("/").pop() + "/secret.txt"), /outside|not found/);
  assert.throws(() => resolveInside(root, "link.pdf"), /outside/);
  assert.throws(() => resolveInside(root, "sub"), /Not a file/);
});

test("profile validation catches VAT mismatch and bad PIB", () => {
  const example = JSON.parse(readFileSync(new URL("../../examples/profile.example.json", import.meta.url), "utf8"));
  assert.doesNotThrow(() => parseProfile(example));
  const bad = structuredClone(example);
  bad.seller.defaultTax = { category: "S", percent: "20" };
  assert.throws(() => parseProfile(bad), /vatRegistered is false/);
  const badPib = structuredClone(example);
  badPib.seller.pib = "123";
  assert.throws(() => parseProfile(badPib), /9 digits/);
});

test("draft store detects tampering and derives stable requestId", () => {
  const store = new Store(mkdtempSync(join(tmpdir(), "sef-data-")));
  const d = store.saveDraft(
    {
      invoiceNumber: "1",
      customerId: "a",
      buyerName: "A",
      buyerPib: "100000002",
      sendToCir: "No",
      totals: { lineExtension: "1.00", taxExclusive: "1.00", tax: "0.00", taxInclusive: "1.00", payable: "1.00", subtotals: [] },
    },
    "<Invoice/>"
  );
  assert.equal(d.requestId, requestIdFromHash(sha256("<Invoice/>")));
  assert.equal(store.loadDraft(d.draftId).xml, "<Invoice/>");
  writeFileSync(d.xmlFile, "<Invoice>changed</Invoice>");
  assert.throws(() => store.loadDraft(d.draftId), /modified/);
});
