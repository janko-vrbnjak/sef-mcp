/**
 * Exact decimal arithmetic for invoice amounts.
 *
 * Floats are never used for money. Every amount is parsed from a decimal
 * string into a BigInt scaled by a fixed number of decimals, and rounded
 * half-up only at the points UBL requires (line amount, tax amount).
 */

export const AMOUNT_SCALE = 2; // RSD has 2 decimals (para)
export const QUANTITY_SCALE = 4;
export const PERCENT_SCALE = 2;

const DECIMAL_RE = /^(\d+)(?:\.(\d+))?$/;

export function parseDecimal(value: string, scale: number, label = "value"): bigint {
  const m = DECIMAL_RE.exec(value.trim());
  if (!m) throw new Error(`${label}: "${value}" is not a non-negative decimal (use a dot, e.g. 1234.50)`);
  const intPart = m[1] ?? "0";
  const frac = m[2] ?? "";
  if (frac.length > scale) {
    throw new Error(`${label}: "${value}" has more than ${scale} decimals`);
  }
  return BigInt(intPart + frac.padEnd(scale, "0"));
}

/** Divide by 10^drop, rounding half-up (values are non-negative). */
export function roundHalfUp(value: bigint, drop: number): bigint {
  if (drop <= 0) return value;
  const div = 10n ** BigInt(drop);
  const q = value / div;
  const r = value % div;
  return r * 2n >= div ? q + 1n : q;
}

export function formatScaled(value: bigint, scale: number): string {
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const s = abs.toString().padStart(scale + 1, "0");
  const out = scale === 0 ? s : `${s.slice(0, -scale)}.${s.slice(-scale)}`;
  return neg ? `-${out}` : out;
}

export function formatAmount(minor: bigint): string {
  return formatScaled(minor, AMOUNT_SCALE);
}

/** quantity × unit price → line amount in minor units (2 decimals). */
export function lineAmount(quantity: string, unitPrice: string): bigint {
  const q = parseDecimal(quantity, QUANTITY_SCALE, "quantity");
  const p = parseDecimal(unitPrice, AMOUNT_SCALE, "unitPrice");
  return roundHalfUp(q * p, QUANTITY_SCALE);
}

/** taxable (minor units) × percent → tax amount in minor units. */
export function taxAmount(taxableMinor: bigint, percent: string): bigint {
  const pct = parseDecimal(percent, PERCENT_SCALE, "percent");
  // taxable(scale 2) * pct(scale 2) / 100 → scale 4 then /100 → drop 4 to get scale 2
  return roundHalfUp(taxableMinor * pct, PERCENT_SCALE + 2);
}
