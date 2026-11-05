# Technical specification — sef-mcp

Document version 0.2 · 2026-11-02

## 0. Normative sources

| Source | Edition | Used for |
|---|---|---|
| SEF release notes 3.15.0 → 4.2.0 — https://www.efaktura.gov.rs/tekst/en/5624/sef-updates-and-versions.php | 4.2.0 (demo 01.10.2026, prod 02.10.2026) | Validation rules introduced after the API spec; see §11 |
| SEF API spec — *Спецификација апликативног интерфејса за непосредан приступ* (`API dokumentacija_31_07_2026.pdf`) | 31.07.2026 | Endpoints, parameters, status rules |
| SEF internal technical guide — ITU (`СЕФ 01 okt 2026.pdf`) | 01.10.2026 | UBL / SRB-CIUS business terms (BT-x) |
| Official swagger — `https://efaktura.mfin.gov.rs/swagger/index.html` | live | Exact parameter names and enums (to be snapshotted in `docs/reference/`) |

When sources disagree, the order is: swagger > API spec > ITU > anything else. Record the disagreement in functional-spec §6.

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
| `SEF_API_KEY_DEMO` / `SEF_API_KEY_PROD` | — | Per-environment keys (used by the Claude extension). The one matching `SEF_ENV` wins over `SEF_API_KEY`; empty counts as unset. |
| `SEF_MCP_PROFILE` | `<SEF_MCP_DATA_DIR>/profile.json` | Path to profile JSON. If the file does not exist, the server starts in **setup mode** (see §4). |
| `SEF_MCP_DATA_DIR` | `~/.sef-mcp` | Drafts + audit log (dir `0700`, files `0600`) |
| `SEF_MCP_ATTACHMENTS_DIR` | `<SEF_MCP_DATA_DIR>/prilozi` | Only directory attachments may come from (created if missing) |

**Empty and placeholder values.** Every setting that is missing, empty, or still contains an unsubstituted `${...}` placeholder counts as not set and gets its default. The Claude Desktop extension passes untouched optional fields as empty strings and does not apply manifest defaults to them, so the code defaults are what users get.

**No startup failure on bad configuration.** `loadRuntimeConfig` never throws: an invalid `SEF_ENV` falls back to `demo`, an unresolved `op://` key is ignored, and an unreadable profile starts setup mode. Each case is recorded in `problems`, shown by `sef_check_setup`, written to stderr at start and makes `sef-mcp doctor` exit 1. Reason: MCP clients only show "server disconnected" when the process exits, which a non-technical user cannot diagnose.
| `SEF_MCP_READ_ONLY` | `false` | Blocks send/cancel |
| `SEF_MCP_ALLOW_PROD_WRITE` | `false` | Second switch required for prod writes |
| `SEF_MCP_MAX_ATTACHMENTS` | `2` | Max attachments per invoice (SEF limit) |
| `SEF_MCP_MAX_ATTACHMENT_BYTES` | `1048576` | Per-file limit (SEF limit 1 MB) |
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
| `sef_check_setup` | — | env, switches, `profileConfigured`, profile summary or next step | readOnly |
| `sef_setup_company` | seller fields, optional `confirmCode` | preview + `confirmCode`, or saved profile | local write |
| `sef_add_customer` | customer fields, optional `confirmCode` | preview + `confirmCode`, or saved profile | local write |

**Setup mode.** Without a profile all invoice tools return a Serbian message pointing to `sef_setup_company`. Setup tools follow ADR 0002: the first call validates and returns a preview plus `confirmCode` (first 8 hex of SHA-256 of the resulting profile); only a second call with identical values and that code writes. Writes are atomic (temp file + rename), mode `0600`, previous file kept as `profile.json.bak`. A non-VAT seller without an explicit rule gets `SS / 0 / PDV-RS-33` with a warning to confirm with the accountant.

**Error explanations.** `src/sef/errors.ts` maps documented or observed SEF codes (and HTTP 401/403) to Serbian explanations, appended to tool errors under "Objašnjenje". Unknown codes get no explanation — never a guess.
| `sef_ping` | — | reachable, count of exemption reasons | readOnly, openWorld |
| `sef_list_customers` | — | customers | readOnly |
| `sef_list_vat_exemption_reasons` | — | SEF list | readOnly, openWorld |
| `sef_list_unit_measures` | — | SEF list of unit codes | readOnly, openWorld |
| `sef_draft_invoice` | see `DraftInvoiceInput` | draftId, approvalCode, totals, warnings, xmlFile | local write only |
| `sef_get_draft` | draftId, includeXml? | draft (+xml) | readOnly |
| `sef_send_invoice` | draftId, approvalCode(8), executeValidation? (default **false**) | SEF ids | **destructive**, idempotent. Default matches the SEF portal (SEF support 05.11.2026: validation option not in operation yet). `true` only on explicit request, with a warning. A draft already sent successfully (audit log) is not uploaded again: `alreadySent: true` + the earlier SEF response |
| `sef_get_invoice` | invoiceId | SEF invoice | readOnly, openWorld |
| `sef_list_invoice_ids` | status, dateFrom, dateTo | ids | readOnly, openWorld |
| `sef_cancel_invoice` | invoiceId, comment | SEF response | **destructive** (Draft/New/Sending error only) |
| `sef_storno_invoice` | invoiceId, comment, stornoNumber? | SEF response | **destructive** (Sent/Accepted/Rejected only) |

Errors are returned as `isError: true` with a redacted message; the server never crashes on a tool error.

## 5. SEF API mapping

Source: API spec 31.07.2026 (see §0).

| Use | Method + path | Notes |
|---|---|---|
| Send | `POST /api/publicApi/sales-invoice/ubl?requestId&sendToCir&executeValidation` | body: UBL XML |
| Get | `GET /api/publicApi/sales-invoice?invoiceId` | includes Status |
| Cancel | `POST /api/publicApi/sales-invoice/cancel` | JSON `{invoiceId, cancelComments}`; only status Draft, New, Sending error |
| Storno | `POST /api/publicApi/sales-invoice/storno` | JSON `{invoiceId, stornoNumber?, stornoComment}`; only status Sent, Accepted, Rejected |
| IDs | `POST /api/publicApi/sales-invoice/ids?Status&dateFrom&dateTo` | |
| Changes | `POST /api/publicApi/sales-invoice/changes?date` | past dates only; kept 1 month (roadmap) |
| Exemptions | `GET /api/publicApi/sales-invoice/getValueAddedTaxExemptionReasonList` | used by `ping` |
| Units | `GET /api/publicApi/get-unit-measures` | |

Auth header: `ApiKey`. `sendToCir`: `Yes` / `No` (only documented values). Redirects are refused. The API spec names only the production host; the demo host `demoefaktura.mfin.gov.rs` is the publicly used one and must be confirmed (Q6). Base URLs are constants; there is intentionally no override variable.

**Idempotency:** `requestId` is a UUID-shaped string derived from the SHA-256 of the draft XML (the spec defines no format; its examples are numeric). SEF returns the original response for a repeated `requestId`, so a retry after a timeout cannot create a second invoice.

| Send | requestId |
|---|---|
| with SEF validation (`executeValidation=true`) | `draft.requestId` = `requestIdFromHash(draft.sha256)` |
| without SEF validation (default since 0.2.1) | `requestIdFromHash(sha256(draft.sha256 + ":executeValidation=false"))` |

This mapping is an **on-disk contract**: drafts and the audit log survive upgrades, so it must never change between versions (covered by a test). Changing it would let a retry after an upgrade create a second invoice, or replay an old rejection. On top of that, `sendInvoice` refuses to upload a draft the audit log already records as sent successfully in the same environment. A rejected draft keeps its requestId per mode: resending it in the same mode replays the rejection, so fix the cause and create a new draft.

## 6. UBL mapping (SRB-CIUS)

| Invoice field | UBL element | Source |
|---|---|---|
| Customization (BT-24) | `cbc:CustomizationID` = `urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.rs:srbdt:2022` | ITU §1.3; the `#conformant#…srbdtext:2022` form only when extension elements are used (not by this builder) |
| Number | `cbc:ID` | tool arg |
| Issue / due date | `cbc:IssueDate`, `cbc:DueDate` | arg / defaults |
| Type | `cbc:InvoiceTypeCode` = 380 | constant |
| VAT point date (BT-8) | `cac:InvoicePeriod/cbc:DescriptionCode` (3/35/432) | profile; **emitted only when a line is category `S`** — SEF 3.14 rejects it otherwise (`InvoicePeriodDescriptionCodeNotNeeded`) |
| Delivery date | `cac:Delivery/cbc:ActualDeliveryDate` | **mandatory since SEF 3.14** (`InvoiceDeliveryDateMissing`); arg → periodEnd → issueDate (with warning); future date → warning |
| Period | `cac:InvoicePeriod/cbc:StartDate|EndDate` | arg; `InvoicePeriod` omitted entirely when empty |
| Contract | `cac:ContractDocumentReference/cbc:ID` | arg / customer default |
| Attachment | `cac:AdditionalDocumentReference/.../cbc:EmbeddedDocumentBinaryObject` | PDF, base64 |
| Seller / buyer | `cbc:EndpointID@schemeID=9948` (PIB), `PartyName`, `PostalAddress`, `PartyTaxScheme` (`RS{PIB}` / `VAT` — always for the seller, also outside VAT, as SEF accepted; for the buyer only when `customer.vatRegistered`, default true), `PartyLegalEntity` (name, MB), `Contact/ElectronicMail` | profile; `PostalZone` optional |
| Notes | `cbc:Note` × n | profile `invoiceDefaults.notes` → `customer.defaults.notes` → args |
| Attachment ID | `AdditionalDocumentReference/cbc:ID` = file name without `.pdf` | args |
| Public buyer | `cac:PartyIdentification/cbc:ID` = `JBKJS:{5 digits}`, no schemeID (ITU BT-46) | profile |
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
| Duplicate invoice on retry | Deterministic, version-stable `requestId`; no second upload of a draft already sent (audit log); duplicate-number warning when drafting |
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
- **Golden fixtures** (`test/fixtures/`): anonymised UBL that SEF itself produced in production (current fixture: invoice created in the SEF web portal and exported; not an API upload, so it says nothing about `executeValidation`). `test/golden.test.ts` compares the builder's element tree (order included) and key values against them. Current: non-VAT services invoice (SS / PDV-RS-33, MON + HUR lines, 2 PDF attachments). Fixture-only optional elements are listed explicitly in the test.
- To add a fixture: download the XML from SEF, keep only `<Invoice>…</Invoice>` (drop the `env:DocumentEnvelope`), replace every identifying value and amount, replace attachment base64 with `JVBERi0xLjQK`, then add a matching test case.
- **Next:** opt-in demo e2e test (`SEF_E2E=1`) against `demoefaktura.mfin.gov.rs`.

## 9. Extension points

- New document types (381/383) → new builder function + tool; keep `buildInvoiceXml` pure.
- Remote transport → new entry using the same `SefTools`; must add OAuth and per-user key storage before exposure.
- Currency conversion → a `RateProvider` interface; amounts stay RSD in UBL.

## 11. SEF version compliance (baseline 4.2.0)

Rules from SEF release notes that affect outgoing invoices, and where sef-mcp enforces them before upload. Rules live in `src/ubl/rules.ts`; tests in `test/rules.test.ts` are named after the release.

| SEF | Rule | SEF error code | sef-mcp |
|---|---|---|---|
| 3.14 | Delivery date mandatory | `InvoiceDeliveryDateMissing` | always emitted; default + warning |
| 3.14 | `InvoicePeriod/DescriptionCode` only for S lines | `InvoicePeriodDescriptionCodeNotDefined` / `…NotNeeded` | emitted only when a line is `S` — confirmed by SEF support 04.11.2026. `RS-R-005` appears only with `executeValidation=true`, which SEF support says is not in operation yet (05.11.2026); sef-mcp sends without it by default |
| 3.15.0 | Tax category must be supported | `VATCategoryNotAllowed` | `TAX_CATEGORIES` check (profile + line) |
| 3.15.0 | JBKJS must match a registered company | `CompanyWithJBKJSNotFound` | format check only (5 digits) |
| 3.15.0 | `sales-invoice/ids`: New/Draft/Mistake filter by creation date, others by sending date | — | tool description |
| 3.16.0 | Rate > 0 only for category `S` | `UBLTaxCategoryPercentNotAllowed` | `taxRuleProblem` |
| 3.16.0 | Every `TaxSubtotal` category must exist on a line | `UBLNoItemsWithTaxSubtotalTaxCategory` | by construction (subtotals derived from lines) + test |
| 3.17.1 | Exemption code PDV-RS-36b-6 withdrawn → PDV-RS-10-2-4a | — | `WITHDRAWN_EXEMPTION_CODES` |
| 4.0.0 | Quantity and price positive; negatives only with `N` | — | > 0 enforced; `N` refused until reduction documents are supported |
| 4.0.0 | Line without unit of measure blocks sending | — | unit code required on every line |
| 4.0.0 | API key settings moved to the **SEF Administrator** module | — | docs/setup.md |
| 4.0.0 | New `sales-invoice/status-history/pdf` | — | roadmap |
| 4.2.0 | Rejecting an invoice on SEF auto-rejects the CRF obligation if it is *Active*; re-accepting asks CRF to reactivate it | — | no code change; affects `sendToCir=Yes` buyers (functional-spec UC-3) |

Releases 3.15.1, 3.16.1–3.16.4, 3.17.2 and 4.1.1 are performance fixes only; 4.1.0 changes only VAT recording (`vat-recording/group`), which sef-mcp does not use.

When SEF publishes a new release: read its notes, add rows here, add a test named after the release, update `docs/reference/`.

## 12. Packaging and release

| Artifact | Build | For |
|---|---|---|
| `dist/sef-mcp-<v>.mcpb` + `dist/sef-mcp.mcpb` | `npm run pack:mcpb` (stages runtime files in `build/mcpb`, `npm ci --omit=dev --ignore-scripts`, `mcpb validate` + `mcpb pack`) | Claude Desktop / Cowork: one-click install, bundled Node.js, keys in the OS keychain |
| `dist/sef-fakture-<v>.plugin` + `dist/sef-fakture.plugin` | `npm run pack:plugin` | Skills `sef-podesavanje` and `sef-fakturisanje` (Cowork, Claude Code) |

Extension settings → environment variables (`packaging/mcpb/manifest.json`): `sef_env` → `SEF_ENV`, `api_key_demo` / `api_key_prod` (sensitive) → `SEF_API_KEY_DEMO` / `SEF_API_KEY_PROD`, `allow_prod_write` → `SEF_MCP_ALLOW_PROD_WRITE`, `data_dir` → `SEF_MCP_DATA_DIR`, `attachments_dir` → `SEF_MCP_ATTACHMENTS_DIR` (created if missing). Untouched fields arrive empty (see §2), so the manifest `default` values are documentation only; the code defaults apply. The manifest version is overwritten from `package.json` at pack time.

The unversioned copies are what the user guide links to: `https://github.com/janko-vrbnjak/sef-mcp/releases/latest/download/sef-mcp.mcpb` and `…/sef-fakture.plugin`. GitHub's `latest` skips drafts and pre-releases, so a release meant for users must be a normal release.

**Release (automated, `.github/workflows/release.yml`):** pushing a tag `vX.Y.Z` runs tests, checks that the tag matches `package.json` and `plugin.json`, builds both artifacts and publishes a GitHub Release with the four files. Notes come from `docs/releases/vX.Y.Z.md` (user-facing, Serbian) plus the matching CHANGELOG section.

**Updates.** The repository is a plugin marketplace (`.claude-plugin/marketplace.json` → `./plugins/sef-fakture`). Users who add `janko-vrbnjak/sef-mcp` as a marketplace and turn on *Sync automatically* get new skills on every pushed `plugin.json` version — the version must be bumped, or clients keep the old copy. The `.mcpb` extension is distributed privately, so Claude does not update it; until it is listed in Anthropic's extension directory, the skills perform a **no-network version check**: `sef_check_setup` reports `serverVersion`, both SKILL.md files state `Minimum sef-mcp server version: X.Y.Z`, and an older (or pre-0.3.0, which reports none) server gets a one-sentence notice with the `latest/download` link. The server itself never checks for updates — it talks only to SEF (`docs/privatnost.md`). `test/distribution.test.ts` keeps marketplace, plugin and package versions consistent and the minimum version ≤ the released version. Raise the minimum only when the skills rely on a new tool or behaviour.

Release checklist:
1. `npm test` green; move CHANGELOG *Unreleased* into `## [X.Y.Z] — date`.
2. Bump `package.json`, `package-lock.json` and `plugins/sef-fakture/.claude-plugin/plugin.json`.
3. Write `docs/releases/vX.Y.Z.md`.
4. Locally: `npm run pack:mcpb && npm run pack:plugin`, install the `.mcpb` on a machine without Node.js, run the onboarding skill on demo.
5. Commit, then `git tag vX.Y.Z && git push origin vX.Y.Z`.
6. Open the user guide links and check that both files download.

## 10. Conventions

TypeScript strict, ESM, Node ≥ 20.11. No `console.log` to stdout in server code (stdout is the protocol channel) — use stderr. Every new tool: zod input, annotations, unit test, docs row in sections 4 and README.
