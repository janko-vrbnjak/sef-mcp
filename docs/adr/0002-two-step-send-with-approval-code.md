# ADR 0002 — Two-step send with approval code

Date: 2026-11-02 · Status: accepted

## Context
An invoice sent to SEF in production has legal and tax effect. An LLM can misread a request or be steered by injected text (e.g. from an email it was asked to summarise).

## Decision
- `sef_draft_invoice` builds and stores the XML locally; no network.
- `sef_send_invoice` requires `draftId` and `approvalCode` (first 8 hex of the XML SHA-256). The XML hash is re-verified before sending.
- Destructive tools carry `destructiveHint: true` so clients ask the human.
- Production writes need `SEF_ENV=prod` **and** `SEF_MCP_ALLOW_PROD_WRITE=true`.
- `requestId` is derived from the XML hash for idempotent retries.

## Consequences
- One extra step per invoice; acceptable for low volume.
- The approval code is not a cryptographic guarantee against a fully compromised client — it guarantees that the sent XML is the one that was summarised. The human approval prompt in the client is the real gate.
- A rejected draft cannot be resent unchanged (same requestId returns the original error); a new draft is required.
