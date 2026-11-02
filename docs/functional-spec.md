# Funkcionalna specifikacija — sef-mcp

Verzija dokumenta: 0.2 · Datum: 2026-11-02 · Status: nacrt

Izvori: SEF 4.2.0 (beleške izdanja 3.15.0–4.2.0), SEF API specifikacija 31.07.2026, SEF ITU 01.10.2026, zvanični swagger (vidi technical-spec §0 i §11).

## 1. Svrha

Preduzetnik ili mala firma u Srbiji izdaje mali broj izlaznih faktura mesečno, uglavnom istim kupcima. Ručno unošenje na SEF je sporo i podložno greškama u PIB-u, iznosima i datumima. sef-mcp omogućava da AI asistent pripremi tačnu e-fakturu iz opisa na prirodnom jeziku, a čovek je odobri pre slanja.

## 2. Korisnici

| Uloga | Potreba |
|---|---|
| Preduzetnik / vlasnik firme | Brzo i tačno izdavanje redovnih faktura bez ERP-a |
| Knjigovođa | Pouzdan trag šta je, kada i kome poslato |
| Developer / integrator | Proširiv, testiran kod koji može da prilagodi klijentu |

## 3. Obim v0.1

**U obimu**
- Izlazne komercijalne fakture (tip 380) u RSD.
- Obveznici u sistemu PDV-a i van njega (kategorija i šifra izuzeća iz profila).
- Kupci iz privatnog sektora i javni sektor (JBKJS, slanje na CRF preko `sendToCir`).
- PDF prilozi (npr. specifikacija usluga) ugrađeni u UBL.
- Provera statusa, lista poslatih faktura, otkazivanje i storno.
- Lokalni profil firme, nacrti, audit log.

**Van obima v0.1** (vidi [roadmap](roadmap.md))
- Knjižna odobrenja/zaduženja (381/383), avansne fakture (386).
- Ulazne fakture (prihvatanje/odbijanje).
- Automatski kurs NBS i preračun deviznih iznosa.
- Automatska numeracija.
- Udaljeni (HTTP) server i claude.ai konektor.

## 4. Slučajevi korišćenja

### UC-1 Redovna mesečna faktura
1. Korisnik: „Napravi fakturu za kupca *acme* za oktobar: 40 h razvoja po 5.000 RSD, prilog specifikacija-oktobar.pdf.”
2. Sistem pravi nacrt iz profila (prodavac, kupac, rok plaćanja, PDV pravilo, broj ugovora) i vraća sažetak: broj, kupac, stavke, ukupno, `approvalCode`, upozorenja.
3. Korisnik pregleda i izričito odobri.
4. Sistem šalje tačno taj nacrt, upisuje audit zapis i vraća SEF identifikatore.

**Kriterijumi prihvatanja**
- Bez odobrenja nema mrežnog poziva prema SEF-u.
- Izmena XML-a posle nacrta onemogućava slanje.
- Ponovni pokušaj istog nacrta ne pravi duplikat na SEF-u (isti `requestId`).
- Upozorenje ako je isti broj fakture već uspešno poslat u tom okruženju.

### UC-2 Provera statusa
„Da li je kupac prihvatio fakturu 12345?” → `sef_get_invoice`.

### UC-3 Otkazivanje ili storno
„Poništi fakturu 12345, pogrešan iznos.” → asistent proverava status (`sef_get_invoice`):
- status Draft / New / Sending error → `sef_cancel_invoice`
- status Sent / Accepted / Rejected → `sef_storno_invoice`

Klijent pre poziva traži dozvolu. Pravila statusa su iz API specifikacije 31.07.2026.

Javni sektor (SEF 4.2.0): kada kupac odbije fakturu na SEF-u, povezana obaveza u CRF-u automatski prelazi u „Odbijena” ako je bila „Aktivna” (ako je „Započeta” ili „Izmirena”, ostaje nepromenjena). Ako kupac kasnije prihvati fakturu, SEF traži od CRF-a ponovnu aktivaciju.

### UC-4 Onboarding nove firme
1. `sef-mcp init` pravi profil iz primera.
2. Korisnik popunjava podatke; validacija javlja tačno polje i razlog greške.
3. `sef-mcp doctor --ping` potvrđuje ključ i okruženje.
4. Prva faktura na demo okruženju.

## 5. Poslovna pravila

| ID | Pravilo |
|---|---|
| BR-1 | Podrazumevano okruženje je demo. |
| BR-2 | Slanje/otkazivanje u produkciji zahteva `SEF_MCP_ALLOW_PROD_WRITE=true`. |
| BR-3 | `SEF_MCP_READ_ONLY=true` blokira svako slanje i otkazivanje. |
| BR-4 | Prodavac van sistema PDV-a ne može koristiti kategoriju `S`. |
| BR-5 | Kategorije osim `S`, `Z`, `O` zahtevaju šifru razloga izuzeća. |
| BR-6 | Iznosi se računaju decimalno (bez floating point), zaokruživanje half-up na 2 decimale po stavci i po poreskoj grupi. |
| BR-7 | Rok plaćanja: eksplicitan → podrazumevani za kupca → podrazumevani iz profila. |
| BR-8 | Kupac sa JBKJS se podrazumevano šalje na CRF (`sendToCir=Yes`). |
| BR-9 | Broj fakture mora odgovarati `numberPattern` ako je definisan. |
| BR-10 | Prilozi: samo PDF, samo iz dozvoljenog foldera. Podrazumevano najviše 2 priloga po ≤ 1 MB (ograničenja SEF-a); oba podesiva (`SEF_MCP_MAX_ATTACHMENTS`, `SEF_MCP_MAX_ATTACHMENT_BYTES`). |
| BR-13 | Napomene na fakturi: prvo opšte iz profila (npr. pravni osnov oslobađanja od PDV-a), zatim podrazumevane za kupca, pa one iz zahteva. |
| BR-15 | Kategorija PDV-a mora biti podržana na SEF-u; stopa > 0 samo za `S`, za ostale 0; povučene šifre izuzeća se odbijaju (SEF 3.15.0, 3.16.0, 3.17.1). |
| BR-16 | Količina i cena moraju biti veće od 0; svaka stavka ima jedinicu mere (SEF 4.0.0). |
| BR-14 | Jedinica mere: stavka → podrazumevana za kupca → podrazumevana iz profila. Česte: `MON` (mesec), `HUR` (sat), `H87` (komad); spisak preko `sef_list_unit_measures`. |
| BR-11 | Datum prometa je obavezan (SEF 3.14). Ako nije zadat: kraj perioda, pa datum izdavanja — uz upozorenje koje korisnik mora da potvrdi. Datum u budućnosti → upozorenje. |
| BR-12 | Šifra datuma nastanka poreske obaveze (3/35/432) šalje se samo kada neka stavka ima kategoriju `S`; inače je SEF odbija. |

## 6. Otvorena pitanja

| # | Pitanje | Kako zatvoriti |
|---|---|---|
| Q1 | ~~Tačan `CustomizationID`~~ | **Zatvoreno:** ITU 01.10.2026 §1.3 → `urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.rs:srbdt:2022` (tabela u ITU ima slovnu grešku `compliantt`) |
| Q2 | ~~Prodavac van PDV-a u `PartyTaxScheme`~~ | **Zatvoreno:** u fakturi koju je SEF prihvatio (oktobar 2026) prodavac van PDV-a ima `RS{PIB}` / `VAT`, a stavke `SS` / 0 / `PDV-RS-33`. ITU (`NO-VAT` / `RS-VAT-STATUS`) to ne opisuje — praksa ima prednost, pokriveno golden testom. |
| Q3 | ~~Broj i veličina priloga~~ | **Zatvoreno (potvrdio održavalac):** najviše 2 priloga, po 1 MB; podesivo. |
| Q4 | ~~Jedinica mere~~ | **Zatvoreno:** `MON` i `HUR` prihvaćeni (golden fixture); pun spisak `GET /api/publicApi/get-unit-measures`. |
| Q5 | Da li `executeValidation=true` vraća sve greške pre slanja kupcu | Demo test |
| Q6 | ~~Demo base URL~~ | **Zatvoreno:** `https://demoefaktura.mfin.gov.rs` (swagger: `/swagger/index.html`). |
| Q7 | ~~Format računa u `PayeeFinancialAccount`~~ | **Zatvoreno:** 18 cifara bez crtica (golden fixture). |
| Q8 | Da li kupac van PDV-a sme da ima `PartyTaxScheme` — sada se izostavlja kada je `vatRegistered: false` | Demo test sa takvim kupcem |
| Q9 | BT-8 (`InvoicePeriod/DescriptionCode`) kod faktura bez stavki `S` (npr. `SS` / `PDV-RS-33`). Produkcija je u oktobru 2026 prihvatila takvu fakturu **bez** BT-8 (golden fixture), a SEF 3.14 tada vraća `InvoicePeriodDescriptionCodeNotNeeded`. Demo je 02.11.2026 odbio istu strukturu: `RS-R-005 — Faktura treba da sadrži šifru datuma poreske obaveze (BT-8), osim za Dokument o smanjenju`. Beleške izdanja 3.15.0–4.2.0 ovu promenu ne pominju. Ponašanje se ne menja (BR-12) dok se ne razjasni. | 1) Demo test: ista faktura sa `DescriptionCode` 35. 2) Pitanje podršci SEF-a: da li je RS-R-005 na demo okruženju najava za produkciju i koja vrednost važi za neobveznika PDV-a. Menja se tek uz novu prihvaćenu fakturu (AGENTS.md). |
