# Funkcionalna specifikacija — sef-mcp

Verzija dokumenta: 0.1 · Datum: 2026-11-02 · Status: nacrt

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
- Provera statusa, lista poslatih faktura, otkazivanje.
- Lokalni profil firme, nacrti, audit log.

**Van obima v0.1** (vidi [roadmap](roadmap.md))
- Knjižna odobrenja/zaduženja (381/383), storno, avansne fakture.
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

### UC-3 Otkazivanje
„Otkaži fakturu 12345, pogrešan iznos.” → klijent traži dozvolu → `sef_cancel_invoice`. Dozvoljeno samo dok kupac nije postupio (pravilo SEF-a).

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
| BR-10 | Prilozi: samo PDF, samo iz dozvoljenog foldera, najviše 5, podrazumevano ≤ 5 MB po fajlu. |

## 6. Otvorena pitanja

| # | Pitanje | Kako zatvoriti |
|---|---|---|
| Q1 | Tačan `CustomizationID` koji SEF trenutno očekuje | Uporediti sa prihvaćenom fakturom + ITU dokumentom |
| Q2 | Da li prodavac van PDV-a treba `PartyTaxScheme` sa `RS{PIB}` | Isto + demo validacija |
| Q3 | Najveća dozvoljena veličina priloga na SEF-u | API dokumentacija / test |
| Q4 | Jedinica mere za sate (`HUR`) prihvaćena na SEF-u | `GET get-unit-measures` |
| Q5 | Da li `executeValidation=true` vraća sve greške pre slanja kupcu | Demo test |
