# ADR 0003 — Distribution for non-technical users: MCPB extension + skills plugin; GPT path open

Date: 2026-11-04 · Status: accepted (Claude part) · GPT part: proposed, decision pending

## Context
Target users now include non-technical entrepreneurs and accountants who use AI tools for operations: no Node.js, often no password manager, no terminal. The project stays MIT, free, and is offered through Valorys workshops; support is sold separately by urgency level. One known pilot user works in ChatGPT Business.

## Decision (Claude)
1. **Engine stays one codebase** (ADR 0001). New: setup mode when no profile exists, and guided tools `sef_setup_company` / `sef_add_customer` with the same preview → confirm pattern as invoices (ADR 0002), so nobody edits JSON. Known SEF errors get Serbian explanations.
2. **Claude Desktop extension (`.mcpb`)** built by `npm run pack:mcpb` from `packaging/mcpb/manifest.json`. Claude Desktop ships its own Node.js; API keys are `sensitive` user_config fields stored in the OS keychain and passed as `SEF_API_KEY_DEMO` / `SEF_API_KEY_PROD`. The two production switches map to the `sef_env` and `allow_prod_write` fields.
3. **Skills plugin `sef-fakture`** (`plugins/sef-fakture`, `npm run pack:plugin`) with `sef-podesavanje` (onboarding) and `sef-fakturisanje` (daily use). The plugin carries no server; it depends on the extension. Skills hard-code the safety rules: approval per draft, environment banner, no keys in chat, no guessing money/dates/PIB/tax.
4. Technical users keep the existing path (git clone, `op run`, any MCP client).
5. Releases attach `sef-mcp-<v>.mcpb` and `sef-fakture-<v>.plugin` to GitHub Releases. Marketplaces (e.g. Agensi) may list the skill for free, pointing to the release page.

## GPT (ChatGPT Business) — findings and options
Findings (Nov 2026): ChatGPT custom connectors accept only **remote MCP servers over HTTPS** (OAuth); write-capable tools are available on Business/Enterprise. Local stdio servers are not supported. ChatGPT also supports skills, but skill code runs in OpenAI's environment, which cannot hold the user's SEF key safely or reach SEF on their behalf by design of this project.

| Option | What it means | Assessment |
|---|---|---|
| A. Hosted sef-mcp | We run a server that stores users' SEF keys and sends invoices | Contradicts local-first; key custody, OAuth, uptime, liability. Not without a separate security design and legal review. |
| B. Self-hosted remote | User runs sef-mcp + HTTPS tunnel + OAuth | Too technical for the target users. |
| C. GPT skill without API | Skill builds the UBL XML; the user uploads it in the SEF portal ("Uvoz UBL datoteke") | No key anywhere outside SEF; keeps a human step. Needs validation: can the builder run in ChatGPT's skill environment (Python?), and how to prevent duplicate manual uploads. |
| D. Claude for the SEF step | GPT-first users install the Claude extension only for invoicing | Works today; extra app. |

Proposal: D for pilots now; prototype C as the GPT path; A only after an explicit decision with its own ADR.

## Consequences
- `SEF_MCP_PROFILE` is optional (default `<dataDir>/profile.json`).
- One profile per installation: accountants with many clients need a multi-company design (roadmap).
- Support load is bounded by the safety rules in the skills and by plain-language errors; remaining support is a paid service, outside this repo.
