# AGENTS.md — rules for AI coding assistants

You are working on **sef-mcp**, a local-first MCP server for the Serbian e-invoicing system (SEF). Mistakes here can issue legally binding invoices or leak credentials. Prefer safety over convenience.

## Read first
1. `docs/functional-spec.md` — what and why (business rules BR-1…BR-10, open questions Q1–Q5)
2. `docs/technical-spec.md` — architecture, contracts, SEF API and UBL mapping, threat model
3. `docs/adr/` — decisions you must not silently reverse

## Commands
- `npm install`
- `npm test` — build + all tests (must stay green)
- `npm run typecheck`
- `node dist/src/index.js doctor` — config check (needs `SEF_MCP_PROFILE`)

## Hard rules
- Never call the real SEF API from tests or scripts. Use the `fetchImpl` injection in `SefClient`.
- Never add code that logs, prints, persists or returns `SEF_API_KEY` or request headers.
- Never add an environment variable that changes the SEF base URL.
- Never weaken: demo default, `SEF_MCP_ALLOW_PROD_WRITE`, `SEF_MCP_READ_ONLY`, approvalCode check, hash re-verification, attachment confinement, destructive tool annotations.
- Money only via `src/money.ts` (BigInt). No floats for amounts.
- `src/ubl/build.ts` stays pure and deterministic.
- stdout belongs to the MCP protocol: diagnostics → stderr.
- No new runtime dependency without the maintainer's approval.
- Do not create git commits; leave changes staged for the maintainer.
- Never put real company data in examples or fixtures.

## When you add or change a tool
zod input schema → logic in `tools.ts` → registration with annotations in `server.ts` → test in `test/` → update README tool table + technical-spec §4 + CHANGELOG.

## When unsure about SEF rules
Do not guess tax categories, codes or XML structure. Mark it as an open question in `docs/functional-spec.md` §6 and ask the maintainer.
