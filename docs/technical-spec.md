# Technical specification — sef-mcp

Document version 0.1 · 2026-11-02

## 1. Architecture

```
 MCP client (Claude Desktop / Claude Code / Cursor)
        │  stdio, JSON-RPC
        ▼
 ┌──────────────────────────── sef-mcp process ───────────────────────────┐
 │ server.ts   MCP wiring, tool annotations, error → isError, redaction  │
 │ tools.ts    use-cases (draft, send, cancel, query) — SDK-independent   │
 │   ├─ profile.ts   zod-validated company profile (JSON on disk)        │
 │   ├─ env.ts       runtime config + write gates                         │
 │   ├─ ubl/build.ts pure UBL 2.1 / SRB-CIUS builder                     │
 │   ├─ money.ts     BigInt decimal arithmetic                            │
 │   ├─ store.ts     drafts + append-only audit log                       │
 │   ├─ safety.ts    redact, path confinement, XML escaping              │
 │   └─ sef/client.ts fixed-host HTTPS client for SEF public API          │
 └────────────────────────────────────────────────────────────────────────┘
        │  HTTPS, header ApiKey
        ▼
 demoefaktura.mfin.gov.rs  |  efaktura.mfin.gov.rs
```

Secrets enter only through environment variables, injected by a secret manager (`op run`). Business data enters only through the profile and tool arguments.

## 2. Configuration

| Variable | Default | Purpose |
|---|---|---|
| `SEF_ENV` | `demo` | `demo` or `prod` — selects base URL |
| `SEF_API_KEY` | — | SEF API key (never logged/returned). Unresolved `op://` refs are rejected. |
| `SEF_MCP_PROFILE` | — (required) | Path to profile JSON |
| `SEF_MCP_DATA_DIR` | `~/.sef-mcp` | Drafts + audit log (dir `0700`, files `0600`) |
| `SEF_MCP_ATTACHMENTS_DIR` | — | Only directory attachments may come from |
| `SEF_MCP_READ_ONLY` | `false` | Blocks send/cancel |
| `SEF_MCP_ALLOW_PROD_WRITE` | `false` | Second switch required for prod writes |
| `SEF_MCP_MAX_ATTACHMENT_BYTES` | `5242880` | Per-file limit |
| `SEF_MCP_TIMEOUT_MS` | `30000` | HTTP timeout |

Use a separate data dir per environment so the duplicate-number check is per environment.

## 3. Profile schema (v1)

Defined in `src/profile.ts` (zod). Example: `examples/profile.example.json`.

- `seller`: name, pib (9 digits), mb (8), address, email?, bankAccount, `vatRegistered`, `defaultTax {category, percent, exemptionReasonCode?, exemptionReasonText?}`
- `invoiceDefaults`: currency (`RSD`), paymentDueDays, vatPointDateCode (`3`|`35`|`432`), paymentMeansCode (`30`), unitCode (`H87`), numberPattern?
- `customers[]`: id (slug), name, pib, mb?, jbkjs?, address, email?, `defaults {contractNumber?, paymentDueDays?, sendToCir?, tax?}`

Cross-field checks: unique customer ids; non-VAT seller cannot default to `S`.

Schema changes bump `version` and ship a migration note in CHANGELOG.

## 4. Tool contracts

| Tool | Input | Output | Annotations |
|---|---|---|---|
| `sef_check_setup` | — | env, switches, profile summary | readOnly |
| `sef_ping` | — | reachable, count of exemption reasons | readOnly, openWorld |
| `sef_list_customers` | — | customers | readOnly |
| `sef_list_vat_exemption_reasons` | — | SEF list | readOnly, openWorld |
| `sef_draft_invoice` | see `DraftInvoiceInput` | draftId, approvalCode, totals, warnings, xmlFile | local write only |
| `sef_get_draft` | draftId, includeXml? | draft (+xml) | readOnly |
| `sef_send_invoice` | draftId, approvalCode(8) | SEF ids | **destructive**, idempotent |
| `sef_get_invoice` | invoiceId | SEF invoice | readOnly, openWorld |
| `sef_list_invoice_ids` | status, dateFrom, dateTo | ids | readOnly, openWorld |
| `sef_cancel_invoice` | invoiceId, comment | SEF response | **destructive** |

Errors are returned as `isError: true` with a redacted message; the server never crashes on a tool error.

## 5. SEF API mapping

Source: *Спецификација апликативног интерфејса за непосредан приступ*, Ministry of Finance, 7.11.2025.

| Use | Method + path | Notes |
|---|---|---|
| Send | `POST /api/publicApi/sales-invoice/ubl?requestId&sendToCir&executeValidation` | body: UBL XML |
| Get | `GET /api/publicApi/sales-invoice?invoiceId` | includes Status |
| Cancel | `POST /api/publicApi/sales-invoice/cancel` | JSON `{invoiceId, cancelComments}` |
| Storno | `POST /api/publicApi/sales-invoice/storno` | roadmap |
| IDs | `POST /api/publicApi/sales-invoice/ids?status&dateFrom&dateTo` | |
| Exemptions | `GET /api/publicApi/sales-invoice/getValueAddedTaxExemptionReasonList` | used by `ping` |
| Units | `GET /api/publicApi/get-unit-measures` | |

Auth header: `ApiKey`. Redirects are refused. Base URLs are constants; there is intentionally no override variable.

**Idempotency:** `requestId` = UUID-shaped string derived from the SHA-256 of the draft XML. SEF returns the original response for a repeated `requestId`, so a retry after a timeout cannot create a second invoice. Consequence: if SEF rejected a draft, you must create a new draft (changed XML → new requestId).

## 6. UBL mapping (SRB-CIUS)

| Invoice field | UBL element | Source |
|---|---|---|
| Customization | `cbc:CustomizationID` | constant `SRB_CUSTOMIZATION_ID` (**verify, Q1**) |
| Number | `cbc:ID` | tool arg |
| Issue / due date | `cbc:IssueDate`, `cbc:DueDate` | arg / defaults |
| Type | `cbc:InvoiceTypeCode` = 380 | constant |
| VAT point date | `cac:InvoicePeriod/cbc:DescriptionCode` | profile |
| Period | `cac:InvoicePeriod/cbc:StartDate|EndDate` | arg |
| Contract | `cac:ContractDocumentReference/cbc:ID` | arg / customer default |
| Attachment | `cac:AdditionalDocumentReference/.../cbc:EmbeddedDocumentBinaryObject` | PDF, base64 |
| Seller / buyer | `cbc:EndpointID@schemeID=9948` (PIB), `PartyName`, `PostalAddress`, `PartyTaxScheme` (`RS{PIB}`, **Q2**), `PartyLegalEntity` (name, MB) | profile |
| Public buyer | `cac:PartyIdentification/cbc:ID` = `JBKJS:{n}` | profile |
| Payment | `PaymentMeansCode`, `PaymentID` (poziv na broj), `PayeeFinancialAccount/ID` (18 digits) | profile / arg |
| Tax | `TaxTotal/TaxSubtotal` per (category, percent, reason) with `TaxExemptionReasonCode` | computed |
| Totals | `LegalMonetaryTotal` | computed |
| Lines | `InvoiceLine` with `ClassifiedTaxCategory` | args |

Element order follows the UBL 2.1 XSD sequence and is covered by a test.

## 7. Security model

| Threat | Mitigation |
|---|---|
| API key exfiltration via logs/tool output | Key only in env; `redact()` on every tool result and error; never in audit log (tested) |
| Key committed to git | Profile has no key field; `.env*` ignored except `.env.example`; unresolved `op://` refs rejected so plain keys aren't needed |
| Prompt injection makes the model send/cancel | Destructive tool annotations → client asks the human; send needs draftId + approvalCode; prod needs second switch; read-only mode |
| Approved version ≠ sent version | approvalCode = hash prefix; XML hash re-verified on load |
| Duplicate invoice on retry | Deterministic `requestId`; duplicate-number warning from audit log |
| Arbitrary file read via attachments | Single allowed dir, `realpath` confinement (symlinks), PDF magic bytes, size limit |
| Traffic to a malicious host | Hard-coded base URLs, origin check, `redirect: "error"` |
| Supply chain | Two runtime deps (`@modelcontextprotocol/sdk`, `zod`), lockfile, Dependabot, CI, no install scripts |
| Float rounding errors | BigInt decimal arithmetic |
| Local data exposure | Data dir `0700`, files `0600` |

Out of scope: a compromised local machine or MCP client.

## 8. Testing

- `node:test`, no test framework dependency. `npm test` builds then runs `dist/test/**/*.test.js`.
- Unit: money, UBL structure/order/escaping, safety, profile validation, draft tamper detection.
- Tool flow with a fake `fetch`: no network before approval, approvalCode check, prod gate, audit has no key.
- **Next (v0.2):** golden fixtures — a real SEF-accepted XML (anonymised) per issuer type, compared semantically to builder output; opt-in demo e2e test (`SEF_E2E=1`).

## 9. Extension points

- New document types (381/383) → new builder function + tool; keep `buildInvoiceXml` pure.
- Remote transport → new entry using the same `SefTools`; must add OAuth and per-user key storage before exposure.
- Currency conversion → a `RateProvider` interface; amounts stay RSD in UBL.

## 10. Conventions

TypeScript strict, ESM, Node ≥ 20.11. No `console.log` to stdout in server code (stdout is the protocol channel) — use stderr. Every new tool: zod input, annotations, unit test, docs row in sections 4 and README.
