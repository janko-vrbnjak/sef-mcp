# sef-mcp

> **EN:** Local-first [MCP](https://modelcontextprotocol.io) server that lets an AI assistant (Claude Desktop, Claude Code, Cursor…) draft and send e-invoices to the Serbian **SEF** (Sistem elektronskih faktura). Safe by default: demo environment, two-step send with human approval, secrets only via a secret manager. Company-specific rules live in a local profile, not in code.

MCP server koji AI asistentu omogućava da **pripremi i pošalje izlaznu e-fakturu na SEF** — na tvom računaru, sa tvojim API ključem, bez posrednika.

## Niste programer?

**→ [Uputstvo za korisnike](docs/za-korisnike.md)**: instalacija dvoklikom u Claude aplikaciji, bez terminala, bez Node.js-a i bez menadžera lozinki. Podaci o firmi i kupcima se unose kroz razgovor.

Ostatak ove stranice je za tehničke korisnike i developere.

## Zašto još jedan SEF MCP

| | Hostovani MCP servisi | sef-mcp |
|---|---|---|
| Gde ide tvoj API ključ | Kroz tuđi server | Ostaje na tvom računaru |
| Ko vidi fakture | Treća strana | Samo ti i SEF |
| Slanje | Jedan poziv | Nacrt → tvoje odobrenje → slanje |
| Pravila firme (PDV status, kupci, numeracija) | U promptu | U lokalnom profilu, validirano |
| Podrazumevano okruženje | Različito | **demo** (bez poreskog efekta) |

## Šta ume (v0.1)

| Alat | Šta radi | Menja stanje? |
|---|---|---|
| `sef_check_setup` | Okruženje, sigurnosni prekidači, profil | ne |
| `sef_setup_company` | Podešava firmu kroz razgovor (pregled → potvrda) | samo lokalno |
| `sef_add_customer` | Dodaje ili menja kupca (pregled → potvrda) | samo lokalno |
| `sef_ping` | Proverava ključ i vezu sa SEF-om | ne |
| `sef_list_customers` | Kupci iz profila | ne |
| `sef_list_vat_exemption_reasons` | Zvanične šifre izuzeća (npr. `PDV-RS-33`) | ne |
| `sef_list_unit_measures` | Zvanične jedinice mere (npr. `MON`, `HUR`, `H87`) | ne |
| `sef_draft_invoice` | Pravi UBL fakturu lokalno, vraća iznose i `approvalCode` | samo lokalno |
| `sef_get_draft` | Čita nacrt (opciono sa XML-om) | ne |
| `sef_send_invoice` | Šalje **odobren** nacrt na SEF | **da** |
| `sef_get_invoice` / `sef_list_invoice_ids` | Status i pregled poslatih faktura | ne |
| `sef_cancel_invoice` | Otkazuje fakturu u statusu Nacrt / Nova / Greška pri slanju | **da** |
| `sef_storno_invoice` | Stornira fakturu u statusu Poslata / Prihvaćena / Odbijena | **da** |

## Brzi početak

```bash
git clone <repo> sef-mcp && cd sef-mcp
npm install && npm test
node dist/src/index.js init ~/.config/sef-mcp/profile.json   # pa popuni podatke firme
```

Zatim prati **[docs/setup.md](docs/setup.md)**: API ključ u 1Password-u (ili drugom secret manageru), povezivanje sa Claude Desktop / Claude Code / Cursor, prvi test na demo okruženju.

## Bezbednost ukratko

- Podrazumevano `SEF_ENV=demo`. Produkcija traži **dva** prekidača: `SEF_ENV=prod` i `SEF_MCP_ALLOW_PROD_WRITE=true`.
- Slanje zahteva `draftId` + `approvalCode` (prvih 8 znakova SHA-256 XML-a) — šalje se tačno verzija koju si video.
- Ključ se nikad ne loguje, ne vraća iz alata i ne čuva na disku. Prihvata se samo iz okruženja.
- Klijent komunicira isključivo sa `efaktura.mfin.gov.rs` / `demoefaktura.mfin.gov.rs`.
- Prilozi samo iz jednog dozvoljenog foldera, samo PDF, sa ograničenjem veličine.
- Lokalni audit log (`audit.jsonl`) svakog nacrta, slanja i otkazivanja.

Detalji: [SECURITY.md](SECURITY.md) i [docs/technical-spec.md](docs/technical-spec.md).

## Status

**v0.1 — rana faza.** Usklađeno sa **SEF 4.2.0** (pravila iz izdanja 3.14–4.2.0, vidi tehničku specifikaciju §11), API specifikacijom od 31.07.2026 i ITU od 01.10.2026. UBL generator reprodukuje strukturu fakture koju je SEF prihvatio u produkciji (golden test). Pre produkcije još: test na demo okruženju (`executeValidation=true`). Vidi [docs/roadmap.md](docs/roadmap.md).

## Dokumentacija

- [Uputstvo za korisnike (bez programiranja)](docs/za-korisnike.md)
- [Privatnost](docs/privatnost.md)
- [Funkcionalna specifikacija](docs/functional-spec.md)
- [Tehnička specifikacija](docs/technical-spec.md)
- [Podešavanje za tehničke korisnike](docs/setup.md)
- [Pakovanje: Claude ekstenzija i skillovi](docs/technical-spec.md#12-packaging-and-release)
- [Odluke o arhitekturi (ADR)](docs/adr/)
- [Doprinos projektu](CONTRIBUTING.md)

## Odricanje odgovornosti

Ovo nije zvaničan alat Ministarstva finansija. Odgovornost za sadržaj i poresku ispravnost faktura ostaje na izdavaocu. Poreske kategorije i šifre izuzeća potvrdi sa svojim knjigovođom.

## Licenca

[MIT](LICENSE)
