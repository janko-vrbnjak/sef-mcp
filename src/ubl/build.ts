/**
 * UBL 2.1 Invoice builder for SEF (SRB-CIUS).
 *
 * Pure function: same input → byte-identical XML. No network, no clock.
 * Element order follows the UBL 2.1 XSD sequence; SEF rejects out-of-order XML.
 *
 * STATUS: v0.1 — structure follows SRB-CIUS, but must be checked against a
 * real invoice SEF has accepted (golden fixture) and against the demo
 * environment with executeValidation=true before production use.
 */
import type { Address, TaxRule } from "../profile.js";
import { formatAmount, lineAmount, parseDecimal, taxAmount, AMOUNT_SCALE } from "../money.js";
import { xmlEscape as e } from "../safety.js";

/**
 * SRB-CIUS customization identifier (BT-24), ITU 01.10.2026 §1.3.
 * The "#conformant#...srbdtext:2022" variant is only for invoices that use the
 * Serbian extension elements; this builder does not, so it uses the base value.
 */
export const SRB_CUSTOMIZATION_ID = "urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.rs:srbdt:2022";

/** Electronic address scheme for Serbian PIB. */
export const PIB_SCHEME_ID = "9948";

export interface UblParty {
  name: string;
  pib: string;
  mb?: string;
  jbkjs?: string;
  address: Address;
  email?: string;
  vatRegistered?: boolean;
}

export interface UblLine {
  name: string;
  description?: string;
  quantity: string; // decimal string, up to 4 decimals
  unitCode: string; // UN/ECE Rec 20
  unitPrice: string; // decimal string in document currency, up to 2 decimals
  tax: TaxRule;
}

export interface UblAttachment {
  id: string;
  filename: string;
  mimeCode: "application/pdf";
  base64: string;
}

export interface UblInvoiceInput {
  number: string;
  issueDate: string; // YYYY-MM-DD
  dueDate?: string;
  typeCode?: "380"; // commercial invoice (credit/debit notes: roadmap)
  currency: "RSD";
  vatPointDateCode: "3" | "35" | "432";
  periodStart?: string;
  periodEnd?: string;
  /** Datum prometa — mandatory since SEF 3.14 (error InvoiceDeliveryDateMissing). */
  deliveryDate: string;
  orderNumber?: string;
  contractNumber?: string;
  notes?: string[];
  seller: UblParty;
  buyer: UblParty;
  payeeAccount: string;
  paymentMeansCode: string;
  paymentReference?: string; // poziv na broj
  lines: UblLine[];
  attachments?: UblAttachment[];
}

export interface UblTotals {
  lineExtension: string;
  taxExclusive: string;
  tax: string;
  taxInclusive: string;
  payable: string;
  subtotals: Array<{ category: string; percent: string; taxable: string; tax: string; exemptionReasonCode?: string }>;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(label: string, v: string | undefined): void {
  if (v === undefined) return;
  if (!DATE_RE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) {
    throw new Error(`${label} must be a valid date in YYYY-MM-DD format (got "${v}")`);
  }
}

function normalizePercent(p: string): string {
  // "20" and "20.00" must group together; SEF expects plain numbers like 20 or 0
  const scaled = parseDecimal(p, 2, "percent");
  const whole = scaled / 100n;
  const frac = scaled % 100n;
  return frac === 0n ? whole.toString() : `${whole}.${frac.toString().padStart(2, "0").replace(/0$/, "")}`;
}

function bankAccountDigits(acc: string): string {
  // SEF expects the account without dashes, 18 digits: 3 + 13 (zero-padded) + 2
  const parts = acc.split("-");
  if (parts.length === 3) {
    const [bank, num, ctrl] = parts as [string, string, string];
    return `${bank}${num.padStart(13, "0")}${ctrl}`;
  }
  return acc.replace(/\D/g, "");
}

export function computeTotals(lines: UblLine[]): UblTotals {
  if (lines.length === 0) throw new Error("Invoice needs at least one line");
  let lineSum = 0n;
  const groups = new Map<string, { rule: TaxRule; percent: string; taxable: bigint }>();
  for (const l of lines) {
    const amt = lineAmount(l.quantity, l.unitPrice);
    lineSum += amt;
    const percent = normalizePercent(l.tax.percent);
    const key = `${l.tax.category}|${percent}|${l.tax.exemptionReasonCode ?? ""}`;
    const g = groups.get(key);
    if (g) g.taxable += amt;
    else groups.set(key, { rule: l.tax, percent, taxable: amt });
  }
  let taxSum = 0n;
  const subtotals: UblTotals["subtotals"] = [];
  for (const g of groups.values()) {
    const t = taxAmount(g.taxable, g.percent);
    taxSum += t;
    subtotals.push({
      category: g.rule.category,
      percent: g.percent,
      taxable: formatAmount(g.taxable),
      tax: formatAmount(t),
      ...(g.rule.exemptionReasonCode ? { exemptionReasonCode: g.rule.exemptionReasonCode } : {}),
    });
  }
  return {
    lineExtension: formatAmount(lineSum),
    taxExclusive: formatAmount(lineSum),
    tax: formatAmount(taxSum),
    taxInclusive: formatAmount(lineSum + taxSum),
    payable: formatAmount(lineSum + taxSum),
    subtotals,
  };
}

function partyXml(p: UblParty, role: "seller" | "buyer"): string {
  const ident = p.jbkjs
    ? `<cac:PartyIdentification><cbc:ID>JBKJS:${e(p.jbkjs)}</cbc:ID></cac:PartyIdentification>`
    : "";
  const taxScheme =
    role === "seller" || p.vatRegistered
      ? `<cac:PartyTaxScheme><cbc:CompanyID>RS${e(p.pib)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`
      : "";
  const legal = `<cac:PartyLegalEntity><cbc:RegistrationName>${e(p.name)}</cbc:RegistrationName>${
    p.mb ? `<cbc:CompanyID>${e(p.mb)}</cbc:CompanyID>` : ""
  }</cac:PartyLegalEntity>`;
  const contact = p.email ? `<cac:Contact><cbc:ElectronicMail>${e(p.email)}</cbc:ElectronicMail></cac:Contact>` : "";
  return (
    `<cac:Party>` +
    `<cbc:EndpointID schemeID="${PIB_SCHEME_ID}">${e(p.pib)}</cbc:EndpointID>` +
    ident +
    `<cac:PartyName><cbc:Name>${e(p.name)}</cbc:Name></cac:PartyName>` +
    `<cac:PostalAddress><cbc:StreetName>${e(p.address.street)}</cbc:StreetName><cbc:CityName>${e(
      p.address.city
    )}</cbc:CityName><cbc:PostalZone>${e(p.address.postalCode)}</cbc:PostalZone><cac:Country><cbc:IdentificationCode>${e(
      p.address.country
    )}</cbc:IdentificationCode></cac:Country></cac:PostalAddress>` +
    taxScheme +
    legal +
    contact +
    `</cac:Party>`
  );
}

function taxCategoryXml(category: string, percent: string, reasonCode?: string, reasonText?: string): string {
  return (
    `<cac:TaxCategory><cbc:ID>${e(category)}</cbc:ID><cbc:Percent>${e(percent)}</cbc:Percent>` +
    (reasonCode ? `<cbc:TaxExemptionReasonCode>${e(reasonCode)}</cbc:TaxExemptionReasonCode>` : "") +
    (reasonText ? `<cbc:TaxExemptionReason>${e(reasonText)}</cbc:TaxExemptionReason>` : "") +
    `<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>`
  );
}

export function buildInvoiceXml(input: UblInvoiceInput): { xml: string; totals: UblTotals } {
  assertDate("issueDate", input.issueDate);
  assertDate("dueDate", input.dueDate);
  assertDate("periodStart", input.periodStart);
  assertDate("periodEnd", input.periodEnd);
  assertDate("deliveryDate", input.deliveryDate);
  if (!input.number.trim()) throw new Error("Invoice number is required");
  for (const l of input.lines) {
    if (l.tax.category !== "S" && !["Z", "O"].includes(l.tax.category) && !l.tax.exemptionReasonCode) {
      throw new Error(`Line "${l.name}": tax category ${l.tax.category} requires an exemptionReasonCode`);
    }
    if (parseDecimal(l.quantity, 4, "quantity") === 0n) throw new Error(`Line "${l.name}": quantity must be > 0`);
  }

  const totals = computeTotals(input.lines);
  const cur = e(input.currency);
  const amt = (v: string) => `currencyID="${cur}">${v}`;

  const reasonTexts = new Map<string, string | undefined>();
  for (const l of input.lines) {
    const key = `${l.tax.category}|${normalizePercent(l.tax.percent)}|${l.tax.exemptionReasonCode ?? ""}`;
    if (!reasonTexts.has(key)) reasonTexts.set(key, l.tax.exemptionReasonText);
  }

  const parts: string[] = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(
    `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" ` +
      `xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" ` +
      `xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">`
  );
  parts.push(`<cbc:CustomizationID>${SRB_CUSTOMIZATION_ID}</cbc:CustomizationID>`);
  parts.push(`<cbc:ID>${e(input.number)}</cbc:ID>`);
  parts.push(`<cbc:IssueDate>${input.issueDate}</cbc:IssueDate>`);
  if (input.dueDate) parts.push(`<cbc:DueDate>${input.dueDate}</cbc:DueDate>`);
  parts.push(`<cbc:InvoiceTypeCode>${input.typeCode ?? "380"}</cbc:InvoiceTypeCode>`);
  for (const n of input.notes ?? []) parts.push(`<cbc:Note>${e(n)}</cbc:Note>`);
  parts.push(`<cbc:DocumentCurrencyCode>${cur}</cbc:DocumentCurrencyCode>`);
  // SEF 3.14: DescriptionCode (BT-8) is required when lines use standard-rated VAT (S10/S20)
  // and rejected otherwise (InvoicePeriodDescriptionCodeNotNeeded).
  const needsVatPointCode = input.lines.some((l) => l.tax.category === "S");
  if (input.periodStart || input.periodEnd || needsVatPointCode) {
    parts.push(
      `<cac:InvoicePeriod>` +
        (input.periodStart ? `<cbc:StartDate>${input.periodStart}</cbc:StartDate>` : "") +
        (input.periodEnd ? `<cbc:EndDate>${input.periodEnd}</cbc:EndDate>` : "") +
        (needsVatPointCode ? `<cbc:DescriptionCode>${input.vatPointDateCode}</cbc:DescriptionCode>` : "") +
        `</cac:InvoicePeriod>`
    );
  }
  if (input.orderNumber) parts.push(`<cac:OrderReference><cbc:ID>${e(input.orderNumber)}</cbc:ID></cac:OrderReference>`);
  if (input.contractNumber)
    parts.push(`<cac:ContractDocumentReference><cbc:ID>${e(input.contractNumber)}</cbc:ID></cac:ContractDocumentReference>`);
  for (const a of input.attachments ?? []) {
    parts.push(
      `<cac:AdditionalDocumentReference><cbc:ID>${e(a.id)}</cbc:ID><cac:Attachment>` +
        `<cbc:EmbeddedDocumentBinaryObject mimeCode="${a.mimeCode}" filename="${e(a.filename)}">${a.base64}</cbc:EmbeddedDocumentBinaryObject>` +
        `</cac:Attachment></cac:AdditionalDocumentReference>`
    );
  }
  parts.push(`<cac:AccountingSupplierParty>${partyXml(input.seller, "seller")}</cac:AccountingSupplierParty>`);
  parts.push(`<cac:AccountingCustomerParty>${partyXml(input.buyer, "buyer")}</cac:AccountingCustomerParty>`);
  if (!input.deliveryDate) throw new Error("deliveryDate (datum prometa) is required since SEF 3.14");
  parts.push(`<cac:Delivery><cbc:ActualDeliveryDate>${input.deliveryDate}</cbc:ActualDeliveryDate></cac:Delivery>`);
  parts.push(
    `<cac:PaymentMeans><cbc:PaymentMeansCode>${e(input.paymentMeansCode)}</cbc:PaymentMeansCode>` +
      (input.paymentReference ? `<cbc:PaymentID>${e(input.paymentReference)}</cbc:PaymentID>` : "") +
      `<cac:PayeeFinancialAccount><cbc:ID>${e(bankAccountDigits(input.payeeAccount))}</cbc:ID></cac:PayeeFinancialAccount></cac:PaymentMeans>`
  );
  parts.push(`<cac:TaxTotal><cbc:TaxAmount ${amt(totals.tax)}</cbc:TaxAmount>`);
  for (const s of totals.subtotals) {
    const reason = reasonTexts.get(`${s.category}|${s.percent}|${s.exemptionReasonCode ?? ""}`);
    parts.push(
      `<cac:TaxSubtotal><cbc:TaxableAmount ${amt(s.taxable)}</cbc:TaxableAmount><cbc:TaxAmount ${amt(s.tax)}</cbc:TaxAmount>` +
        taxCategoryXml(s.category, s.percent, s.exemptionReasonCode, reason) +
        `</cac:TaxSubtotal>`
    );
  }
  parts.push(`</cac:TaxTotal>`);
  parts.push(
    `<cac:LegalMonetaryTotal>` +
      `<cbc:LineExtensionAmount ${amt(totals.lineExtension)}</cbc:LineExtensionAmount>` +
      `<cbc:TaxExclusiveAmount ${amt(totals.taxExclusive)}</cbc:TaxExclusiveAmount>` +
      `<cbc:TaxInclusiveAmount ${amt(totals.taxInclusive)}</cbc:TaxInclusiveAmount>` +
      `<cbc:AllowanceTotalAmount ${amt(formatAmount(0n))}</cbc:AllowanceTotalAmount>` +
      `<cbc:PrepaidAmount ${amt(formatAmount(0n))}</cbc:PrepaidAmount>` +
      `<cbc:PayableAmount ${amt(totals.payable)}</cbc:PayableAmount>` +
      `</cac:LegalMonetaryTotal>`
  );
  input.lines.forEach((l, i) => {
    const la = formatAmount(lineAmount(l.quantity, l.unitPrice));
    const price = formatAmount(parseDecimal(l.unitPrice, AMOUNT_SCALE, "unitPrice"));
    parts.push(
      `<cac:InvoiceLine><cbc:ID>${i + 1}</cbc:ID>` +
        `<cbc:InvoicedQuantity unitCode="${e(l.unitCode)}">${e(l.quantity)}</cbc:InvoicedQuantity>` +
        `<cbc:LineExtensionAmount ${amt(la)}</cbc:LineExtensionAmount>` +
        `<cac:Item>` +
        (l.description ? `<cbc:Description>${e(l.description)}</cbc:Description>` : "") +
        `<cbc:Name>${e(l.name)}</cbc:Name>` +
        `<cac:ClassifiedTaxCategory><cbc:ID>${e(l.tax.category)}</cbc:ID><cbc:Percent>${e(
          normalizePercent(l.tax.percent)
        )}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>` +
        `</cac:Item>` +
        `<cac:Price><cbc:PriceAmount ${amt(price)}</cbc:PriceAmount></cac:Price>` +
        `</cac:InvoiceLine>`
    );
  });
  parts.push(`</Invoice>`);
  return { xml: parts.join("\n"), totals };
}
