/**
 * SEF validation rules for outgoing invoices that can be checked before upload.
 *
 * Every rule names the SEF release (and error code where SEF documents one), so
 * a failing check can be traced to the official release notes. Baseline: SEF 4.2.0.
 * Release notes index: https://www.efaktura.gov.rs/tekst/en/5624/sef-updates-and-versions.php
 */
import { parseDecimal } from "../money.js";
import type { TaxRule } from "../profile.js";

/** SRB-CIUS tax category codes (ITU 01.10.2026, BT-118 / BT-151). SEF 3.15.0: others → VATCategoryNotAllowed. */
export const TAX_CATEGORIES = ["S", "AE", "Z", "E", "R", "O", "OE", "SS", "N"] as const;

/** Categories that do not need an exemption reason code. */
const NO_REASON_NEEDED = new Set(["S", "Z", "O"]);

/**
 * Exemption reason codes SEF has withdrawn, with their replacement.
 * SEF 3.17.1: ПДВ-РС-36б-6 (AE20) withdrawn, replaced by ПДВ-РС-10-2-4а.
 */
export const WITHDRAWN_EXEMPTION_CODES: Record<string, string> = {
  "PDV-RS-36b-6": "PDV-RS-10-2-4a",
};

/** Returns a human-readable problem with a tax rule, or undefined if it is acceptable. */
export function taxRuleProblem(rule: TaxRule): string | undefined {
  if (!(TAX_CATEGORIES as readonly string[]).includes(rule.category)) {
    return `tax category "${rule.category}" is not supported by SEF (allowed: ${TAX_CATEGORIES.join(", ")}) — SEF 3.15.0 VATCategoryNotAllowed`;
  }
  if (rule.category === "N") {
    return `tax category N (annulment) is used only for negative amounts on reduction documents, which sef-mcp does not issue yet — SEF 4.0.0`;
  }
  let pct: bigint;
  try {
    pct = parseDecimal(rule.percent, 2, "percent");
  } catch (e) {
    return (e as Error).message;
  }
  if (rule.category === "S" && pct === 0n) {
    return `category S (standard rate) needs a percent greater than 0`;
  }
  if (rule.category !== "S" && pct !== 0n) {
    return `percent must be 0 for category ${rule.category}; only category S may have a rate — SEF 3.16.0 UBLTaxCategoryPercentNotAllowed`;
  }
  if (!NO_REASON_NEEDED.has(rule.category) && !rule.exemptionReasonCode) {
    return `tax category ${rule.category} requires an exemptionReasonCode`;
  }
  const code = rule.exemptionReasonCode;
  if (code && WITHDRAWN_EXEMPTION_CODES[code]) {
    return `exemption code ${code} was withdrawn by SEF; use ${WITHDRAWN_EXEMPTION_CODES[code]} — SEF 3.17.1`;
  }
  return undefined;
}

/** UN/ECE Rec 20 unit code shape. SEF 4.0.0 blocks XML whose line has no unit of measure. */
export const UNIT_CODE_RE = /^[A-Z0-9]{2,3}$/;
