/**
 * Reference content served as MCP resources. Generated from the same data the server uses
 * (error explanations, rules, limits), so documentation can never drift from behaviour.
 * Serbian, for end users; one Markdown document per resource.
 */
import type { RuntimeConfig } from "./env.js";
import { KNOWN_HTTP_ERRORS, KNOWN_SEF_ERRORS } from "./sef/errors.js";
import { TAX_CATEGORIES, WITHDRAWN_EXEMPTION_CODES } from "./ubl/rules.js";

export type InvoiceAction = "cancel" | "storno" | "none";

/** Sales invoice statuses and the action SEF allows (API spec 31.07.2026). */
export const INVOICE_STATUSES: ReadonlyArray<{ status: string; sr: string; action: InvoiceAction }> = [
  { status: "Draft", sr: "Nacrt", action: "cancel" },
  { status: "New", sr: "Nova", action: "cancel" },
  { status: "Mistake", sr: "Greška pri slanju", action: "cancel" },
  { status: "Sent", sr: "Poslata", action: "storno" },
  { status: "Approved", sr: "Prihvaćena", action: "storno" },
  { status: "Rejected", sr: "Odbijena", action: "storno" },
  { status: "Cancelled", sr: "Otkazana", action: "none" },
  { status: "Storno", sr: "Stornirana", action: "none" },
];

const ACTION_SR: Record<InvoiceAction, string> = {
  cancel: "Otkazivanje (`sef_cancel_invoice`)",
  storno: "Storno (`sef_storno_invoice`)",
  none: "Ništa — konačno",
};

const cell = (v: string) => v.replace(/\|/g, "\\|");

export function errorsMarkdown(): string {
  const rows = KNOWN_SEF_ERRORS.map((e) => `| \`${e.code}\` | ${cell(e.meaning)} | ${cell(e.action)} | ${cell(e.source)} |`);
  const http = KNOWN_HTTP_ERRORS.map((e) => `| HTTP ${e.status} | ${cell(e.meaning)} | ${cell(e.action)} | — |`);
  return [
    "# SEF greške — objašnjenja",
    "",
    "Samo šifre koje je SEF dokumentovao ili koje su viđene u stvarnim odgovorima.",
    "",
    "| Šifra | Šta znači | Šta uraditi | Izvor |",
    "|---|---|---|---|",
    ...rows,
    ...http,
    "",
    "Odbijen nacrt se ne šalje ponovo nepromenjen: SEF za isti zahtev vraća isti odgovor. Ispraviti uzrok i napraviti nov nacrt.",
    "",
  ].join("\n");
}

export function statusesMarkdown(): string {
  return [
    "# Statusi izlaznih faktura na SEF-u",
    "",
    "| Status (API) | Na srpskom | Šta je moguće |",
    "|---|---|---|",
    ...INVOICE_STATUSES.map((s) => `| \`${s.status}\` | ${s.sr} | ${ACTION_SR[s.action]} |`),
    "",
    "Prihvaćena faktura se u dokumentaciji SEF-a navodi i kao `Accepted`; tretirati je isto kao `Approved`.",
    "",
    "Pretraga po periodu (`sef_list_invoice_ids`): za New, Draft i Mistake period se računa po datumu kreiranja, za ostale po datumu slanja (SEF 3.15.0).",
    "",
    "Javni sektor (SEF 4.2.0): kada kupac odbije fakturu, obaveza u CRF-u prelazi u „Odbijena“ ako je bila „Aktivna“; ako kupac kasnije prihvati fakturu, SEF traži ponovnu aktivaciju.",
    "",
  ].join("\n");
}

export function rulesMarkdown(cfg: RuntimeConfig): string {
  const withdrawn = Object.entries(WITHDRAWN_EXEMPTION_CODES).map(([old, next]) => `\`${old}\` → \`${next}\``);
  return [
    "# Pravila koja sef-mcp proverava pre slanja",
    "",
    "| Pravilo | Izvor |",
    "|---|---|",
    `| Kategorija PDV-a mora biti jedna od: ${TAX_CATEGORIES.join(", ")} | SEF 3.15.0 |`,
    "| Stopa veća od 0 samo za kategoriju S; za ostale 0 | SEF 3.16.0 |",
    "| Kategorije osim S, Z i O traže šifru razloga izuzeća | SRB-CIUS |",
    `| Povučene šifre izuzeća: ${withdrawn.join(", ") || "—"} | SEF 3.17.1 |`,
    "| Količina i cena moraju biti veće od 0 | SEF 4.0.0 |",
    "| Svaka stavka ima jedinicu mere (npr. H87 komad, HUR sat, MON mesec) | SEF 4.0.0 |",
    "| Datum prometa je obavezan | SEF 3.14 |",
    "| Šifra datuma poreske obaveze (3 / 35 / 432) samo kad neka stavka ima kategoriju S | SEF 3.14 |",
    `| Najviše ${cfg.maxAttachments} PDF priloga, do ${Math.round(cfg.maxAttachmentBytes / 1024)} KB svaki, samo iz foldera za priloge | SEF / sef-mcp |`,
    "",
    "## Bezbednost",
    "",
    `- Okruženje sada: **${cfg.env === "prod" ? "PRODUKCIJA" : "DEMO"}**; slanje pravih faktura ${cfg.env === "prod" && cfg.allowProdWrite ? "**uključeno**" : "isključeno"}.`,
    "- Faktura ide na SEF samo posle izričitog odobrenja tog nacrta (draftId + approvalCode).",
    "- Nacrt koji je već uspešno poslat ne šalje se ponovo.",
    "- API ključ se nikad ne unosi u razgovor.",
    "",
  ].join("\n");
}
