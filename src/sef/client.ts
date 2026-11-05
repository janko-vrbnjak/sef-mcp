/**
 * Minimal SEF public API client.
 *
 * - Base URLs are hard-coded: the client cannot be pointed at another host.
 * - The API key is sent only in the `ApiKey` header and never appears in
 *   errors, logs or return values.
 * - Every write carries a caller-supplied requestId; SEF returns the original
 *   response for a repeated requestId, so retries are safe.
 *
 * Endpoint reference: "Спецификација апликативног интерфејса за непосредан
 * приступ", Ministry of Finance, edition 31.07.2026 (API dokumentacija_31_07_2026.pdf).
 * The demo base URL is not stated in that document; it is the publicly used
 * SEF demo host and must be confirmed against the official swagger.
 */
import { redact } from "../safety.js";
import type { SefEnvironment } from "../env.js";

export const SEF_BASE_URLS: Record<SefEnvironment, string> = {
  demo: "https://demoefaktura.mfin.gov.rs",
  prod: "https://efaktura.mfin.gov.rs",
};

export const ENDPOINTS = {
  uploadUbl: "/api/publicApi/sales-invoice/ubl",
  getSalesInvoice: "/api/publicApi/sales-invoice",
  cancel: "/api/publicApi/sales-invoice/cancel",
  storno: "/api/publicApi/sales-invoice/storno",
  salesInvoiceIds: "/api/publicApi/sales-invoice/ids",
  vatExemptionReasons: "/api/publicApi/sales-invoice/getValueAddedTaxExemptionReasonList",
  unitMeasures: "/api/publicApi/get-unit-measures",
} as const;

/** Documented values (API spec 31.07.2026): Yes / No. */
export type SendToCir = "Yes" | "No";

export class SefApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string
  ) {
    super(message);
    this.name = "SefApiError";
  }
}

export interface SefClientOptions {
  env: SefEnvironment;
  apiKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class SefClient {
  private readonly base: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: SefClientOptions) {
    if (!opts.apiKey) throw new Error("SEF_API_KEY is not set");
    this.base = SEF_BASE_URLS[opts.env];
    this.apiKey = opts.apiKey;
    this.timeoutMs = opts.timeoutMs ?? 30000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  get baseUrl(): string {
    return this.base;
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    query: Record<string, string | undefined> = {},
    body?: { contentType: string; data: string }
  ): Promise<unknown> {
    const url = new URL(path, this.base);
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, v);
    if (url.origin !== new URL(this.base).origin) throw new Error("Refusing request to non-SEF host");

    const headers: Record<string, string> = { ApiKey: this.apiKey, Accept: "application/json" };
    if (body) headers["Content-Type"] = body.contentType;

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers,
        body: body?.data,
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: "error",
      });
    } catch (err) {
      throw new Error(redact(`SEF request failed (${method} ${path}): ${(err as Error).message}`, [this.apiKey]));
    }
    const text = await res.text();
    const safeText = redact(text, [this.apiKey]).slice(0, 4000);
    if (!res.ok) {
      throw new SefApiError(`SEF returned HTTP ${res.status} for ${method} ${path}`, res.status, safeText);
    }
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return safeText;
    }
  }

  uploadUbl(xml: string, requestId: string, sendToCir: SendToCir = "No", executeValidation = false) {
    return this.request(
      "POST",
      ENDPOINTS.uploadUbl,
      { requestId, sendToCir, executeValidation: String(executeValidation) },
      { contentType: "application/xml", data: xml }
    );
  }

  getSalesInvoice(invoiceId: number) {
    return this.request("GET", ENDPOINTS.getSalesInvoice, { invoiceId: String(invoiceId) });
  }

  /** Allowed by SEF only for invoices in status Draft, New or Sending error. */
  cancel(invoiceId: number, cancelComments: string) {
    return this.request("POST", ENDPOINTS.cancel, {}, {
      contentType: "application/json",
      data: JSON.stringify({ invoiceId, cancelComments }),
    });
  }

  /** Allowed by SEF only for invoices in status Sent, Accepted or Rejected. */
  storno(invoiceId: number, stornoComment: string, stornoNumber?: string) {
    return this.request("POST", ENDPOINTS.storno, {}, {
      contentType: "application/json",
      data: JSON.stringify({ invoiceId, stornoComment, ...(stornoNumber ? { stornoNumber } : {}) }),
    });
  }

  salesInvoiceIds(status: string, dateFrom: string, dateTo: string) {
    // Parameter is spelled "Status" in the API spec 31.07.2026.
    return this.request("POST", ENDPOINTS.salesInvoiceIds, { Status: status, dateFrom, dateTo });
  }

  vatExemptionReasons() {
    return this.request("GET", ENDPOINTS.vatExemptionReasons);
  }

  unitMeasures() {
    return this.request("GET", ENDPOINTS.unitMeasures);
  }
}
