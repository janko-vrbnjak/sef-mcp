# Roadmap

Stanje: 06.11.2026, posle izdanja 0.4.0.

## Izdato

| Verzija | Šta je donela |
|---|---|
| 0.1.0 | Jezgro: profil firme, nacrt, dvostepeno slanje sa kodom odobrenja, status, otkazivanje, audit log |
| 0.2.x | Usklađenost sa SEF 4.2.0 i golden test iz prihvaćene fakture; podešavanje kroz razgovor; Claude ekstenzija (`.mcpb`) i skillovi; objašnjenja SEF grešaka; storno; automatski release |
| 0.3.0 | Repozitorijum kao marketplace sa automatskim ažuriranjem skillova; provera verzije ekstenzije bez mreže |
| 0.4.0 | Gotovi upiti (MCP prompts) i referentni dokumenti (MCP resources); upis u zvanični MCP Registry |

## Sledeće

| Verzija | Cilj | Uslov za završetak |
|---|---|---|
| **0.5** | Provera u stvarnoj upotrebi | ⏳ Prva prava faktura u produkciji preko konektora (novembar 2026, plan: posle demo testiranja do kraja novembra); ⏳ povratne informacije 2–3 korisnika van projekta, cilj samostalno podešavanje za < 30 min; ⏳ ispravljene najveće prepreke iz tih povratnih informacija; ⏳ Q8 i Q9 zatvorena ili jasno opisana |
| **0.6** | Svakodnevna upotreba | Predlog sledećeg broja fakture; knjižno odobrenje (381); `RateProvider` za srednji kurs NBS (napomena na fakturi) |
| **0.7** | Knjigovođe | Više firmi u jednoj instalaciji (profil + ključ po firmi, izbor firme u razgovoru) |
| **1.0** | Stabilno javno izdanje | Stabilan profil v1, potpisani release, security review; npm paket sa provenance ako postoji potreba van ekstenzije |
| kasnije | GPT (ChatGPT Business) | Prvo: skill koji pravi UBL XML za ručni uvoz u SEF portal (bez ključa). Hostovani konektor samo uz poseban bezbednosni dizajn — vidi ADR 0003 |
| kasnije | Udaljeni konektor | HTTP transport + OAuth + skladište ključeva po korisniku, tek uz poseban bezbednosni dizajn |
| kasnije | Ulazne fakture | Pregled, prihvatanje/odbijanje (`purchase-invoice`, `purchase-invoice/xml`, `purchase-invoice/changes`) |
| kasnije | Arhiva | Preuzimanje XML-a, potpisa i PDF-a istorije statusa poslatih faktura (`sales-invoice/xml`, `sales-invoice/signature`, `sales-invoice/status-history/pdf` — SEF 4.0.0) u lokalnu arhivu; praćenje promena (`sales-invoice/changes`) |

## Distribucija i vidljivost

| Korak | Status | Napomena |
|---|---|---|
| GitHub Release sa stabilnim linkovima za preuzimanje | ✅ 0.2.0 | `releases/latest/download/…` |
| Marketplace sa automatskim ažuriranjem skillova | ✅ 0.3.0 | |
| Zvanični MCP Registry | ✅ 0.4.0 | `io.github.janko-vrbnjak/sef-mcp` |
| Anthropic direktorijum (plugin sa skillovima) | ⏳ prijava | Ne zavisi od javne objave; pregled traje, pa prijava ide odmah |
| LobeHub i Glama: preuzimanje postojećih listinga | ⏳ | Posle prijave u direktorijum |
| Javna objava (LinkedIn, Instagram, Facebook) | ⏳ | Kada su ispunjeni uslovi ispod |
| Radionice | stalno | Podešavanje konektora je deo programa; podrška se naplaćuje po hitnosti |

### Uslovi za javnu objavu

1. Prva prava faktura poslata preko konektora i prihvaćena na SEF-u, uz izmereno vreme od zahteva do slanja.
2. Bar dve osobe van projekta su same instalirale ekstenziju; najveće prepreke su ispravljene u 0.5.x.
3. Za developere: 3–5 issue-a sa oznakom `good first issue` (npr. knjižno odobrenje, kurs NBS, ulazne fakture), da doprinos ima jasan početak.
4. README na prvom ekranu kaže šta je, za koga je i kako se instalira, sa linkom na uputstvo za korisnike.
5. Rezervisano vreme za odgovore na komentare i pitanja u prvih nekoliko dana posle objave, u okviru mesečnog kapaciteta.
6. Bez imena klijenata i bez brojki o njihovoj uštedi vremena, osim uz njihovu dozvolu i izmerene podatke.
