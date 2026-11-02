# Contributing

Thanks for helping! Issues and PRs in **English or Serbian** are welcome.

## Before you start

- Bugs: open an issue with steps, expected vs. actual, and (anonymised!) XML or SEF error text.
- Features: open an issue first; check [docs/roadmap.md](docs/roadmap.md) and the ADRs in `docs/adr/`.
- Security issues: see [SECURITY.md](SECURITY.md) — never in public issues.

## Never commit

- API keys, `.env` files with real values, real profiles, real invoices or SEF responses with company data.
- Test fixtures must be anonymised (fake PIB/MB, names, accounts).

## Development

```bash
npm install
npm test         # build + node:test
npm run typecheck
```

Requirements for a PR:

1. `npm test` green; new behaviour has tests (tool flows use a fake `fetch`, never the real SEF).
2. Docs updated: README tool table, `docs/technical-spec.md` (contracts, mapping), CHANGELOG under *Unreleased*.
3. Architecture-level change → new ADR in `docs/adr/`.
4. No new runtime dependency without prior agreement in an issue.
5. Small, focused PRs; conventional commit style (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).

## Code style

- TypeScript strict, ESM, Node ≥ 20.11.
- Money only through `src/money.ts` (BigInt), never `number`.
- `src/ubl/build.ts` stays pure (no I/O, no clock).
- Server code writes diagnostics to **stderr** only — stdout is the MCP channel.
- Business logic goes in `tools.ts`, not in `server.ts`.

## Working with AI coding tools

`AGENTS.md` (and `CLAUDE.md`) describe the project rules for Claude Code, Cursor and similar tools. Keep them updated when conventions change.
