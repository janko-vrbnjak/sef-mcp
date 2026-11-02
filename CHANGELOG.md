# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/), versions: [SemVer](https://semver.org/).

## [Unreleased]

## [0.1.0] — 2026-11-02
### Added
- Generic core configured by a local company profile (ADR 0001).
- Tools: check_setup, ping, list_customers, list_vat_exemption_reasons, draft_invoice, get_draft, send_invoice, get_invoice, list_invoice_ids, cancel_invoice.
- UBL 2.1 / SRB-CIUS builder with BigInt money arithmetic (to be validated against SEF — see roadmap 0.2).
- Two-step send with approval code, prod double switch, read-only mode (ADR 0002).
- Local drafts and append-only audit log.
- CLI: `serve`, `init`, `doctor [--ping]`.
