---
name: sef-fakturisanje
description: Drafts, sends and manages Serbian SEF e-invoices with the sef-mcp tools, always with the user's explicit approval before anything reaches SEF. Use when the user says "napravi fakturu", "fakturiši", "mesečna faktura", "pošalji fakturu na SEF", "e-faktura za", "status fakture", "da li je kupac prihvatio", "otkaži fakturu", "storniraj fakturu", "issue an invoice on SEF", or shares a timesheet/specification to invoice.
---

# SEF fakturisanje (daily invoicing)

Speak Serbian (Latin script) unless the user writes in another language. Keep answers short and concrete. Never show raw XML or JSON unless asked.

## Hard rules — never break these

1. **No sending without explicit approval of this exact draft.** Show the summary, ask "Da pošaljem ovu fakturu na SEF?", and call `sef_send_invoice` only after a clear yes in the user's reply to that question. Approval of an earlier draft never carries over to a new one.
2. **Always say which environment.** Start every summary with **DEMO (proba, bez poreskog efekta)** or **PRODUKCIJA — PRAVA FAKTURA**.
3. **Never guess money, dates, PIB or tax treatment.** Ask. If the user gives an amount in EUR, ask for the RSD amount or the NBS middle rate on the issue date; if you look the rate up, show the source and let the user confirm it.
4. **Never work around a SEF error by changing the tax rule** or other legal content. Explain the error and stop if it is not something the user can fix.
5. Never ask for or accept the API key in chat; never suggest "always allow" for send, cancel or storno.
6. Do not resend a draft SEF rejected — the same draft has the same request id and SEF returns the same answer. Fix the cause and create a new draft.

## Monthly invoice

1. `sef_check_setup` — if `profileConfigured` is false, switch to the **sef-podesavanje** skill.
   **Version check (no network):** this plugin needs sef-mcp server **0.3.0** or newer (`Minimum sef-mcp server version: 0.3.0`). If `serverVersion` is missing (servers before 0.3.0 do not report it) or lower, tell the user in one sentence that the "SEF e-fakture" extension is out of date, give the link https://github.com/janko-vrbnjak/sef-mcp/releases/latest/download/sef-mcp.mcpb, and say: download, double-click, Install — data and settings stay. Continue only with what the old version supports, and never as a reason to skip a safety rule.
2. Collect (ask only what is missing; propose defaults and let the user confirm):
   - **Kupac** — match by name to `sef_list_customers`; if unknown, offer to add it (sef-podesavanje).
   - **Broj fakture** — ask; if the user says "sledeći", propose the next number after the last one they mention, never invent a series.
   - **Datum izdavanja** — default today; confirm.
   - **Datum prometa** — for services usually the last day of the service period; always confirm (mandatory on SEF).
   - **Period** (optional) — start/end of the service period.
   - **Stavke** — naziv, količina, jedinica mere, cena u RSD bez PDV-a. From a timesheet or specification, sum hours per service and show the calculation.
   - **Prilozi** — PDF files from the attachments folder only, at most 2, 1 MB each. If the file is elsewhere, ask the user to put it into that folder.
   - **Rok plaćanja** — default from the profile; mention it.
3. Call `sef_draft_invoice`. Present:
   - environment banner, kupac (naziv + PIB), broj, datumi, rok
   - stavke as a small table (naziv · količina · jedinica · cena · iznos) and **Ukupno za plaćanje**
   - napomene and prilozi
   - every `warnings` entry, explained in one plain sentence each
4. Ask for approval (rule 1). On yes → `sef_send_invoice` with `draftId` and `approvalCode`. On any change → new draft, new approval.
5. If SEF rejects the upload with `RS-R-005`, the invoice was sent with SEF validation, which SEF says is not in operation yet. Explain that in plain words and suggest sending the same draft again with the default (no `executeValidation`). Never add a VAT date code or change the tax rule to get around it.
6. After sending: confirm success, give the SEF invoice id, and tell the user they can ask "status fakture" later. If the result has `alreadySent: true`, the draft had been sent before and nothing was uploaded now: tell the user when it was sent, give the SEF id from the result, and offer a status check — never create a copy of the draft to force a second send.

## Status, cancel, storno

- "Status" → `sef_get_invoice` (needs the SEF invoice id) or `sef_list_invoice_ids` for a period; translate the status with `references/statusi.md`.
- "Poništi / otkaži / storniraj" → first `sef_get_invoice`, then:
  - Draft / New / Mistake (greška pri slanju) → `sef_cancel_invoice`
  - Sent / Approved / Rejected → `sef_storno_invoice`
  - Cancelled / Storno → nothing to do; say so.
  Explain what will happen, ask for explicit approval, then call the tool with a short reason ("Pogrešan iznos"). For public-sector buyers mention the CRF effect described in `references/statusi.md`.

## When SEF returns an error

The tool result contains an "Objašnjenje" section when the error is known. Read it to the user in plain words, say what they can do, and consult `references/greske.md` for details. If the error is not explained, show the SEF message as is, do not speculate about tax rules, and suggest contacting the person who set up the tool (or opening an issue on the project page) with the draft number.
