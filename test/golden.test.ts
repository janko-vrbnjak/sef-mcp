/**
 * Golden test: the builder must reproduce the structure of an invoice that SEF
 * itself produced in production — created in the SEF web portal and exported as
 * UBL (anonymised in test/fixtures). It was not uploaded through the API.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildInvoiceXml, type UblInvoiceInput } from "../src/ubl/build.js";

const fixture = readFileSync(new URL("../../test/fixtures/accepted-non-vat-services.xml", import.meta.url), "utf8");

/** Elements SEF accepted that we intentionally do not emit (optional in SRB-CIUS). */
const FIXTURE_ONLY = new Set(["PayableRoundingAmount"]);

function elementPaths(xml: string): string[] {
  const body = xml.slice(xml.indexOf("<Invoice"));
  const out: string[] = [];
  const stack: string[] = [];
  const re = /<(\/?)(?:[a-zA-Z]+:)?([A-Za-z]+)([^>]*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const [, close, name, , selfClose] = m as unknown as [string, string, string, string, string];
    if (close) {
      stack.pop();
      continue;
    }
    stack.push(name);
    out.push(stack.join("/"));
    if (selfClose) stack.pop();
  }
  return out;
}

function values(xml: string, tag: string): string[] {
  const re = new RegExp(`<cbc:${tag}(?:\\s[^>]*)?>([^<]*)</cbc:${tag}>`, "g");
  return [...xml.matchAll(re)].map((m) => (m[1] ?? "").trim());
}

const num = (v: string) => Number(v).toFixed(2);

const input: UblInvoiceInput = {
  number: "PR-2026-001",
  issueDate: "2026-10-01",
  dueDate: "2026-10-10",
  deliveryDate: "2026-09-30",
  currency: "RSD",
  vatPointDateCode: "35",
  notes: [
    "Izdavalac računa nije obveznik PDV-a u skladu sa članom 33. Zakona o PDV-u.",
    "Po Ugovoru o poslovnoj saradnji, potpisanom 01.01.2026. godine.",
  ],
  orderNumber: "PR-2026-001",
  contractNumber: "Ugovor potpisan 01.01.2026.",
  attachments: [
    { id: "Specifikacija PR-2026-001", filename: "Specifikacija PR-2026-001", mimeCode: "application/pdf", base64: "JVBERi0xLjQK" },
    { id: "PR-2026-001", filename: "PR-2026-001", mimeCode: "application/pdf", base64: "JVBERi0xLjQK" },
  ],
  seller: {
    name: "PRIMER USLUGE DOO BEOGRAD",
    pib: "100000001",
    mb: "20000001",
    address: { street: "PRIMER ULICA 1", city: "Beograd", postalCode: "11000", country: "RS" },
    email: "fakture@primer.rs",
    vatRegistered: false,
  },
  buyer: {
    name: "KUPAC A DOO NOVI SAD",
    pib: "100000002",
    mb: "20000002",
    address: { street: "Kupčeva 10", city: "Novi Sad", country: "RS" },
    email: "racuni@kupac-a.rs",
    vatRegistered: true,
  },
  payeeAccount: "160-0000000000001-11",
  paymentMeansCode: "30",
  lines: [
    { name: "Mesečna paušalna usluga", quantity: "1", unitCode: "MON", unitPrice: "100000.00", tax: { category: "SS", percent: "0", exemptionReasonCode: "PDV-RS-33" } },
    { name: "Dodatni angažman po satu", quantity: "2", unitCode: "HUR", unitPrice: "5000.00", tax: { category: "SS", percent: "0", exemptionReasonCode: "PDV-RS-33" } },
  ],
};

test("golden: element structure and order match the SEF-accepted invoice", () => {
  const { xml } = buildInvoiceXml(input);
  const expected = elementPaths(fixture).filter((p) => !FIXTURE_ONLY.has(p.split("/").pop()!));
  assert.deepEqual(elementPaths(xml), expected);
});

test("golden: key values match the SEF-accepted invoice", () => {
  const { xml } = buildInvoiceXml(input);
  for (const tag of ["CustomizationID", "ID", "IssueDate", "DueDate", "InvoiceTypeCode", "Note", "DocumentCurrencyCode", "EndpointID", "CompanyID", "Name", "RegistrationName", "StreetName", "CityName", "PostalZone", "IdentificationCode", "ActualDeliveryDate", "PaymentMeansCode", "TaxExemptionReasonCode", "Percent", "ElectronicMail"]) {
    assert.deepEqual(values(xml, tag), values(fixture, tag), `cbc:${tag}`);
  }
  for (const tag of ["TaxAmount", "TaxableAmount", "LineExtensionAmount", "TaxExclusiveAmount", "TaxInclusiveAmount", "AllowanceTotalAmount", "PrepaidAmount", "PayableAmount", "PriceAmount", "InvoicedQuantity"]) {
    assert.deepEqual(values(xml, tag).map(num), values(fixture, tag).map(num), `cbc:${tag}`);
  }
  assert.deepEqual([...xml.matchAll(/unitCode="([^"]+)"/g)].map((m) => m[1]), ["MON", "HUR"]);
});
