# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/), versions: [SemVer](https://semver.org/).

## [Unreleased]
### Added
- SEF 4.2.0 baseline: pre-upload checks for rules from releases 3.15.0–4.0.0 (`src/ubl/rules.ts`, `test/rules.test.ts`): supported tax categories (`VATCategoryNotAllowed`), rate only for `S` (`UBLTaxCategoryPercentNotAllowed`), withdrawn exemption code PDV-RS-36b-6, positive quantity and price, mandatory unit of measure. Same tax checks run on the profile.
- Compliance matrix in technical-spec §11.
- Golden test against an anonymised invoice SEF accepted in production (`test/fixtures/accepted-non-vat-services.xml`).
- `sef_list_unit_measures` tool.
- Profile: `invoiceDefaults.notes`, `customers[].vatRegistered` (default true), `customers[].defaults.{notes, unitCode, orderNumber}`; unit codes validated.
- `SEF_MCP_MAX_ATTACHMENTS` (default 2).
- `sef_storno_invoice` tool (SEF allows storno for Sent / Accepted / Rejected).
- Normative sources table (API spec 31.07.2026, ITU 01.10.2026, swagger) in technical spec.

### Changed
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
