# AGENTS.md — rules for AI coding assistants

You are working on **sef-mcp**, a local-first MCP server for the Serbian e-invoicing system (SEF). Mistakes here can issue legally binding invoices or leak credentials. Prefer safety over convenience.

## Read first
1. `docs/functional-spec.md` — what and why (business rules BR-x, open questions Q-x)
2. `docs/technical-spec.md` — architecture, contracts, SEF API and UBL mapping, threat model
3. `docs/adr/` — decisions you must not silently reverse
4. Normative SEF sources are listed in technical-spec §0. If you rely on a SEF rule, cite the document and section; never invent one.

## Commands
- `npm install`
- `npm test` — build + all tests (must stay green)
- `npm run typecheck`
- `node dist/src/index.js doctor` — config check (needs `SEF_MCP_PROFILE`)

## Hard rules
- `test/golden.test.ts` encodes the UBL SEF itself produced for a portal-created production invoice (not an API upload). If a change breaks it, the change is wrong unless a newer accepted invoice proves otherwise.
- Never send without SEF validation on your own: `executeValidation=false` is only for a draft SEF validation already rejected, with the user's explicit consent (Q9).
- Never call the real SEF API from tests or scripts. Use the `fetchImpl` injection in `SefClient`.
- Never add code that logs, prints, persists or returns `SEF_API_KEY` or request headers.
- Never add an environment variable that changes the SEF base URL.
- Never weaken: demo default, `SEF_MCP_ALLOW_PROD_WRITE`, `SEF_MCP_READ_ONLY`, approvalCode check, hash re-verification, attachment confinement, destructive tool annotations.
- Money only via `src/money.ts` (BigInt). No floats for amounts.
- Profile writes go only through `src/setup.ts` (preview → confirmCode → atomic write + backup). Never add a tool that writes the profile in one step.
- Skills in `plugins/sef-fakture` encode the user-facing safety rules (approval per draft, environment banner, no keys in chat). Keep them in sync with tool names and behaviour.
- `src/ubl/build.ts` stays pure and deterministic.
- stdout belongs to the MCP protocol: diagnostics → stderr.
- No new runtime dependency without the maintainer's approval.
- Do not create git commits; leave changes staged for the maintainer.
- Never put real company data in examples or fixtures.

## When you add or change a tool
zod input schema → logic in `tools.ts` → registration with annotations in `server.ts` → test in `test/` → update README tool table + technical-spec §4 + CHANGELOG.

## When unsure about SEF rules
Do not guess tax categories, codes or XML structure. Mark it as an open question in `docs/functional-spec.md` §6 and ask the maintainer.
