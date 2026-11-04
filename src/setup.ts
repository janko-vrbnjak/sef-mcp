/**
 * Guided profile setup — lets a non-technical user create and extend the
 * company profile through the assistant instead of editing JSON.
 *
 * Same safety pattern as invoices (ADR 0002): a call without `confirmCode`
 * only validates and returns a preview plus a code; a second call with that
 * code writes exactly the previewed profile. The previous file is kept as
 * `profile.json.bak`.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { AddressSchema, parseProfile, TaxRuleSchema, type Profile, type TaxRule } from "./profile.js";
import { sha256 } from "./store.js";

const pib = z.string().regex(/^\d{9}$/, "PIB: tačno 9 cifara");
const mb = z.string().regex(/^\d{8}$/, "Matični broj: tačno 8 cifara");

export const CompanyInput = {
  name: z.string().min(1).describe("Pun naziv firme kao u APR-u"),
  pib: pib.describe("PIB, 9 cifara"),
  mb: mb.describe("Matični broj, 8 cifara"),
  address: AddressSchema.describe("Ulica i broj, mesto, poštanski broj"),
  email: z.string().email().optional(),
  bankAccount: z.string().describe("Tekući račun, npr. 265-0000000000000-00"),
  vatRegistered: z.boolean().describe("Da li je firma u sistemu PDV-a"),
  defaultTax: TaxRuleSchema.optional().describe(
    "Podrazumevano PDV pravilo. Ako se izostavi: van PDV-a → SS / 0 / PDV-RS-33, u PDV-u → S / 20. Potvrditi sa knjigovođom."
  ),
  notes: z.array(z.string().min(1).max(1000)).max(10).optional().describe("Napomene na svakoj fakturi"),
  numberPattern: z.string().optional().describe("Regex za broj fakture, npr. ^FA-\\d{4}-\\d{3}$"),
  paymentDueDays: z.number().int().min(0).max(365).optional(),
  unitCode: z.string().regex(/^[A-Z0-9]{2,3}$/).optional(),
  confirmCode: z.string().optional().describe("Kod iz pregleda; šalje se tek kad korisnik potvrdi pregled"),
};
const CompanySchema = z.object(CompanyInput);
export type CompanyArgs = z.infer<typeof CompanySchema>;

export const CustomerInput = {
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/).describe("Kratka oznaka kupca, npr. 'acme' (mala slova, cifre, - i _)"),
  name: z.string().min(1),
  pib: pib,
  mb: mb.optional(),
  jbkjs: z.string().regex(/^\d{5}$/).optional().describe("Samo za javni sektor: JBKJS, 5 cifara"),
  address: AddressSchema,
  email: z.string().email().optional(),
  vatRegistered: z.boolean().optional().describe("Da li je kupac u sistemu PDV-a (podrazumevano: da)"),
  contractNumber: z.string().optional(),
  paymentDueDays: z.number().int().min(0).max(365).optional(),
  unitCode: z.string().regex(/^[A-Z0-9]{2,3}$/).optional(),
  notes: z.array(z.string().min(1).max(1000)).max(10).optional(),
  sendToCir: z.enum(["Yes", "No"]).optional(),
  confirmCode: z.string().optional().describe("Kod iz pregleda; šalje se tek kad korisnik potvrdi pregled"),
};
const CustomerArgsSchema = z.object(CustomerInput);
export type CustomerArgs = z.infer<typeof CustomerArgsSchema>;

function defaultTaxFor(vatRegistered: boolean): TaxRule {
  return vatRegistered
    ? { category: "S", percent: "20" }
    : { category: "SS", percent: "0", exemptionReasonCode: "PDV-RS-33" };
}

function strip<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

export interface Preview {
  saved: false;
  profilePath: string;
  confirmCode: string;
  changes: string[];
  warnings: string[];
  profile: Profile;
  next: string;
}

export interface Saved {
  saved: true;
  profilePath: string;
  backup: string | null;
  profile: Profile;
}

export class ProfileStore {
  constructor(readonly path: string) {}

  exists(): boolean {
    return existsSync(this.path);
  }

  readRaw(): Record<string, unknown> | undefined {
    if (!this.exists()) return undefined;
    return JSON.parse(readFileSync(this.path, "utf8")) as Record<string, unknown>;
  }

  private code(profile: Profile): string {
    return sha256(JSON.stringify(profile)).slice(0, 8);
  }

  /** Validate a candidate, then either return a preview or (with the matching code) write it. */
  private commit(candidate: unknown, confirmCode: string | undefined, changes: string[], warnings: string[]): Preview | Saved {
    const profile = parseProfile(candidate);
    const code = this.code(profile);
    if (!confirmCode) {
      return {
        saved: false,
        profilePath: this.path,
        confirmCode: code,
        changes,
        warnings,
        profile,
        next:
          "Show these details to the user in plain language. Only if they explicitly confirm, call this tool again " +
          "with exactly the same values plus confirmCode.",
      };
    }
    if (confirmCode.trim().toLowerCase() !== code) {
      throw new Error("confirmCode does not match these values. Show the new preview to the user and ask again.");
    }
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    let backup: string | null = null;
    if (this.exists()) {
      backup = `${this.path}.bak`;
      copyFileSync(this.path, backup);
    }
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(profile, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
    renameSync(tmp, this.path);
    return { saved: true, profilePath: this.path, backup, profile };
  }

  setupCompany(rawArgs: CompanyArgs): Preview | Saved {
    const a = CompanySchema.parse(rawArgs);
    const current = this.readRaw() ?? { version: 1, customers: [] };
    const warnings: string[] = [];
    if (!a.defaultTax) {
      warnings.push(
        a.vatRegistered
          ? "PDV pravilo nije zadato — koristi se S / 20%. Potvrdite sa knjigovođom."
          : "PDV pravilo nije zadato — koristi se SS / 0 / PDV-RS-33 (nije u sistemu PDV-a, čl. 33). Potvrdite sa knjigovođom."
      );
    }
    const prevDefaults = (current.invoiceDefaults ?? {}) as Record<string, unknown>;
    const candidate = {
      ...current,
      version: 1,
      seller: strip({
        name: a.name,
        pib: a.pib,
        mb: a.mb,
        address: a.address,
        email: a.email,
        bankAccount: a.bankAccount,
        vatRegistered: a.vatRegistered,
        defaultTax: a.defaultTax ?? defaultTaxFor(a.vatRegistered),
      }),
      invoiceDefaults: strip({
        ...prevDefaults,
        notes: a.notes ?? prevDefaults.notes,
        numberPattern: a.numberPattern ?? prevDefaults.numberPattern,
        paymentDueDays: a.paymentDueDays ?? prevDefaults.paymentDueDays,
        unitCode: a.unitCode ?? prevDefaults.unitCode,
      }),
    };
    const changes = [this.exists() ? "Ažuriranje podataka o firmi u postojećem profilu" : "Novi profil firme"];
    return this.commit(candidate, a.confirmCode, changes, warnings);
  }

  addCustomer(rawArgs: CustomerArgs): Preview | Saved {
    const a = CustomerArgsSchema.parse(rawArgs);
    const current = this.readRaw();
    if (!current) throw new Error("Profil firme još ne postoji. Prvo podesite firmu (sef_setup_company).");
    const customers = Array.isArray(current.customers) ? [...(current.customers as Array<{ id: string; pib: string }>)] : [];
    const customer = strip({
      id: a.id,
      name: a.name,
      pib: a.pib,
      mb: a.mb,
      jbkjs: a.jbkjs,
      address: a.address,
      email: a.email,
      vatRegistered: a.vatRegistered ?? true,
      defaults: strip({
        contractNumber: a.contractNumber,
        paymentDueDays: a.paymentDueDays,
        unitCode: a.unitCode,
        notes: a.notes,
        sendToCir: a.sendToCir,
      }),
    });
    const warnings: string[] = [];
    const samePib = customers.find((c) => c.pib === a.pib && c.id !== a.id);
    if (samePib) warnings.push(`Kupac sa istim PIB-om već postoji pod oznakom "${samePib.id}".`);
    if (a.jbkjs) warnings.push("Kupac iz javnog sektora: fakture se podrazumevano šalju i u CRF (sendToCir=Yes).");
    const idx = customers.findIndex((c) => c.id === a.id);
    const changes = [idx >= 0 ? `Izmena kupca "${a.id}"` : `Novi kupac "${a.id}"`];
    if (idx >= 0) customers[idx] = customer;
    else customers.push(customer);
    return this.commit({ ...current, customers }, a.confirmCode, changes, warnings);
  }
}
