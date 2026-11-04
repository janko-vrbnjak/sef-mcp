/**
 * Local draft store and append-only audit log.
 *
 * Drafts make "approve exactly this version" enforceable: send_invoice takes
 * a draftId plus an approvalCode derived from the SHA-256 of the XML, so
 * anything that changed after the human looked at it cannot be sent.
 */
import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { join } from "node:path";
import type { UblTotals } from "./ubl/build.js";

export interface Draft {
  draftId: string;
  createdAt: string;
  invoiceNumber: string;
  customerId: string;
  buyerName: string;
  buyerPib: string;
  sendToCir: "Yes" | "No";
  totals: UblTotals;
  sha256: string;
  approvalCode: string;
  requestId: string;
  xmlFile: string;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Deterministic UUID-shaped requestId from the XML hash → idempotent retries. */
export function requestIdFromHash(hash: string): string {
  const h = hash.slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export class Store {
  readonly draftsDir: string;
  readonly auditFile: string;

  constructor(readonly dataDir: string) {
    this.draftsDir = join(dataDir, "drafts");
    this.auditFile = join(dataDir, "audit.jsonl");
    mkdirSync(this.draftsDir, { recursive: true, mode: 0o700 });
    try {
      chmodSync(dataDir, 0o700);
    } catch {
      /* best effort on non-POSIX */
    }
  }

  saveDraft(input: Omit<Draft, "draftId" | "createdAt" | "sha256" | "approvalCode" | "requestId" | "xmlFile">, xml: string): Draft {
    const hash = sha256(xml);
    const draftId = randomUUID();
    const xmlFile = join(this.draftsDir, `${draftId}.xml`);
    const draft: Draft = {
      ...input,
      draftId,
      createdAt: new Date().toISOString(),
      sha256: hash,
      approvalCode: hash.slice(0, 8),
      requestId: requestIdFromHash(hash),
      xmlFile,
    };
    writeFileSync(xmlFile, xml, { encoding: "utf8", mode: 0o600 });
    writeFileSync(join(this.draftsDir, `${draftId}.json`), JSON.stringify(draft, null, 2), { mode: 0o600 });
    return draft;
  }

  loadDraft(draftId: string): { draft: Draft; xml: string } {
    if (!/^[0-9a-f-]{36}$/.test(draftId)) throw new Error("Invalid draftId");
    const meta = join(this.draftsDir, `${draftId}.json`);
    if (!existsSync(meta)) throw new Error(`Draft ${draftId} not found`);
    const draft = JSON.parse(readFileSync(meta, "utf8")) as Draft;
    const xml = readFileSync(draft.xmlFile, "utf8");
    if (sha256(xml) !== draft.sha256) {
      throw new Error(`Draft ${draftId} XML was modified on disk after drafting; create a new draft.`);
    }
    return { draft, xml };
  }

  audit(entry: Record<string, unknown>): void {
    appendFileSync(this.auditFile, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n", { mode: 0o600 });
  }

  /**
   * True if SEF's validation (UBLDocumentNotValid) rejected an upload of this exact draft in this environment.
   * Only then may the draft be re-sent with executeValidation=false (see sendInvoice).
   */
  validationRejected(env: string, draftId: string): boolean {
    if (!existsSync(this.auditFile)) return false;
    for (const line of readFileSync(this.auditFile, "utf8").split("\n")) {
      if (!line) continue;
      try {
        const r = JSON.parse(line) as { action?: string; ok?: boolean; env?: string; draftId?: string; body?: string };
        if (r.action === "send" && r.ok === false && r.env === env && r.draftId === draftId && (r.body ?? "").includes("UBLDocumentNotValid")) {
          return true;
        }
      } catch {
        /* ignore corrupt line */
      }
    }
    return false;
  }

  /** Invoice numbers already sent successfully in this environment (from the audit log). */
  sentNumbers(env: string): Set<string> {
    const out = new Set<string>();
    if (!existsSync(this.auditFile)) return out;
    for (const line of readFileSync(this.auditFile, "utf8").split("\n")) {
      if (!line) continue;
      try {
        const r = JSON.parse(line) as { action?: string; ok?: boolean; env?: string; invoiceNumber?: string };
        if (r.action === "send" && r.ok && r.env === env && r.invoiceNumber) out.add(r.invoiceNumber);
      } catch {
        /* ignore corrupt line */
      }
    }
    return out;
  }
}
