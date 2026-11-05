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

**Netehnički korisnik (Claude ekstenzija + skill `sef-podesavanje`, ADR 0003):**
1. Instalacija `.mcpb` dvoklikom; demo ključ se unosi u podešavanja ekstenzije (sigurno skladište sistema), nikad u razgovor.
2. Bez profila server radi u režimu podešavanja; asistent pita za podatke firme i poziva `sef_setup_company` → pregled → izričita potvrda → upis.
3. Isto za svakog kupca (`sef_add_customer`).
4. `sef_ping`, pa probna faktura na demo okruženju.

Kriterijum prihvatanja: korisnik bez tehničkog znanja završi korake 1–4 sam za manje od 30 minuta.

**Tehnički korisnik:**
1. `sef-mcp init` pravi profil iz primera (ili isti alati za podešavanje).
2. Validacija javlja tačno polje i razlog greške.
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
| BR-12 | Šifra datuma nastanka poreske obaveze (3/35/432) šalje se samo kada neka stavka ima kategoriju `S`; inače je SEF odbija (potvrdila podrška SEF-a 04.11.2026). |
| BR-17 | Slanje ide **bez SEF validacije** (`executeValidation=false`), kao sa portala: podrška SEF-a je 05.11.2026 potvrdila da opcija „Izvrši validaciju” još nije u funkciji. Sopstvene provere pre slanja (BR-15, BR-16) i dalje važe. `executeValidation=true` samo na izričit zahtev korisnika, uz upozorenje i poseban `requestId`. |

## 6. Otvorena pitanja

| # | Pitanje | Kako zatvoriti |
|---|---|---|
| Q1 | ~~Tačan `CustomizationID`~~ | **Zatvoreno:** ITU 01.10.2026 §1.3 → `urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.rs:srbdt:2022` (tabela u ITU ima slovnu grešku `compliantt`) |
| Q2 | ~~Prodavac van PDV-a u `PartyTaxScheme`~~ | **Zatvoreno:** u fakturi koju je SEF prihvatio (oktobar 2026) prodavac van PDV-a ima `RS{PIB}` / `VAT`, a stavke `SS` / 0 / `PDV-RS-33`. ITU (`NO-VAT` / `RS-VAT-STATUS`) to ne opisuje — praksa ima prednost, pokriveno golden testom. |
| Q3 | ~~Broj i veličina priloga~~ | **Zatvoreno (potvrdio održavalac):** najviše 2 priloga, po 1 MB; podesivo. |
| Q4 | ~~Jedinica mere~~ | **Zatvoreno:** `MON` i `HUR` prihvaćeni (golden fixture); pun spisak `GET /api/publicApi/get-unit-measures`. |
| Q5 | ~~Šta radi `executeValidation`~~ | **Zatvoreno:** podrška SEF-a 05.11.2026 — opcija „Izvrši validaciju” još nije u funkciji. Na demo okruženju uz `true` odbija ispravne fakture neobveznika PDV-a (`RS-R-005`), uz `false` ih prihvata (04.11.2026). Podrazumevano `false` (BR-17). |
| Q6 | ~~Demo base URL~~ | **Zatvoreno:** `https://demoefaktura.mfin.gov.rs` (swagger: `/swagger/index.html`). |
| Q7 | ~~Format računa u `PayeeFinancialAccount`~~ | **Zatvoreno:** 18 cifara bez crtica (golden fixture). |
| Q8 | Da li kupac van PDV-a sme da ima `PartyTaxScheme` — sada se izostavlja kada je `vatRegistered: false` | Demo test sa takvim kupcem |
| Q9 | ~~BT-8 kod faktura bez stavki `S`~~ | **Zatvoreno:** podrška SEF-a 04.11.2026 — šifra se ne navodi kada ne nastaje obaveza obračuna PDV-a; dozvoljene su samo 3, 35, 432 (BR-12). `RS-R-005` dolazi iz SEF validacije koja još nije u funkciji (podrška 05.11.2026, vidi Q5); slanje bez nje je podrazumevano (BR-17). Demo: VLR-2026-902 prihvaćena bez validacije 04.11.2026. |
