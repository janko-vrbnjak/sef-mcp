/**
 * Plain-language (Serbian) explanations for SEF errors, so a non-technical
 * user knows what went wrong and what to do. Only codes documented by SEF or
 * observed in real responses are listed — never invented ones.
 */

interface Explanation {
  meaning: string;
  action: string;
  source: string;
}

const BY_CODE: Record<string, Explanation> = {
  InvoiceDeliveryDateMissing: {
    meaning: "Na fakturi nedostaje datum prometa.",
    action: "Zadajte datum prometa (obično poslednji dan perioda usluge) i napravite novi nacrt.",
    source: "SEF 3.14",
  },
  InvoicePeriodDescriptionCodeNotDefined: {
    meaning: "Faktura sa stavkama sa PDV-om (kategorija S) mora imati šifru datuma nastanka poreske obaveze.",
    action: "Proverite podrazumevanu šifru (3, 35 ili 432) u profilu i napravite novi nacrt.",
    source: "SEF 3.14",
  },
  InvoicePeriodDescriptionCodeNotNeeded: {
    meaning: "Šifra datuma poreske obaveze poslata je na fakturi na kojoj ne nastaje obaveza obračuna PDV-a.",
    action: "Ovo je poznato otvoreno pitanje (Q9) za obveznike van PDV-a. Ne pokušavajte ponovo; javite održavaocu.",
    source: "SEF 3.14; sef-mcp Q9",
  },
  "RS-R-005": {
    meaning:
      "Javlja se samo kada se faktura šalje uz SEF validaciju (executeValidation=true), koja po podršci SEF-a još nije " +
      "u funkciji (05.11.2026). Faktura bez šifre datuma poreske obaveze je ispravna kada ne nastaje obaveza obračuna PDV-a.",
    action: "Ne menjajte PDV pravilo i ne dodajte šifru. Pošaljite isti nacrt bez SEF validacije (podrazumevano ponašanje).",
    source: "Podrška SEF-a 04.11. i 05.11.2026; sef-mcp Q9",
  },
  VATCategoryNotAllowed: {
    meaning: "Kategorija PDV-a na stavci nije podržana na SEF-u.",
    action: "Proverite PDV pravilo u profilu sa knjigovođom (dozvoljeno: S, AE, Z, E, R, O, OE, SS, N).",
    source: "SEF 3.15.0",
  },
  CompanyWithJBKJSNotFound: {
    meaning: "JBKJS broj kupca ne odgovara nijednoj firmi u javnom sektoru.",
    action: "Proverite JBKJS kod kupca (5 cifara) i ispravite kupca u profilu.",
    source: "SEF 3.15.0",
  },
  UBLTaxCategoryPercentNotAllowed: {
    meaning: "Stopa PDV-a veća od 0 dozvoljena je samo za kategoriju S.",
    action: "Ispravite PDV pravilo (za kategorije osim S stopa je 0).",
    source: "SEF 3.16.0",
  },
  UBLNoItemsWithTaxSubtotalTaxCategory: {
    meaning: "U zbiru PDV-a postoji kategorija koja nije ni na jednoj stavci.",
    action: "Ovo ne bi trebalo da se desi sa sef-mcp; javite održavaocu uz broj nacrta.",
    source: "SEF 3.16.0",
  },
};

const BY_STATUS: Record<number, Explanation> = {
  401: {
    meaning: "SEF nije prihvatio API ključ.",
    action:
      "Proverite da li je unet ključ za pravo okruženje (demo i produkcija imaju različite ključeve) i da li je ključ " +
      "aktivan u modulu SEF Administrator.",
    source: "HTTP 401",
  },
  403: {
    meaning: "API ključ nema dozvolu za ovu radnju.",
    action: "Proverite prava ključa u modulu SEF Administrator.",
    source: "HTTP 403",
  },
};

/** Every documented or observed SEF error code with its explanation (single source for docs and resources). */
export const KNOWN_SEF_ERRORS: ReadonlyArray<{ code: string } & Explanation> = Object.entries(BY_CODE).map(([code, ex]) => ({
  code,
  ...ex,
}));

/** HTTP statuses with an explanation. */
export const KNOWN_HTTP_ERRORS: ReadonlyArray<{ status: number } & Explanation> = Object.entries(BY_STATUS).map(
  ([status, ex]) => ({ status: Number(status), ...ex })
);

/** Returns explanations for every known SEF code found in the error text, plus one for the HTTP status. */
export function explainSefError(text: string, status?: number): string[] {
  const out: string[] = [];
  for (const [code, ex] of Object.entries(BY_CODE)) {
    if (text.includes(code)) out.push(`${code}: ${ex.meaning} Šta uraditi: ${ex.action} (${ex.source})`);
  }
  const s = status !== undefined ? BY_STATUS[status] : undefined;
  if (s) out.push(`${s.source}: ${s.meaning} Šta uraditi: ${s.action}`);
  return out;
}
