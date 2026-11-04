/**
 * Guided setup (non-technical onboarding): setup mode, preview → confirm,
 * per-environment keys, plain-language SEF errors.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRuntimeConfig } from "../src/env.js";
import { explainSefError } from "../src/sef/errors.js";
import { SefTools } from "../src/tools.js";

const company = {
  name: "Primer Usluge DOO",
  pib: "100000001",
  mb: "20000001",
  address: { street: "Primer ulica 1", city: "Beograd", postalCode: "11000", country: "RS" },
  bankAccount: "160-0000000000001-11",
  vatRegistered: false,
  notes: ["Izdavalac računa nije obveznik PDV-a u skladu sa članom 33. Zakona o PDV-u."],
};

const customer = {
  id: "kupac-a",
  name: "Kupac A DOO",
  pib: "100000002",
  address: { street: "Kupčeva 10", city: "Novi Sad", country: "RS" },
  unitCode: "HUR",
};

function fresh(env: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "sef-setup-"));
  const cfg = loadRuntimeConfig({ SEF_MCP_DATA_DIR: dir, ...env });
  return { tools: new SefTools(cfg, undefined), dir, cfg };
}

test("without a profile the server is in setup mode and says what to do", () => {
  const { tools, dir } = fresh();
  const s = tools.checkSetup();
  assert.equal(s.profileConfigured, false);
  assert.equal(s.profilePath, join(dir, "profile.json"));
  assert.throws(() => tools.listCustomers(), /sef_setup_company/);
});

test("company setup: preview writes nothing, confirm writes exactly the preview", () => {
  const { tools, cfg } = fresh();
  const preview = tools.setupCompany(company);
  assert.equal(preview.saved, false);
  assert.ok(!existsSync(cfg.profilePath));
  if (preview.saved) return;
  assert.equal(preview.profile.seller.defaultTax.category, "SS");
  assert.equal(preview.profile.seller.defaultTax.exemptionReasonCode, "PDV-RS-33");
  assert.ok(preview.warnings.some((w) => w.includes("knjigovođom")));

  assert.throws(() => tools.setupCompany({ ...company, confirmCode: "00000000" }), /confirmCode/);
  // Changing a value after the preview invalidates the code.
  assert.throws(() => tools.setupCompany({ ...company, name: "Drugo DOO", confirmCode: preview.confirmCode }), /confirmCode/);

  const saved = tools.setupCompany({ ...company, confirmCode: preview.confirmCode });
  assert.equal(saved.saved, true);
  assert.equal(JSON.parse(readFileSync(cfg.profilePath, "utf8")).seller.pib, "100000001");
  assert.equal(tools.checkSetup().profileConfigured, true);
});

test("adding a customer requires a company, validates, and keeps a backup", () => {
  const { tools, cfg } = fresh();
  assert.throws(() => tools.addCustomer(customer), /Prvo podesite firmu/);
  const p = tools.setupCompany(company);
  if (p.saved) throw new Error("unexpected");
  tools.setupCompany({ ...company, confirmCode: p.confirmCode });

  assert.throws(() => tools.addCustomer({ ...customer, pib: "123" }), /9 cifara/);
  const c = tools.addCustomer(customer);
  if (c.saved) throw new Error("unexpected");
  assert.deepEqual(c.changes, ['Novi kupac "kupac-a"']);
  const saved = tools.addCustomer({ ...customer, confirmCode: c.confirmCode });
  assert.equal(saved.saved, true);
  if (!saved.saved) return;
  assert.ok(saved.backup && existsSync(saved.backup));
  assert.equal(tools.listCustomers()[0]?.id, "kupac-a");
  assert.equal(tools.profile.customers[0]?.vatRegistered, true);
});

test("an invoice can be drafted right after guided setup, with no file editing", () => {
  const { tools } = fresh();
  const p = tools.setupCompany(company);
  if (p.saved) throw new Error("unexpected");
  tools.setupCompany({ ...company, confirmCode: p.confirmCode });
  const c = tools.addCustomer(customer);
  if (c.saved) throw new Error("unexpected");
  tools.addCustomer({ ...customer, confirmCode: c.confirmCode });
  const d = tools.draftInvoice({
    customer: "kupac-a",
    number: "PR-2026-001",
    issueDate: "2026-11-02",
    deliveryDate: "2026-10-31",
    lines: [{ name: "Konsultacije", quantity: "2", unitPrice: "5000.00" }],
  });
  const xml = readFileSync(d.xmlFile, "utf8");
  assert.equal(d.totals.payable, "10000.00");
  assert.match(xml, /unitCode="HUR"/);
  assert.match(xml, /PDV-RS-33/);
});

test("per-environment keys: demo and prod keys are picked by SEF_ENV", () => {
  assert.equal(loadRuntimeConfig({ SEF_API_KEY_DEMO: "demo-key-123", SEF_API_KEY_PROD: "prod-key-456" }).apiKey, "demo-key-123");
  assert.equal(
    loadRuntimeConfig({ SEF_ENV: "prod", SEF_API_KEY_DEMO: "demo-key-123", SEF_API_KEY_PROD: "prod-key-456" }).apiKey,
    "prod-key-456"
  );
  // An empty per-env key (extension field left blank) falls back to SEF_API_KEY.
  assert.equal(loadRuntimeConfig({ SEF_API_KEY_DEMO: "", SEF_API_KEY: "single-key-789" }).apiKey, "single-key-789");
  assert.equal(loadRuntimeConfig({ SEF_ENV: "prod", SEF_API_KEY_DEMO: "demo-key-123" }).apiKey, undefined);
});

test("known SEF errors get a plain-language explanation; unknown ones get none", () => {
  const ex = explainSefError('{"ErrorCode":"InvoiceDeliveryDateMissing"}', 400);
  assert.equal(ex.length, 1);
  assert.match(ex[0]!, /datum prometa/);
  assert.match(explainSefError("RS-R-005 Faktura treba da sadrži...", 400)[0]!, /Q9/);
  assert.match(explainSefError("Unauthorized", 401)[0]!, /SEF Administrator/);
  assert.deepEqual(explainSefError("SomethingNew", 400), []);
});
