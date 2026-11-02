# Security policy

sef-mcp handles credentials that can issue legally binding invoices. Security reports get priority over features.

## Reporting a vulnerability

Please **do not** open a public issue. Use GitHub's *Report a vulnerability* (private advisory) on this repository. Include steps to reproduce and impact. Expect an acknowledgement within 5 working days.

## Supported versions

Only the latest minor release receives fixes until 1.0.

## Design guarantees (see docs/technical-spec.md §7)

- API key accepted only from the environment; never written to disk, logs, audit log or tool output.
- Only `efaktura.mfin.gov.rs` and `demoefaktura.mfin.gov.rs` are contacted; redirects refused.
- Default environment is demo; production writes require two explicit switches.
- Sending requires a stored draft and its approval code; tampering is detected.
- Attachments are confined to one directory (symlink-safe), PDF only, size-limited.

## Your responsibilities as an operator

- Keep keys in a secret manager; use separate demo and production keys.
- Never enable "always allow" for `sef_send_invoice` or `sef_cancel_invoice` in your MCP client.
- Keep the data directory private; it contains invoice data.
- Rotate the SEF API key if you suspect exposure (SEF account settings).

## Contributor rules

- No new runtime dependency without discussion in an issue.
- No `postinstall`/install scripts.
- Never log request headers or raw environment.
- Any change touching `env.ts`, `safety.ts`, `sef/client.ts`, `store.ts` or tool annotations needs a test and a second reviewer.
