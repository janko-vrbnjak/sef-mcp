/**
 * Tool logic, independent of the MCP SDK so it can be unit-tested and reused
 * (CLI, future HTTP transport).
 */
import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { z } from "zod";
import { assertWriteAllowed, type RuntimeConfig } from "./env.js";
import { findCustomer, TaxRuleSchema, type Profile } from "./profile.js";
import { resolveInside } from "./safety.js";
import { SefClient, type SendToCir } from "./sef/client.js";
import { Store } from "./store.js";
import { buildInvoiceXml, type UblAttachment, type UblLine } from "./ubl/build.js";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const decimalStr = z.string().regex(/^\d+(\.\d+)?$/, "decimal string with a dot, e.g. \"12.50\"");

export const DraftInvoiceInput = {
  customer: z.string().describe("Customer id or PIB from the profile"),
  number: z.string().min(1).describe("Invoice number exactly as it should appear on the invoice"),
  issueDate: dateStr.describe("Issue date, YYYY-MM-DD"),
  dueDate: dateStr.optional().describe("Due date; defaults to issueDate + paymentDueDays"),
  periodStart: dateStr.optional(),
  periodEnd: dateStr.optional(),
  deliveryDate: dateStr
    .optional()
    .describe("Datum prometa (mandatory on SEF since 3.14). Defaults to periodEnd, else issueDate — confirm with the user."),
  contractNumber: z.string().optional(),
  orderNumber: z.string().optional(),
  paymentReference: z.string().optional().describe("Poziv na broj"),
  notes: z.array(z.string().max(1000)).max(10).optional().describe("Extra notes, added after profile and customer default notes"),
  sendToCir: z.enum(["Yes", "No"]).optional(),
  lines: z
    .array(
      z.object({
        name: z.string().min(1).max(500),
        description: z.string().max(1000).optional(),
        quantity: decimalStr,
        unitPrice: decimalStr.describe("Unit price in RSD, without VAT"),
        unitCode: z
          .string()
          .regex(/^[A-Z0-9]{2,3}$/)
          .optional()
          .describe("UN/ECE Rec 20, e.g. H87 (piece), HUR (hour), MON (month). Defaults: customer → profile."),
        tax: TaxRuleSchema.optional().describe("Override; defaults to customer or seller default"),
      })
    )
    .min(1)
    .max(200),
  attachments: z
    .array(z.string())
    .max(10)
    .optional()
    .describe("PDF file paths relative to SEF_MCP_ATTACHMENTS_DIR (limit SEF_MCP_MAX_ATTACHMENTS, default 2)"),
};

const DraftInvoiceSchema = z.object(DraftInvoiceInput);
export type DraftInvoiceArgs = z.infer<typeof DraftInvoiceSchema>;

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export class SefTools {
  readonly store: Store;
  private client: SefClient | undefined;

  constructor(
    readonly cfg: RuntimeConfig,
    readonly profile: Profile,
    clientOverride?: SefClient,
    private readonly now: () => Date = () => new Date()
  ) {
    this.store = new Store(cfg.dataDir);
    this.client = clientOverride;
  }

  /** Today's date in Serbia (SEF works in Europe/Belgrade), YYYY-MM-DD. */
  private today(): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade" }).format(this.now());
  }

  private sef(): SefClient {
    if (!this.client) {
      if (!this.cfg.apiKey) throw new Error("SEF_API_KEY is not set. See docs/setup.md.");
      this.client = new SefClient({ env: this.cfg.env, apiKey: this.cfg.apiKey, timeoutMs: this.cfg.requestTimeoutMs });
    }
    return this.client;
  }

  checkSetup() {
    const p = this.profile;
    return {
      environment: this.cfg.env,
      apiKeyConfigured: Boolean(this.cfg.apiKey),
      readOnly: this.cfg.readOnly,
      prodWritesEnabled: this.cfg.env === "prod" && this.cfg.allowProdWrite,
      dataDir: this.cfg.dataDir,
      attachmentsDir: this.cfg.attachmentsDir ?? null,
      seller: { name: p.seller.name, pib: p.seller.pib, vatRegistered: p.seller.vatRegistered, defaultTax: p.seller.defaultTax },
      customers: p.customers.length,
    };
  }

  async ping() {
    const reasons = await this.sef().vatExemptionReasons();
    return { reachable: true, environment: this.cfg.env, exemptionReasonCount: Array.isArray(reasons) ? reasons.length : null };
  }

  listCustomers() {
    return this.profile.customers.map((c) => ({ id: c.id, name: c.name, pib: c.pib, defaults: c.defaults }));
  }

  vatExemptionReasons() {
    return this.sef().vatExemptionReasons();
  }

  unitMeasures() {
    return this.sef().unitMeasures();
  }

  private loadAttachments(paths: string[] | undefined): UblAttachment[] {
    if (!paths?.length) return [];
    if (!this.cfg.attachmentsDir) throw new Error("Attachments require SEF_MCP_ATTACHMENTS_DIR to be set.");
    if (paths.length > this.cfg.maxAttachments) {
      throw new Error(`Too many attachments: ${paths.length} (max ${this.cfg.maxAttachments}, SEF_MCP_MAX_ATTACHMENTS).`);
    }
    const usedIds = new Set<string>();
    return paths.map((p, i) => {
      const real = resolveInside(this.cfg.attachmentsDir!, p);
      if (!real.toLowerCase().endsWith(".pdf")) throw new Error(`Only PDF attachments are allowed: ${p}`);
      const size = statSync(real).size;
      if (size > this.cfg.maxAttachmentBytes) throw new Error(`Attachment too large (${size} bytes): ${p}`);
      const buf = readFileSync(real);
      if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error(`Not a PDF file: ${p}`);
      // Document reference ID = file name without extension (as SEF shows it), made unique if repeated.
      let id = basename(real).replace(/\.pdf$/i, "") || `Prilog ${i + 1}`;
      if (usedIds.has(id)) id = `${id} (${i + 1})`;
      usedIds.add(id);
      return { id, filename: basename(real), mimeCode: "application/pdf" as const, base64: buf.toString("base64") };
    });
  }

  draftInvoice(rawArgs: DraftInvoiceArgs) {
    const args = DraftInvoiceSchema.parse(rawArgs);
    const p = this.profile;
    const customer = findCustomer(p, args.customer);
    if (!customer) throw new Error(`Unknown customer "${args.customer}". Add it to the profile first.`);

    if (p.invoiceDefaults.numberPattern && !new RegExp(p.invoiceDefaults.numberPattern).test(args.number)) {
      throw new Error(`Invoice number "${args.number}" does not match profile pattern ${p.invoiceDefaults.numberPattern}`);
    }
    const sent = this.store.sentNumbers(this.cfg.env);
    const warnings: string[] = [];
    if (sent.has(args.number)) {
      warnings.push(`Invoice number ${args.number} was already sent successfully in ${this.cfg.env} (per local audit log).`);
    }

    const defaultTax = customer.defaults.tax ?? p.seller.defaultTax;
    const lines: UblLine[] = args.lines.map((l) => ({
      name: l.name,
      ...(l.description ? { description: l.description } : {}),
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      unitCode: l.unitCode ?? customer.defaults.unitCode ?? p.invoiceDefaults.unitCode,
      tax: l.tax ?? defaultTax,
    }));
    if (!p.seller.vatRegistered && lines.some((l) => l.tax.category === "S")) {
      throw new Error("Seller is not VAT registered but a line uses category S.");
    }

    const deliveryDate = args.deliveryDate ?? args.periodEnd ?? args.issueDate;
    if (!args.deliveryDate) {
      warnings.push(
        `deliveryDate (datum prometa) not given — using ${deliveryDate} (${args.periodEnd ? "periodEnd" : "issueDate"}). Confirm with the user.`
      );
    }
    const today = this.today();
    if (deliveryDate > today) {
      warnings.push(`deliveryDate ${deliveryDate} is in the future; SEF 3.14 rejects future VAT obligation dates.`);
    }

    const dueDays = customer.defaults.paymentDueDays ?? p.invoiceDefaults.paymentDueDays;
    const { xml, totals } = buildInvoiceXml({
      number: args.number,
      issueDate: args.issueDate,
      dueDate: args.dueDate ?? addDays(args.issueDate, dueDays),
      currency: p.invoiceDefaults.currency,
      vatPointDateCode: p.invoiceDefaults.vatPointDateCode,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      deliveryDate,
      orderNumber: args.orderNumber ?? customer.defaults.orderNumber,
      contractNumber: args.contractNumber ?? customer.defaults.contractNumber,
      notes: [...p.invoiceDefaults.notes, ...(customer.defaults.notes ?? []), ...(args.notes ?? [])],
      seller: { ...p.seller, vatRegistered: p.seller.vatRegistered },
      buyer: {
        name: customer.name,
        pib: customer.pib,
        mb: customer.mb,
        jbkjs: customer.jbkjs,
        address: customer.address,
        email: customer.email,
        vatRegistered: customer.vatRegistered,
      },
      payeeAccount: p.seller.bankAccount,
      paymentMeansCode: p.invoiceDefaults.paymentMeansCode,
      paymentReference: args.paymentReference,
      lines,
      attachments: this.loadAttachments(args.attachments),
    });

    const sendToCir: SendToCir = args.sendToCir ?? customer.defaults.sendToCir ?? (customer.jbkjs ? "Yes" : "No");
    const draft = this.store.saveDraft(
      { invoiceNumber: args.number, customerId: customer.id, buyerName: customer.name, buyerPib: customer.pib, sendToCir, totals },
      xml
    );
    this.store.audit({ action: "draft", env: this.cfg.env, draftId: draft.draftId, invoiceNumber: args.number, sha256: draft.sha256 });
    return {
      draftId: draft.draftId,
      approvalCode: draft.approvalCode,
      environment: this.cfg.env,
      invoiceNumber: args.number,
      buyer: `${customer.name} (PIB ${customer.pib})`,
      sendToCir,
      totals,
      xmlFile: draft.xmlFile,
      warnings,
      next:
        "Show this summary to the user. Only if they explicitly approve THIS draft, call sef_send_invoice with draftId and approvalCode.",
    };
  }

  getDraft(draftId: string, includeXml = false) {
    const { draft, xml } = this.store.loadDraft(draftId);
    return includeXml ? { ...draft, xml } : draft;
  }

  async sendInvoice(draftId: string, approvalCode: string) {
    assertWriteAllowed(this.cfg, "send_invoice");
    const { draft, xml } = this.store.loadDraft(draftId);
    if (approvalCode.trim().toLowerCase() !== draft.approvalCode) {
      throw new Error("approvalCode does not match this draft. Re-read the draft and ask the user to approve it.");
    }
    try {
      const result = await this.sef().uploadUbl(xml, draft.requestId, draft.sendToCir, true);
      this.store.audit({ action: "send", ok: true, env: this.cfg.env, draftId, invoiceNumber: draft.invoiceNumber, requestId: draft.requestId, result });
      return { sent: true, environment: this.cfg.env, invoiceNumber: draft.invoiceNumber, requestId: draft.requestId, sef: result };
    } catch (err) {
      this.store.audit({ action: "send", ok: false, env: this.cfg.env, draftId, invoiceNumber: draft.invoiceNumber, requestId: draft.requestId, error: (err as Error).message, body: (err as { body?: string }).body });
      throw err;
    }
  }

  getInvoice(invoiceId: number) {
    return this.sef().getSalesInvoice(invoiceId);
  }

  listInvoiceIds(status: string, dateFrom: string, dateTo: string) {
    return this.sef().salesInvoiceIds(status, dateFrom, dateTo);
  }

  async cancelInvoice(invoiceId: number, comment: string) {
    assertWriteAllowed(this.cfg, "cancel_invoice");
    try {
      const result = await this.sef().cancel(invoiceId, comment);
      this.store.audit({ action: "cancel", ok: true, env: this.cfg.env, invoiceId, result });
      return { cancelled: true, environment: this.cfg.env, invoiceId, sef: result };
    } catch (err) {
      this.store.audit({ action: "cancel", ok: false, env: this.cfg.env, invoiceId, error: (err as Error).message });
      throw err;
    }
  }

  async stornoInvoice(invoiceId: number, comment: string, stornoNumber?: string) {
    assertWriteAllowed(this.cfg, "storno_invoice");
    try {
      const result = await this.sef().storno(invoiceId, comment, stornoNumber);
      this.store.audit({ action: "storno", ok: true, env: this.cfg.env, invoiceId, stornoNumber, result });
      return { stornoed: true, environment: this.cfg.env, invoiceId, sef: result };
    } catch (err) {
      this.store.audit({ action: "storno", ok: false, env: this.cfg.env, invoiceId, error: (err as Error).message });
      throw err;
    }
  }
}
