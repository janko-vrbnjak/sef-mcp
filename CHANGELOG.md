# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/), versions: [SemVer](https://semver.org/).

## [Unreleased]

### Added

- MCP prompts: `mesecna-faktura`, `podesavanje-firme`, `status-fakture`, `storno-ili-otkazivanje`. Each restates the safety rules, so they hold without the skills too.
- MCP resources: `sef-mcp://docs/greske`, `sef-mcp://docs/statusi`, `sef-mcp://docs/pravila`, generated from the server's own data (error table, rules, limits, current environment).
- `test/content.test.ts`: resources and prompts over the real server. Every error explanation and status action must also appear in the plugin's references.
- Official MCP Registry: `server.json` (`io.github.janko-vrbnjak/sef-mcp`, MCPB package) and a `mcp-registry` release job that adds the SHA-256 of the released `.mcpb`, validates and publishes with GitHub OIDC. `mcp-publisher` is pinned and its signature verified.
- `scripts/registry-server-json.mjs`; `test/distribution.test.ts` keeps `server.json` aligned with the release.

### Changed

- Release workflow: default permission `contents: read`; only the release job can write; the tag must also match `server.json`.
- `src/sef/errors.ts` exports the error table (`KNOWN_SEF_ERRORS`, `KNOWN_HTTP_ERRORS`) as the single source for explanations and docs.

## [0.3.0] — 2026-11-05

### Added

- The repository is a plugin marketplace (`.claude-plugin/marketplace.json`): add `janko-vrbnjak/sef-mcp` in Cowork / Claude Code and turn on _Sync automatically_ to get skill updates without re-downloading.
- No-network version check: `sef_check_setup` reports `serverVersion`; both skills require server ≥ 0.3.0 and tell users with an older extension where to download the new one.
- `sef_list_customers` also returns MB, JBKJS, address, e-mail and VAT status, so the user can check what goes on the invoice.
- `test/distribution.test.ts`: marketplace entry, version alignment (package, plugin, server) and skill minimum version.

## [0.2.2] — 2026-11-05

### Fixed

- **Claude Desktop extension did not start** when "Okruženje" was left untouched: the extension passes untouched fields as empty strings, and an empty `SEF_ENV` made the server exit right after `initialize` ("Server disconnected"). Affected every fresh install of 0.2.0 and 0.2.1.
- Empty settings and unsubstituted `${...}` placeholders now count as not set and get their defaults (all variables).
- Configuration problems no longer stop the server: invalid `SEF_ENV` → demo, unresolved `op://` key → ignored, unreadable profile → setup mode. They are listed in `sef_check_setup` (`problems`), on stderr and by `sef-mcp doctor` (exit 1). The onboarding skill explains them.
- Attachments folder defaults to `<data folder>/prilozi`, so attachments work without choosing a folder.
- The server reported version 0.1.0; it now reads the version from `package.json`.

### Added

- `test/startup.test.ts`: starts the real server with untouched extension values, placeholders and a broken profile and requires an `initialize` answer.

## [0.2.1] — 2026-11-05

### Changed

- `sef_send_invoice` now sends **without** SEF validation by default (`executeValidation=false`), like the SEF portal: SEF support confirmed on 05.11.2026 that the "Izvrši validaciju" option is not in operation yet. `true` only on explicit request, with a warning. Removed the "only after a validation rejection" guard. Closes Q5 and Q9.

### Fixed

- `requestId` per send mode is the same as in 0.2.0 (with validation: `draft.requestId`; without: the `:executeValidation=false` hash) and is now documented as a version-stable contract. Swapping them would have let a retry after upgrading create a second invoice, or replay an earlier rejection.
- A draft already sent successfully (per the audit log) is not uploaded again; the result returns `alreadySent: true` with the earlier SEF response. The skill explains this instead of resending.

## [0.2.0] — 2026-11-05

### Added

- `sef_send_invoice`: optional `executeValidation` (default true). `false` is accepted only after SEF validation rejected the same draft (`UBLDocumentNotValid`, from the audit log) and uses its own deterministic requestId; audit entries record the flag. Workaround for Q9 (`RS-R-005` on valid non-VAT invoices when validation is on).
- Non-technical onboarding (ADR 0003): setup mode when no profile exists; `sef_setup_company` and `sef_add_customer` with preview → confirm, atomic write and `.bak` backup (`src/setup.ts`, `test/setup.test.ts`).
- Serbian explanations for known SEF errors and HTTP 401/403 (`src/sef/errors.ts`).
- Per-environment keys `SEF_API_KEY_DEMO` / `SEF_API_KEY_PROD`; `SEF_MCP_PROFILE` now defaults to `<SEF_MCP_DATA_DIR>/profile.json`; attachments folder is created if missing.
- Claude Desktop extension manifest (`packaging/mcpb/manifest.json`, `npm run pack:mcpb`) and skills plugin `sef-fakture` with `sef-podesavanje` and `sef-fakturisanje` (`npm run pack:plugin`).
- User guide without terminal (`docs/za-korisnike.md`), privacy note (`docs/privatnost.md`), ADR 0003 (distribution, GPT options).
- Release workflow: tag `vX.Y.Z` → tests, Claude extension and skills plugin built and attached to a GitHub Release; stable download names `sef-mcp.mcpb` and `sef-fakture.plugin` for the user guide.
- SEF 4.2.0 baseline: pre-upload checks for rules from releases 3.15.0–4.0.0 (`src/ubl/rules.ts`, `test/rules.test.ts`): supported tax categories (`VATCategoryNotAllowed`), rate only for `S` (`UBLTaxCategoryPercentNotAllowed`), withdrawn exemption code PDV-RS-36b-6, positive quantity and price, mandatory unit of measure. Same tax checks run on the profile.
- Compliance matrix in technical-spec §11.
- Golden test against anonymised UBL that SEF produced for a portal-created production invoice (`test/fixtures/accepted-non-vat-services.xml`).
- `sef_list_unit_measures` tool.
- Profile: `invoiceDefaults.notes`, `customers[].vatRegistered` (default true), `customers[].defaults.{notes, unitCode, orderNumber}`; unit codes validated.
- `SEF_MCP_MAX_ATTACHMENTS` (default 2).
- `sef_storno_invoice` tool (SEF allows storno for Sent / Accepted / Rejected).
- Normative sources table (API spec 31.07.2026, ITU 01.10.2026, swagger) in technical spec.

### Changed

- CI: `npm test` uses a shell-expanded `dist/test/*.test.js` glob so Node 20 runners find tests (quoted `**` globs are not expanded there).
- Runtime dependency `zod` bumped to ^4.6.7 (GHSA-mrhx-c7xc-m3w5). Profile object defaults use `.prefault({})` so nested field defaults still apply under Zod 4.
- Attachment defaults follow SEF limits: max 2 files, 1 MB each (was 5 / 5 MB). Attachment reference ID is the file name without `.pdf`.
- Buyer `PartyTaxScheme` is emitted only for VAT-registered customers; `PostalZone` is optional.
- `CustomizationID` is now the base SRB-CIUS value (ITU 01.10.2026 §1.3); the extension form is not used.
- Delivery date (`ActualDeliveryDate`) is always emitted — mandatory since SEF 3.14. Defaults to periodEnd, then issueDate, with a warning; a future date produces a warning.
- `InvoicePeriod/DescriptionCode` is emitted only when a line is category `S` (SEF 3.14 rejects it otherwise).
- `sendToCir` accepts only the documented `Yes` / `No` (removed `Auto`).
- `sales-invoice/ids` sends the parameter as `Status`, as in the API spec.
- Cancel tool description reflects SEF status rules (Draft / New / Sending error).

## [0.1.0] — 2026-11-02

### Added

- Generic core configured by a local company profile (ADR 0001).
- Tools: check_setup, ping, list_customers, list_vat_exemption_reasons, draft_invoice, get_draft, send_invoice, get_invoice, list_invoice_ids, cancel_invoice.
- UBL 2.1 / SRB-CIUS builder with BigInt money arithmetic (to be validated against SEF — see roadmap 0.2).
- Two-step send with approval code, prod double switch, read-only mode (ADR 0002).
- Local drafts and append-only audit log.
- CLI: `serve`, `init`, `doctor [--ping]`.
