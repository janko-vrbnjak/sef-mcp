# SEF e-fakture uz Claude — uputstvo za korisnike

Za preduzetnike, vlasnike firmi i knjigovođe. Bez terminala, bez programiranja, bez menadžera lozinki.

## Šta dobijate

Kažete Claude-u „Napravi fakturu za Acme za oktobar, 40 sati po 5.000 dinara“. Claude pripremi e-fakturu, pokaže vam kupca, stavke i iznos, i **tek kad vi kažete „pošalji“** faktura ide na SEF. Možete pitati i za status fakture, otkazati je ili stornirati.

Sve radi na vašem računaru. Vaš SEF ključ se čuva u sigurnom skladištu sistema (Keychain na Mac-u, Credential Manager na Windows-u) i nikad ne ide nikome drugom osim SEF-u.

## Šta vam treba

- Claude aplikacija za računar (Mac ili Windows)
- Nalog na SEF-u (efaktura.mfin.gov.rs) — onaj koji već koristite
- Oko 20 minuta za prvo podešavanje

SEF alati rade samo u razgovorima i zadacima koji se izvršavaju **na vašem računaru**, u Claude aplikaciji za računar. U Claude-u na webu ili u zadatku koji radi u oblaku nisu dostupni. Ako Claude kaže da SEF alati nisu dostupni, otvorite razgovor u aplikaciji za računar (ili izaberite „Link to this computer“).

## Podešavanje u 5 koraka

### 1. Instalirajte ekstenziju „SEF e-fakture“

Preuzmite **[sef-mcp.mcpb](https://github.com/janko-vrbnjak/sef-mcp/releases/latest/download/sef-mcp.mcpb)** (uvek najnovija verzija), dva puta kliknite na fajl i u Claude aplikaciji izaberite **Install**.

Sve verzije i opis izmena: [stranica izdanja](https://github.com/janko-vrbnjak/sef-mcp/releases).

### 2. Napravite probni (demo) ključ

1. Prijavite se na **demo** SEF: demoefaktura.mfin.gov.rs
2. Otvorite **SEF Administrator → API** i generišite ključ.
3. U Claude aplikaciji otvorite podešavanja ekstenzije **SEF e-fakture** i ključ nalepite u polje **„API ključ — demo SEF“**.
4. Polje **„Okruženje“** ostavite na `demo`.

Ključ nikad ne lepite u razgovor sa Claude-om — samo u ovo polje.

### 3. Dodajte skillove „sef-fakture“

Skillovi Claude-u govore kako da vas vodi kroz podešavanje i fakturisanje. Preporučen način, jer se tada sami ažuriraju:

1. U Claude aplikaciji otvorite **Customize → Plugins**.
2. Izaberite **Add marketplace** i upišite `janko-vrbnjak/sef-mcp`.
3. Instalirajte **sef-fakture**.
4. Na tom marketplace-u uključite **Sync automatically**.

Bez automatskog ažuriranja: preuzmite **[sef-fakture.plugin](https://github.com/janko-vrbnjak/sef-mcp/releases/latest/download/sef-fakture.plugin)** i otvorite ga u Claude aplikaciji.

### 4. Recite Claude-u: „Podesi moju firmu za SEF“

Claude će vas pitati za naziv, PIB, matični broj, adresu, račun i da li ste u sistemu PDV-a, a zatim za vaše kupce. Možete mu poslati i staru fakturu, pa će podatke prepisati. Pre svakog čuvanja pokazaće vam pregled koji potvrđujete.

PDV pravilo (npr. „nije obveznik PDV-a, član 33“) potvrdite sa svojim knjigovođom.

### 5. Probna faktura

Recite „Napravi probnu fakturu“. Faktura ide na **demo** SEF i nema poreski efekat. Proverite je na demo portalu.

## Prelazak na prave fakture

Tek kad je proba prošla (i knjigovođa je video probnu fakturu):

1. Na pravom SEF-u (efaktura.mfin.gov.rs) napravite ključ u **SEF Administrator → API** i nalepite ga u polje **„API ključ — produkcija“**.
2. **„Okruženje“** promenite u `prod`.
3. Uključite **„Dozvoli slanje pravih faktura“**.

Oba podešavanja (2 i 3) su potrebna. To je namerno, da se prava faktura nikad ne pošalje greškom.

Kad Claude traži dozvolu za slanje, otkazivanje ili storno, **nikad ne birajte „uvek dozvoli“**.

## Ažuriranja

- **Skillovi** se ažuriraju sami ako ste ih dodali preko marketplace-a i uključili **Sync automatically**.
- **Ekstenzija** se za sada ne ažurira sama. Kada izađe nova verzija koja vam treba, Claude će vam to reći i dati link: preuzmite fajl, dva puta kliknite i izaberite **Install**. Podaci o firmi, kupci, nacrti i podešavanja ostaju.

## Česta pitanja

**Nemam menadžer lozinki.** Ne treba vam. Ključ čuva sam operativni sistem.

**Koristim drugi menadžer lozinki (Bitwarden, 1Password, …).** U menadžeru čuvajte rezervnu kopiju ključa, a u ekstenziju ga nalepite jednom.

**Koristim ChatGPT, ne Claude.** ChatGPT za sada može da se poveže samo sa serverima na internetu, a ne sa programom na vašem računaru, pa ovaj alat tamo još ne radi. Vidi [ADR 0003](adr/0003-distribution-mcpb-plugin-and-gpt.md).

**Ja sam knjigovođa i fakturišem za više firmi.** Trenutno jedna instalacija važi za jednu firmu. Podrška za više firmi je u planu ([roadmap](roadmap.md)).

**Gde su moji podaci?** U folderu za podatke iz podešavanja ekstenzije: podaci o firmi i kupcima, nacrti i dnevnik slanja; PDF prilozi u podfolderu `prilozi` (ako niste izabrali poseban folder za priloge). Ako folder niste izabrali, to je skriveni folder `.sef-mcp` u vašem korisničkom folderu — pitajte Claude-a „gde su moji SEF podaci?“ i reći će vam tačnu putanju. Ništa se ne šalje nikome osim SEF-u. Vidi [privatnost](privatnost.md).

**Pogrešio sam fakturu.** Recite „storniraj fakturu …“ ili „otkaži fakturu …“. Claude će proveriti status na SEF-u i predložiti pravu radnju.

**SEF je vratio grešku.** Claude će vam objasniti šta znači i šta možete da uradite. Ako to ne pomogne, javite se za podršku.

## Podrška

- Prijava problema: [GitHub issues](https://github.com/janko-vrbnjak/sef-mcp/issues) (bez ključeva i bez pravih podataka kupaca!)
- Pomoć pri podešavanju i podrška: support@valorys.rs

Alat nije zvaničan proizvod Ministarstva finansija. Za sadržaj i poresku ispravnost faktura odgovara izdavalac.
