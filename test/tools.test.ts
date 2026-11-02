import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRuntimeConfig } from "../src/env.js";
import { parseProfile } from "../src/profile.js";
import { SefClient } from "../src/sef/client.js";
import { SefTools } from "../src/tools.js";

const profile = parseProfile(
  JSON.parse(readFileSync(new URL("../../examples/profile.example.json", import.meta.url), "utf8"))
);

function fakeFetch(calls: Array<{ url: string; init: RequestInit }>): typeof fetch {
  return (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify({ InvoiceId: 1, SalesInvoiceId: 42, PurchaseInvoiceId: 7 }), { status: 200 });
  }) as typeof fetch;
}

function setup(env: Record<string, string> = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), "sef-tools-"));
  const cfg = loadRuntimeConfig({ SEF_MCP_DATA_DIR: dataDir, SEF_API_KEY: "test-key-123456", ...env });
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const client = new SefClient({ env: cfg.env, apiKey: cfg.apiKey!, fetchImpl: fakeFetch(calls) });
  return { tools: new SefTools(cfg, profile, client), calls, dataDir };
}

const args = {
  customer: "kupac-a",
  number: "PR-2026-001",
  issueDate: "2026-11-02",
  lines: [{ name: "Konsultacije", quantity: "4", unitPrice: "6000.00", unitCode: "HUR" }],
};

test("draft uses profile defaults and sends nothing", () => {
  const { tools, calls } = setup();
  const d = tools.draftInvoice(args);
  assert.equal(calls.length, 0);
  assert.equal(d.totals.payable, "24000.00");
  assert.equal(d.environment, "demo");
  assert.equal(d.sendToCir, "No");
  const xml = readFileSync(d.xmlFile, "utf8");
  assert.match(xml, /<cbc:DueDate>2026-11-10<\/cbc:DueDate>/); // customer default 8 days
  assert.match(xml, /<cbc:ID>UG-01\/2026<\/cbc:ID>/);
});

test("send requires the matching approvalCode", async () => {
  const { tools, calls } = setup();
  const d = tools.draftInvoice(args);
  await assert.rejects(tools.sendInvoice(d.draftId, "00000000"), /approvalCode/);
  assert.equal(calls.length, 0);
  const r = await tools.sendInvoice(d.draftId, d.approvalCode);
  assert.equal(r.sent, true);
  assert.equal(calls.length, 1);
  const call = calls[0]!;
  assert.ok(call.url.startsWith("https://demoefaktura.mfin.gov.rs/api/publicApi/sales-invoice/ubl?"));
  assert.ok(call.url.includes(`requestId=${tools.getDraft(d.draftId).requestId}`));
  assert.ok(call.url.includes("executeValidation=true"));
  assert.equal((call.init.headers as Record<string, string>).ApiKey, "test-key-123456");
});

test("prod send is blocked without the second switch", async () => {
  const { tools, calls } = setup({ SEF_ENV: "prod" });
  const d = tools.draftInvoice(args);
  await assert.rejects(tools.sendInvoice(d.draftId, d.approvalCode), /SEF_MCP_ALLOW_PROD_WRITE/);
  assert.equal(calls.length, 0);
});

test("duplicate invoice number produces a warning after a successful send", async () => {
  const { tools } = setup();
  const d = tools.draftInvoice(args);
  await tools.sendInvoice(d.draftId, d.approvalCode);
  const again = tools.draftInvoice(args);
  assert.equal(again.warnings.length, 1);
});

test("number pattern from profile is enforced", () => {
  const { tools } = setup();
  assert.throws(() => tools.draftInvoice({ ...args, number: "2026/1" }), /does not match/);
});

test("audit log never contains the API key", async () => {
  const { tools, dataDir } = setup();
  const d = tools.draftInvoice(args);
  await tools.sendInvoice(d.draftId, d.approvalCode);
  const log = readFileSync(join(dataDir, "audit.jsonl"), "utf8");
  assert.ok(!log.includes("test-key-123456"));
  writeFileSync(join(dataDir, "noop"), "");
});
