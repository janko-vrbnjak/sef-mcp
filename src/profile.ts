/**
 * Company profile: everything that makes one issuer different from another.
 *
 * The core never hard-codes a company. A profile is a JSON file on the
 * user's machine (path from SEF_MCP_PROFILE). It holds public business data
 * only — never API keys.
 */
import { readFileSync } from "node:fs";
import { z } from "zod";

const pib = z.string().regex(/^\d{9}$/, "PIB must be exactly 9 digits");
const mb = z.string().regex(/^\d{8}$/, "Matični broj must be exactly 8 digits");
const isoCountry = z.string().regex(/^[A-Z]{2}$/).default("RS");
const decimal = z.string().regex(/^\d+(\.\d+)?$/, "use a decimal string, e.g. \"20\" or \"0\"");

export const AddressSchema = z.object({
  street: z.string().min(1),
  city: z.string().min(1),
  postalCode: z.string().min(1),
  country: isoCountry,
});

export const TaxRuleSchema = z.object({
  /** SEF tax category code, e.g. S (standard), SS, AE, E, Z, O, OE, R, N */
  category: z.string().min(1).max(3),
  percent: decimal,
  /** Required by SEF for exempt categories, e.g. PDV-RS-33 */
  exemptionReasonCode: z.string().optional(),
  exemptionReasonText: z.string().optional(),
});

export const SellerSchema = z.object({
  name: z.string().min(1),
  pib,
  mb,
  address: AddressSchema,
  email: z.string().email().optional(),
  bankAccount: z.string().regex(/^\d{3}-?\d{1,13}-?\d{2}$/, "Serbian account format, e.g. 265-0000000000000-00"),
  vatRegistered: z.boolean(),
  defaultTax: TaxRuleSchema,
});

export const CustomerSchema = z.object({
  /** Short local alias used in prompts, e.g. "acme" */
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  name: z.string().min(1),
  pib,
  mb: mb.optional(),
  /** Public-sector budget user number (JBKJS) */
  jbkjs: z.string().regex(/^\d{5}$/).optional(),
  address: AddressSchema,
  email: z.string().email().optional(),
  defaults: z
    .object({
      contractNumber: z.string().optional(),
      paymentDueDays: z.number().int().min(0).max(365).optional(),
      sendToCir: z.enum(["Yes", "No", "Auto"]).optional(),
      tax: TaxRuleSchema.optional(),
    })
    .default({}),
});

export const ProfileSchema = z.object({
  version: z.literal(1),
  seller: SellerSchema,
  invoiceDefaults: z
    .object({
      currency: z.literal("RSD").default("RSD"),
      paymentDueDays: z.number().int().min(0).max(365).default(15),
      /** SRB-CIUS VAT point date code: 3 = issue date, 35 = delivery date, 432 = payment date */
      vatPointDateCode: z.enum(["3", "35", "432"]).default("35"),
      /** UN/ECE 4461 payment means code; 30 = credit transfer */
      paymentMeansCode: z.string().default("30"),
      /** UN/ECE Rec 20 unit code; H87 = piece, HUR = hour */
      unitCode: z.string().default("H87"),
      /** Optional regex an invoice number must match, e.g. "^INV-\\d{4}-\\d{3}$" */
      numberPattern: z.string().optional(),
    })
    .default({}),
  customers: z.array(CustomerSchema).default([]),
});

export type Address = z.infer<typeof AddressSchema>;
export type TaxRule = z.infer<typeof TaxRuleSchema>;
export type Seller = z.infer<typeof SellerSchema>;
export type Customer = z.infer<typeof CustomerSchema>;
export type Profile = z.infer<typeof ProfileSchema>;

export function parseProfile(raw: unknown): Profile {
  const result = ProfileSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid profile:\n${issues}`);
  }
  const profile = result.data;
  const ids = new Set<string>();
  for (const c of profile.customers) {
    if (ids.has(c.id)) throw new Error(`Invalid profile: duplicate customer id "${c.id}"`);
    ids.add(c.id);
  }
  if (!profile.seller.vatRegistered && profile.seller.defaultTax.category === "S") {
    throw new Error(
      "Invalid profile: seller.vatRegistered is false but defaultTax.category is S (standard VAT). " +
        "Ask your accountant for the correct category and exemption code."
    );
  }
  return profile;
}

export function loadProfile(path: string): Profile {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    throw new Error(`Cannot read profile at ${path}: ${(e as Error).message}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(`Profile at ${path} is not valid JSON: ${(e as Error).message}`);
  }
  return parseProfile(raw);
}

export function findCustomer(profile: Profile, idOrPib: string): Customer | undefined {
  return profile.customers.find((c) => c.id === idOrPib || c.pib === idOrPib);
}
