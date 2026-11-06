/**
 * MCP prompts: ready-made starting points users can pick in their client (e.g. a slash command).
 * Each prompt restates the safety rules, so they apply even without the sef-fakture skills.
 */

const SAFETY = [
  "Pravila koja se ne krše:",
  "- Nijedna faktura ne ide na SEF bez mog izričitog odobrenja tog nacrta.",
  "- Svaki pregled počni oznakom okruženja: DEMO ili PRODUKCIJA.",
  "- Ne pogađaj iznose, datume, PIB ni PDV pravilo; pitaj me.",
  "- Nikad ne traži niti prihvataj API ključ u razgovoru.",
].join("\n");

const join = (...parts: Array<string | false | undefined>) => parts.filter(Boolean).join("\n\n");

export function monthlyInvoicePrompt(args: { kupac?: string; period?: string }): string {
  return join(
    "Napravi mesečnu e-fakturu za SEF.",
    args.kupac && `Kupac: ${args.kupac}`,
    args.period && `Period usluge: ${args.period}`,
    [
      "Koraci:",
      "1. Pozovi sef_check_setup. Ako firma nije podešena, predloži podešavanje.",
      "2. Iz sef_list_customers izaberi kupca; ako ne postoji, ponudi da ga dodaš.",
      "3. Pitaj samo ono što nedostaje: broj fakture, datum izdavanja, datum prometa, stavke (naziv, količina, jedinica, cena u RSD bez PDV-a), priloge.",
      "4. Pozovi sef_draft_invoice i pokaži mi pregled: okruženje, kupac, broj, datumi, stavke, ukupno, upozorenja.",
      "5. Pitaj „Da pošaljem ovu fakturu na SEF?“ i tek na moje „da“ pozovi sef_send_invoice sa draftId i approvalCode.",
    ].join("\n"),
    SAFETY
  );
}

export function setupPrompt(): string {
  return join(
    "Podesi moju firmu za izdavanje e-faktura na SEF.",
    [
      "Koraci:",
      "1. Pozovi sef_check_setup i objasni mi okruženje, ključ i eventualne probleme.",
      "2. Ako ključ nije unet, objasni gde se pravi (SEF Administrator → API) i da ga unosim u podešavanja ekstenzije, ne u razgovor.",
      "3. Pitaj me za podatke firme u kratkim blokovima, pa pozovi sef_setup_company bez confirmCode, pokaži pregled i sačuvaj tek posle moje potvrde.",
      "4. Isto za svakog kupca preko sef_add_customer.",
      "5. Pozovi sef_ping i ponudi probnu fakturu na demo okruženju.",
    ].join("\n"),
    SAFETY
  );
}

export function invoiceStatusPrompt(args: { faktura?: string }): string {
  return join(
    "Proveri status moje fakture na SEF-u.",
    args.faktura && `Faktura (SEF broj ili broj fakture): ${args.faktura}`,
    "Ako imaš SEF broj fakture, pozovi sef_get_invoice; inače sef_list_invoice_ids za odgovarajući period. Status mi objasni na srpskom i reci šta je sledeće moguće (resurs sef-mcp://docs/statusi).",
    SAFETY
  );
}

export function cancelOrStornoPrompt(args: { faktura?: string; razlog?: string }): string {
  return join(
    "Poništi fakturu na SEF-u.",
    args.faktura && `Faktura (SEF broj): ${args.faktura}`,
    args.razlog && `Razlog: ${args.razlog}`,
    "Prvo pozovi sef_get_invoice. Za status Draft, New ili Mistake predloži otkazivanje (sef_cancel_invoice); za Sent, Approved ili Rejected storno (sef_storno_invoice); za Cancelled ili Storno reci da nema šta da se radi. Objasni posledicu i pozovi alat tek posle mog izričitog odobrenja.",
    SAFETY
  );
}
