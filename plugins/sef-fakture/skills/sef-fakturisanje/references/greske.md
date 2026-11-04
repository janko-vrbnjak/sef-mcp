# SEF greške — objašnjenja

Codes below are documented in SEF release notes or were observed in real responses. Do not add guesses here.

| Šifra / status | Šta znači | Šta korisnik može da uradi | Izvor |
|---|---|---|---|
| `InvoiceDeliveryDateMissing` | Nedostaje datum prometa | Zadati datum prometa, novi nacrt | SEF 3.14 |
| `InvoicePeriodDescriptionCodeNotDefined` | Faktura sa PDV-om (S) nema šifru datuma poreske obaveze | Proveriti šifru (3 / 35 / 432) u profilu, novi nacrt | SEF 3.14 |
| `InvoicePeriodDescriptionCodeNotNeeded` | Šifra datuma poreske obaveze poslata na fakturi bez obaveze obračuna PDV-a | Ne pokušavati ponovo; poznato otvoreno pitanje Q9 — javiti održavaocu | SEF 3.14 |
| `RS-R-005` | SEF traži šifru datuma poreske obaveze (BT-8) | Za neobveznike PDV-a: poznato otvoreno pitanje Q9 (demo i produkcija se razlikuju). Ne menjati PDV pravilo; javiti održavaocu | SEF demo, 02.11.2026 |
| `VATCategoryNotAllowed` | Kategorija PDV-a nije podržana | Proveriti PDV pravilo sa knjigovođom | SEF 3.15.0 |
| `CompanyWithJBKJSNotFound` | JBKJS kupca ne postoji | Ispraviti JBKJS kod kupca | SEF 3.15.0 |
| `UBLTaxCategoryPercentNotAllowed` | Stopa > 0 za kategoriju koja nije S | Ispraviti PDV pravilo | SEF 3.16.0 |
| `UBLNoItemsWithTaxSubtotalTaxCategory` | Zbir PDV-a sadrži kategoriju bez stavke | Javiti održavaocu (ne bi trebalo da se desi) | SEF 3.16.0 |
| HTTP 401 | Ključ nije prihvaćen | Proveriti da li je ključ za pravo okruženje (demo ≠ produkcija) i da li je aktivan u SEF Administrator-u | — |
| HTTP 403 | Ključ nema prava | Proveriti prava ključa u SEF Administrator-u | — |

## Greške koje sef-mcp hvata pre slanja

Ove poruke dolaze od samog alata, pre nego što išta ode na SEF:

- „unit price must be > 0“ / „quantity must be > 0“ — SEF od verzije 4.0.0 prima samo pozitivne iznose.
- „unit of measure is required“ — svaka stavka mora imati jedinicu mere (SEF 4.0.0).
- „does not match profile pattern“ — broj fakture ne odgovara šablonu iz profila.
- „already sent successfully“ (upozorenje) — isti broj fakture je već poslat u ovom okruženju.
- „SEF_MCP_ALLOW_PROD_WRITE“ — produkcija je izabrana, ali drugi prekidač nije uključen (namerno).
