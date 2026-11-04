# Roadmap

| Verzija | Cilj | Uslov za završetak |
|---|---|---|
| **0.1** (ovo) | Jezgro: profil, nacrt, dvostepeno slanje, status, otkazivanje, audit | Testovi zeleni, dokumentacija |
| **0.2** | Validacija na stvarnosti | ✅ Golden fixture iz SEF-om prihvaćene fakture; ✅ Q1–Q4, Q6, Q7 zatvorena; ⏳ Q5, Q8 i prvi pun ciklus na demo okruženju |
| **0.3** | Svakodnevna upotreba | Predlog sledećeg broja fakture; knjižno odobrenje (381) i storno; `RateProvider` za srednji kurs NBS (napomena na fakturi) |
| **0.4** | Onboarding drugih | ✅ Podešavanje kroz razgovor (`sef_setup_company`, `sef_add_customer`); ✅ Claude ekstenzija (`.mcpb`) i skillovi (`sef-fakture`); ✅ objašnjenja SEF grešaka; ⏳ test sa 2–3 netehnička korisnika (cilj: samostalno za < 30 min) |
| **0.5** | Knjigovođe | Više firmi u jednoj instalaciji (profil + ključ po firmi, izbor firme u razgovoru) |
| **1.0** | Javno izdanje | npm paket sa provenance, potpisani release, stabilan profil v1, security review |
| kasnije | GPT (ChatGPT Business) | Prvo: skill koji pravi UBL XML za ručni uvoz u SEF portal (bez ključa). Hostovani konektor samo uz poseban bezbednosni dizajn — vidi ADR 0003 |
| kasnije | Udaljeni konektor | HTTP transport + OAuth + skladište ključeva po korisniku, tek uz poseban bezbednosni dizajn |
| kasnije | Ulazne fakture | Pregled, prihvatanje/odbijanje (`purchase-invoice`, `purchase-invoice/xml`, `purchase-invoice/changes`) |
| kasnije | Arhiva | Preuzimanje XML-a, potpisa i PDF-a istorije statusa poslatih faktura (`sales-invoice/xml`, `sales-invoice/signature`, `sales-invoice/status-history/pdf` — SEF 4.0.0) u lokalnu arhivu; praćenje promena (`sales-invoice/changes`) |
