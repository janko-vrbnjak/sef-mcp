# sef-fakture — plugin za Claude (Cowork / Claude Code)

Dva skilla koja Claude-u govore **kada i kako** da koristi alate iz ekstenzije **SEF e-fakture** (sef-mcp):

| Skill | Kada se koristi |
|---|---|
| `sef-podesavanje` | Prvo podešavanje: API ključ, podaci o firmi, kupci, proba na demo SEF-u, prelazak na produkciju |
| `sef-fakturisanje` | Svakodnevno: mesečna faktura, status, otkazivanje i storno, objašnjenje SEF grešaka |

## Preduslov

Plugin ne sadrži sam server. Prvo instalirajte ekstenziju **SEF e-fakture** — preuzmite [sef-mcp.mcpb](https://github.com/jvrbnjak89/sef-mcp/releases/latest/download/sef-mcp.mcpb) i dva puta kliknite na fajl. Uputstvo: [docs/za-korisnike.md](../../docs/za-korisnike.md).

## Pravila koja skillovi uvek poštuju

- Nijedna faktura ne ide na SEF bez izričitog odobrenja tog nacrta.
- Uvek je jasno da li se radi na demo okruženju ili u produkciji.
- API ključ se nikad ne unosi u razgovor — samo u podešavanja ekstenzije (sigurno skladište sistema).
- Novac, datumi, PIB i PDV pravilo se ne pogađaju — pita se korisnik.
