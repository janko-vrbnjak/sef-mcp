/**
 * SEF release rules (baseline 4.2.0). Each test names the release that introduced the rule.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildInvoiceXml, type UblInvoiceInput, type UblLine } from "../src/ubl/build.js";
import { taxRuleProblem } from "../src/ubl/rules.js";
import { parseProfile } from "../src/profile.js";

const addr = { street: "Ulica 1", city: "Beograd", postalCode: "11000", country: "RS" };
const exempt = { category: "SS", percent: "0", exemptionReasonCode: "PDV-RS-33" };

function inv(lines: UblLine[]): UblInvoiceInput {
  return {
    number: "PR-2026-001",
    issueDate: "2026-11-02",
    deliveryDate: "2026-10-31",
    currency: "RSD",
    vatPointDateCode: "35",
    seller: { name: "Primer DOO", pib: "100000001", mb: "20000001", address: addr, vatRegistered: false },
    buyer: { name: "Kupac DOO", pib: "100000002", address: addr },
    payeeAccount: "160-1-11",
    paymentMeansCode: "30",
    lines,
  };
}
const line = (over: Partial<UblLine> = {}): UblLine => ({ name: "Usluga", quantity: "1", unitCode: "HUR", unitPrice: "100.00", tax: exempt, ...over });

test("3.15.0 VATCategoryNotAllowed: unknown tax category is rejected", () => {
  assert.match(taxRuleProblem({ category: "XX", percent: "0" })!, /VATCategoryNotAllowed/);
  assert.throws(() => buildInvoiceXml(inv([line({ tax: { category: "XX", percent: "0" } })])), /not supported by SEF/);
});

test("3.16.0 UBLTaxCategoryPercentNotAllowed: only category S may have a rate", () => {
  assert.match(taxRuleProblem({ category: "SS", percent: "20", exemptionReasonCode: "PDV-RS-33" })!, /UBLTaxCategoryPercentNotAllowed/);
  assert.match(taxRuleProblem({ category: "S", percent: "0" })!, /greater than 0/);
  assert.equal(taxRuleProblem({ category: "S", percent: "20" }), undefined);
  assert.equal(taxRuleProblem({ category: "S", percent: "10" }), undefined);
  assert.equal(taxRuleProblem(exempt), undefined);
});

test("3.16.0 UBLNoItemsWithTaxSubtotalTaxCategory: every subtotal category exists on a line", () => {
  const { xml } = buildInvoiceXml(
    inv([line(), line({ name: "Roba", tax: { category: "S", percent: "20" } })])
  );
  const subtotalCats = [...xml.matchAll(/<cac:TaxSubtotal>.*?<cac:TaxCategory><cbc:ID>([^<]+)</g)].map((m) => m[1]);
  const lineCats = new Set([...xml.matchAll(/<cac:ClassifiedTaxCategory><cbc:ID>([^<]+)</g)].map((m) => m[1]));
  assert.deepEqual(subtotalCats.sort(), ["S", "SS"]);
  for (const c of subtotalCats) assert.ok(lineCats.has(c!));
});

test("3.17.1: withdrawn exemption code PDV-RS-36b-6 points to its replacement", () => {
  assert.match(taxRuleProblem({ category: "AE", percent: "0", exemptionReasonCode: "PDV-RS-36b-6" })!, /PDV-RS-10-2-4a/);
});

test("4.0.0: quantity and unit price must be positive", () => {
  assert.throws(() => buildInvoiceXml(inv([line({ unitPrice: "0" })])), /unit price must be > 0/);
  assert.throws(() => buildInvoiceXml(inv([line({ quantity: "0" })])), /quantity must be > 0/);
  assert.throws(() => buildInvoiceXml(inv([line({ unitPrice: "-5.00" })])), /non-negative decimal/);
});

test("4.0.0: category N (negative amounts) is refused until reduction documents are supported", () => {
  assert.match(taxRuleProblem({ category: "N", percent: "0", exemptionReasonCode: "X" })!, /4\.0\.0/);
});

test("4.0.0: a line without a unit of measure is rejected", () => {
  assert.throws(() => buildInvoiceXml(inv([line({ unitCode: "" })])), /unit of measure is required/);
  assert.throws(() => buildInvoiceXml(inv([line({ unitCode: "hour" })])), /unit of measure is required/);
});

test("profile tax rules are checked against the same SEF rules", () => {
  const example = JSON.parse(readFileSync(new URL("../../examples/profile.example.json", import.meta.url), "utf8"));
  const bad = structuredClone(example);
  bad.seller.defaultTax = { category: "SS", percent: "20", exemptionReasonCode: "PDV-RS-33" };
  assert.throws(() => parseProfile(bad), /seller\.defaultTax: .*UBLTaxCategoryPercentNotAllowed/);
  const badCustomer = structuredClone(example);
  badCustomer.customers[0].defaults.tax = { category: "E", percent: "0" };
  assert.throws(() => parseProfile(badCustomer), /customers\.kupac-a\.defaults\.tax: .*requires an exemptionReasonCode/);
});
