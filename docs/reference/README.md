# Reference snapshots

Official SEF documents this project is built against. Keep a dated copy here so code reviews and AI tools can check rules without network access, and so changes between editions are visible in git.

| File (suggested name) | Source | Edition |
|---|---|---|
| `sef-api-spec-2026-07-31.pdf` | https://www.efaktura.gov.rs/extfile/sr/8682/API%20dokumentacija_31_07_2026.pdf | 31.07.2026 |
| `sef-itu-2026-10-01.pdf` | https://www.efaktura.gov.rs/extfile/sr/8679/%D0%A1%D0%95%D0%A4%2001%20okt%202026.pdf | 01.10.2026 |
| `sef-release-4.2.0.pdf` | https://efaktura.gov.rs/extfile/sr/11128/ (SEF detalji nove verzije 4.2.0) | 01.10.2026 |
| Beleške izdanja (indeks) | https://www.efaktura.gov.rs/tekst/en/5624/sef-updates-and-versions.php | live |
| `sef-swagger-YYYY-MM-DD.json` | https://efaktura.mfin.gov.rs/swagger/index.html → the JSON definition it loads | download date |

Rules:
- Only official, public documents. Never put real invoices or SEF responses here.
- New edition → add a new file (don't overwrite), update the table and `docs/technical-spec.md` §0, and note behaviour changes in CHANGELOG.
- `.gitignore` excludes `*.pdf` globally; this folder is re-included.
