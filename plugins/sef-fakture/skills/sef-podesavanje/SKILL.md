---
name: sef-podesavanje
description: Guides a Serbian business owner or accountant through first-time setup of SEF e-invoicing with the sef-mcp tools — API key, company profile, customers and a first demo invoice — without editing files. Use when the user says "podesi SEF", "poveži SEF", "prvi put", "podesi firmu za e-fakture", "dodaj kupca", "promeni podatke firme", "set up SEF", or when sef_check_setup reports profileConfigured false.
---

# SEF podešavanje (first-time setup)

Speak Serbian (Latin script) unless the user writes in another language. Use plain words: "firma", "kupac", "ključ", "proba". Never show JSON, file paths or tool names unless the user asks.

## Hard rules

- **Never ask for, accept or repeat an API key in the chat.** Keys go only into the extension settings, which store them in the OS keychain. If the user pastes a key into the chat, tell them it is now exposed and that they should generate a new one in SEF Administrator.
- Never invent or "fix" a PIB, matični broj, account number or address. Use only what the user gives or what is printed on a document they share. If something looks wrong (wrong digit count), say so and ask.
- Do not decide the VAT treatment. Propose the default the tool suggests and ask the user to confirm it with their accountant.
- Every save uses the preview → confirm flow: call the tool without `confirmCode`, show the preview, wait for an explicit "da" / "potvrđujem", then call again with the same values plus `confirmCode`.

## Steps

### 1. Check what is installed
Call `sef_check_setup`.
- If the sef tools are not available at all: explain that the "SEF e-fakture" extension must be installed first (download https://github.com/janko-vrbnjak/sef-mcp/releases/latest/download/sef-mcp.mcpb and double-click it), then stop.
- Note `environment` (demo / prod) and `apiKeyConfigured`.
- **Version check (no network):** this plugin needs sef-mcp server **0.3.0** or newer (`Minimum sef-mcp server version: 0.3.0`). If `serverVersion` is missing (servers before 0.3.0 do not report it) or lower, tell the user in one sentence that the "SEF e-fakture" extension is out of date, give the link https://github.com/janko-vrbnjak/sef-mcp/releases/latest/download/sef-mcp.mcpb, and say: download, double-click, Install — data and settings stay. Continue only with what the old version supports, and never as a reason to skip a safety rule.
- If `problems` is not empty, explain each one in plain words and how to fix it in the extension settings (e.g. "Okruženje" must be `demo` or `prod`). The server already fell back to the safe side (demo, no key), so nothing can be sent by mistake.

### 2. API key
If `apiKeyConfigured` is false, explain:
1. Log in to SEF — for a first test use the demo portal (demoefaktura.mfin.gov.rs).
2. Open **SEF Administrator → API** and generate a key.
3. In Claude: Settings → Extensions → SEF e-fakture → paste the key into "API ključ — demo SEF".
4. Keep "Okruženje" on `demo` for now.
Then call `sef_ping`. On success say the connection works; on failure read the "Objašnjenje" part of the error to the user.

### 3. Company (one short block of questions at a time)
Ask for, in this order (offer: "Možete mi poslati i staru fakturu ili APR izvod, pa ću podatke prepisati"):
1. Pun naziv firme, PIB, matični broj.
2. Adresa: ulica i broj, mesto, poštanski broj.
3. Tekući račun i e-mail za fakture.
4. Da li je firma u sistemu PDV-a?
   - Not in VAT → the tool proposes SS / 0 / PDV-RS-33 (član 33). Ask whether every invoice should carry the note "Izdavalac računa nije obveznik PDV-a u skladu sa članom 33. Zakona o PDV-u." — most non-VAT issuers use it.
   - In VAT → the tool proposes S / 20 %.
5. Optional: kako izgleda broj vaše poslednje fakture (e.g. `FA-2026-014`)? Turn it into a pattern only if the user agrees (`^FA-\d{4}-\d{3}$`). Rok plaćanja u danima. Najčešća jedinica mere (sat `HUR`, mesec `MON`, komad `H87`).

Call `sef_setup_company` without `confirmCode`. Show the preview as a short list (naziv, PIB, MB, adresa, račun, PDV pravilo, napomene, rok) plus every warning. After explicit confirmation, call again with `confirmCode`.

### 4. Customers
For each regular customer ask: naziv, PIB, matični broj, adresa, e-mail (optional), da li je u PDV-u (usually yes), broj ugovora (optional), rok plaćanja, uobičajena jedinica mere, napomena koja ide na svaku fakturu (optional). For public-sector buyers also JBKJS (5 digits) — explain the invoice will also go to CRF.
Suggest a short id from the name (`acme`, `hsd`). Use `sef_add_customer` with the same preview → confirm flow.

### 5. First demo invoice
Offer a test invoice on demo with a small amount (e.g. 1 sat × 100 RSD) and an invoice number the user will not use in production (e.g. `TEST-2026-001` if no pattern, otherwise ask). Hand over to the **sef-fakturisanje** skill for drafting and sending.

### 6. Moving to production (only when the user asks)
Explain the two switches and let the user flip them in the extension settings themselves:
1. Unesite produkcijski API ključ (sa efaktura.mfin.gov.rs).
2. "Okruženje" → `prod`.
3. Uključite "Dozvoli slanje pravih faktura".
Recommend doing this only after a successful demo invoice and after the accountant has seen the demo invoice. Remind them never to choose "always allow" for sending tools.

## Changing data later
"Promeni adresu firme" → `sef_setup_company` with all current values (read them from `sef_check_setup` / previous preview) plus the change. "Promeni kupca" → `sef_add_customer` with the same id. Always preview → confirm. The previous profile is kept as a backup automatically.
