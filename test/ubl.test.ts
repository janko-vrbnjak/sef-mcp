import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInvoiceXml, computeTotals, type UblInvoiceInput } from "../src/ubl/build.js";

const addr = { street: "Ulica 1", city: "Beograd", postalCode: "11000", country: "RS" };
const exempt = { category: "SS", percent: "0", exemptionReasonCode: "PDV-RS-33" };

function base(over: Partial<UblInvoiceInput> = {}): UblInvoiceInput {
  return {
    number: "PR-2026-001",
    issueDate: "2026-11-02",
    dueDate: "2026-11-17",
    deliveryDate: "2026-10-31",
    currency: "RSD",
    vatPointDateCode: "35",
    seller: { name: "Primer & Sinovi DOO", pib: "100000001", mb: "20000001", address: addr, vatRegistered: false },
    buyer: { name: "Kupac A DOO", pib: "100000002", mb: "20000002", address: addr },
    payeeAccount: "160-1-11",
    paymentMeansCode: "30",
    lines: [{ name: "Usluge programiranja", quantity: "10", unitCode: "HUR", unitPrice: "5000.00", tax: exempt }],
    ...over,
  };
}

test("non-VAT invoice: SS / 0% / PDV-RS-33, totals equal net", () => {
  const { xml, totals } = buildInvoiceXml(base());
  assert.equal(totals.payable, "50000.00");
  assert.equal(totals.tax, "0.00");
  assert.match(xml, /<cbc:ID>SS<\/cbc:ID><cbc:Percent>0<\/cbc:Percent><cbc:TaxExemptionReasonCode>PDV-RS-33<\/cbc:TaxExemptionReasonCode>/);
  assert.match(xml, /<cbc:EndpointID schemeID="9948">100000002<\/cbc:EndpointID>/);
  assert.match(xml, /<cbc:ActualDeliveryDate>2026-10-31<\/cbc:ActualDeliveryDate>/);
  // SEF 3.14: no VAT point code when no line is standard-rated (InvoicePeriodDescriptionCodeNotNeeded)
  assert.ok(!xml.includes("<cbc:DescriptionCode>"));
  assert.ok(!xml.includes("<cac:InvoicePeriod>"));
  assert.ok(xml.includes("<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.rs:srbdt:2022</cbc:CustomizationID>"));
});

test("standard-rated invoice carries the VAT point date code", () => {
  const { xml } = buildInvoiceXml(
    base({ lines: [{ name: "Roba", quantity: "1", unitCode: "H87", unitPrice: "100.00", tax: { category: "S", percent: "20" } }] })
  );
  assert.match(xml, /<cac:InvoicePeriod><cbc:DescriptionCode>35<\/cbc:DescriptionCode><\/cac:InvoicePeriod>/);
});

test("period dates without VAT point code for exempt invoices", () => {
  const { xml } = buildInvoiceXml(base({ periodStart: "2026-10-01", periodEnd: "2026-10-31" }));
  assert.match(xml, /<cac:InvoicePeriod><cbc:StartDate>2026-10-01<\/cbc:StartDate><cbc:EndDate>2026-10-31<\/cbc:EndDate><\/cac:InvoicePeriod>/);
});

test("buyer outside VAT gets no PartyTaxScheme; missing postal code is omitted", () => {
  const { xml } = buildInvoiceXml(
    base({ buyer: { name: "Kupac B", pib: "100000003", address: { street: "Ulica 2", city: "Niš", country: "RS" }, vatRegistered: false } })
  );
  assert.ok(!xml.includes("RS100000003"));
  const buyer = xml.slice(xml.indexOf("<cac:AccountingCustomerParty>"), xml.indexOf("</cac:AccountingCustomerParty>"));
  assert.ok(!buyer.includes("<cbc:PostalZone>"));
  assert.match(xml, /<cbc:CompanyID>RS100000001<\/cbc:CompanyID>/); // seller outside VAT still carries RS{PIB} (as accepted by SEF)
});

test("XML special characters are escaped", () => {
  const { xml } = buildInvoiceXml(base());
  assert.ok(xml.includes("Primer &amp; Sinovi DOO"));
  assert.ok(!xml.includes("Primer & Sinovi"));
});

test("bank account normalised to 18 digits", () => {
  const { xml } = buildInvoiceXml(base());
  assert.match(xml, /<cac:PayeeFinancialAccount><cbc:ID>160000000000000111<\/cbc:ID>/);
});

test("deterministic output", () => {
  assert.equal(buildInvoiceXml(base()).xml, buildInvoiceXml(base()).xml);
});

test("element order: header → parties → payment → tax → totals → lines", () => {
  const { xml } = buildInvoiceXml(base({ contractNumber: "UG-1", periodStart: "2026-10-01", periodEnd: "2026-10-31" }));
  const order = [
    "<cbc:CustomizationID>",
    "<cbc:IssueDate>",
    "<cbc:DueDate>",
    "<cbc:InvoiceTypeCode>",
    "<cbc:DocumentCurrencyCode>",
    "<cac:InvoicePeriod>",
    "<cac:ContractDocumentReference>",
    "<cac:AccountingSupplierParty>",
    "<cac:AccountingCustomerParty>",
    "<cac:Delivery>",
    "<cac:PaymentMeans>",
    "<cac:TaxTotal>",
    "<cac:LegalMonetaryTotal>",
    "<cac:InvoiceLine>",
  ].map((t) => xml.indexOf(t));
  assert.ok(order.every((v) => v >= 0), "all elements present");
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test("VAT 20% groups lines per category", () => {
  const vat = { category: "S", percent: "20" };
  const t = computeTotals([
    { name: "A", quantity: "1", unitCode: "H87", unitPrice: "100.00", tax: vat },
    { name: "B", quantity: "2", unitCode: "H87", unitPrice: "50.00", tax: { category: "S", percent: "20.00" } },
  ]);
  assert.equal(t.subtotals.length, 1);
  assert.equal(t.tax, "40.00");
  assert.equal(t.payable, "240.00");
});

test("exempt category without reason code is rejected", () => {
  assert.throws(
    () => buildInvoiceXml(base({ lines: [{ name: "X", quantity: "1", unitCode: "H87", unitPrice: "1.00", tax: { category: "SS", percent: "0" } }] })),
    /requires an exemptionReasonCode/
  );
});

test("invalid dates are rejected", () => {
  assert.throws(() => buildInvoiceXml(base({ issueDate: "02.11.2026" })), /YYYY-MM-DD/);
});
