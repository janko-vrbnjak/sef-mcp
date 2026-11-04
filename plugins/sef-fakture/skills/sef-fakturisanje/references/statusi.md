# Statusi izlaznih faktura na SEF-u

| Status (API) | Na srpskom | Šta je moguće |
|---|---|---|
| `Draft` | Nacrt | Otkazivanje (`sef_cancel_invoice`) |
| `New` | Nova | Otkazivanje |
| `Mistake` | Greška pri slanju | Otkazivanje |
| `Sent` | Poslata | Storno (`sef_storno_invoice`) |
| `Approved` | Prihvaćena | Storno |
| `Rejected` | Odbijena | Storno |
| `Cancelled` | Otkazana | Ništa — konačno |
| `Storno` | Stornirana | Ništa — konačno |

Napomena: prihvaćena faktura se u dokumentaciji SEF-a navodi i kao `Accepted`; ako alat vrati taj naziv, tretirati ga isto kao `Approved`.

Izvor: SEF API specifikacija 31.07.2026 (otkazivanje samo za Nacrt / Nova / Greška pri slanju; storno samo za Poslata / Prihvaćena / Odbijena).

Pretraga po periodu (`sef_list_invoice_ids`): za New, Draft i Mistake period se računa po datumu kreiranja, za ostale po datumu slanja (SEF 3.15.0).

## Javni sektor (CRF)

Kod kupaca iz javnog sektora faktura se šalje i u Centralni registar faktura (CRF). Od SEF 4.2.0:
- kada kupac **odbije** fakturu na SEF-u, obaveza u CRF-u automatski prelazi u „Odbijena“ — ali samo ako je bila „Aktivna“; ako je „Započeta“ ili „Izmirena“, ostaje nepromenjena;
- ako kupac kasnije **prihvati** prethodno odbijenu fakturu, SEF traži od CRF-a ponovnu aktivaciju obaveze (CRF to obrađuje po svojim pravilima).
