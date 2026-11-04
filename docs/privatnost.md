# Privatnost i podaci

sef-mcp je program koji radi na vašem računaru. Autori projekta ne primaju, ne čuvaju i ne vide vaše podatke.

| Podatak | Gde se nalazi | Ko ga dobija |
|---|---|---|
| SEF API ključ | Sigurno skladište operativnog sistema (ekstenzija) ili vaš menadžer lozinki | Samo SEF, u zaglavlju svakog poziva |
| Podaci o firmi i kupcima (profil) | Folder za podatke na vašem računaru | Niko; delovi idu na SEF kao sadržaj fakture |
| Nacrti faktura i dnevnik slanja | Folder za podatke na vašem računaru | Niko |
| PDF prilozi | Folder za priloge na vašem računaru | SEF, kao prilog fakture |
| Sadržaj razgovora | AI aplikacija koju koristite (npr. Claude) | Prema pravilima te aplikacije |

Program se povezuje isključivo sa `efaktura.mfin.gov.rs` i `demoefaktura.mfin.gov.rs`. Nema analitike, praćenja ni slanja podataka trećim stranama.

Napomena: podatke koje kucate u razgovor (npr. iznose, nazive kupaca) obrađuje AI aplikacija u kojoj radite. API ključ zato nikad ne unosite u razgovor.
