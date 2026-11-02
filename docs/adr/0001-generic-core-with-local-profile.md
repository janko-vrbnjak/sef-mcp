# ADR 0001 — Generic core, company rules in a local profile

Date: 2026-11-02 · Status: accepted

## Context
The first user is a non-VAT-registered company (category `SS`, `PDV-RS-33`, monthly invoices to fixed customers). The project should also serve other entrepreneurs. Two options: a generic core plus per-company forks (`<company>-sef-mcp`), or one codebase configured by a profile.

## Decision
One codebase. Everything company-specific (seller identity, VAT status, default tax rule, customers, numbering, due days) lives in a validated JSON profile outside the repo. Secrets live only in the environment.

## Consequences
- No forks to keep in sync; fixes reach everyone.
- Onboarding = writing a profile (`sef-mcp init`, later interactive).
- A company that needs behaviour the profile cannot express (custom calculation, ERP sync) should get an **extension point** in the core, not a fork. A fork is acceptable only for private integrations that cannot be generalised.
