# Podešavanje

Cilj: za ~20 minuta imati sef-mcp povezan sa Claude-om, sa API ključem iz secret managera, i poslatu prvu fakturu na **demo** SEF.

## 0. Preduslovi

- Node.js ≥ 20.11 (`node -v`)
- Nalog na SEF-u i API ključ (posebno za demo i za produkciju). Od SEF 4.0.0 API ključ se podešava u modulu **SEF Administrator**.
- Secret manager. Primeri ispod koriste **1Password CLI** (`op`); bilo koji alat koji ubacuje promenljive okruženja radi isto.

## 1. Instalacija

```bash
git clone <repo> ~/Projects/sef-mcp
cd ~/Projects/sef-mcp
npm install
npm test          # mora biti zeleno
```

## 2. Profil firme

Profil možeš napraviti na dva načina: kroz razgovor (alati `sef_setup_company` i `sef_add_customer`; bez profila server radi u režimu podešavanja) ili ručno, iz primera. Ako `SEF_MCP_PROFILE` nije zadat, koristi se `<SEF_MCP_DATA_DIR>/profile.json`.

```bash
node dist/src/index.js init ~/.config/sef-mcp/profile.json
```

Popuni `seller` (naziv, PIB, MB, adresa, račun, PDV status) i `customers`. Pravila:

- `seller.vatRegistered: false` → `defaultTax` **ne sme** biti `S`. Za obveznike van sistema PDV-a najčešće je `SS` + `PDV-RS-33` — **potvrdi sa knjigovođom**.
- Šifre izuzeća možeš da izlistaš alatom `sef_list_vat_exemption_reasons` (radi i na demo okruženju).
- `invoiceDefaults.notes` — napomene na svakoj fakturi (npr. „Izdavalac računa nije obveznik PDV-a u skladu sa članom 33. Zakona o PDV-u.”). Kupac može imati svoje (`defaults.notes`).
- Jedinica mere: `MON` (mesec), `HUR` (sat), `H87` (komad)… Pun spisak: `sef_list_unit_measures`. Podrazumevanu možeš postaviti po kupcu (`defaults.unitCode`).
- `customers[].vatRegistered` (podrazumevano `true`) — postavi `false` za kupca van sistema PDV-a.
- Prilozi: SEF prima najviše 2 PDF-a po 1 MB; ograničenja menjaš sa `SEF_MCP_MAX_ATTACHMENTS` i `SEF_MCP_MAX_ATTACHMENT_BYTES`.
- `numberPattern` je opcioni regex za broj fakture; sprečava slučajno pogrešnu numeraciju.
- Profil sadrži samo javne poslovne podatke. **Nikad** ne stavljaj ključ u profil.

Gde čuvati profil: van ovog repoa (npr. `~/.config/sef-mcp/` ili tvoj privatni repo sa poslovnom dokumentacijom).

## 3. API ključ preko 1Password-a

1. Sačuvaj demo i produkcijski ključ kao dve stavke u 1Password-u.
2. Napravi dva env fajla **pored profila**, ne u ovom repou:

`~/.config/sef-mcp/.env.demo`
```dotenv
SEF_ENV=demo
SEF_API_KEY="op://<Vault>/<SEF demo item>/credential"
SEF_MCP_PROFILE=/Users/<ti>/.config/sef-mcp/profile.json
SEF_MCP_DATA_DIR=/Users/<ti>/.config/sef-mcp/data-demo
SEF_MCP_ATTACHMENTS_DIR=/Users/<ti>/Documents/fakture-prilozi
```

`~/.config/sef-mcp/.env.prod`
```dotenv
SEF_ENV=prod
SEF_API_KEY="op://<Vault>/<SEF prod item>/credential"
SEF_MCP_PROFILE=/Users/<ti>/.config/sef-mcp/profile.json
SEF_MCP_DATA_DIR=/Users/<ti>/.config/sef-mcp/data-prod
SEF_MCP_ATTACHMENTS_DIR=/Users/<ti>/Documents/fakture-prilozi
# Uključi tek kada je demo ciklus prošao:
# SEF_MCP_ALLOW_PROD_WRITE=true
```

`op://` reference nisu tajne i smeju u privatni git repo. Ipak ih ne stavljaj u javni repo ovog projekta: otkrivaju strukturu tvog trezora i vezuju projekat za tvoju firmu.

3. U 1Password desktop aplikaciji uključi **Settings → Developer → Integrate with 1Password CLI**, da `op run` traži otključavanje biometrijom umesto tokena u fajlu.
4. Provera:

```bash
op run --env-file ~/.config/sef-mcp/.env.demo -- node dist/src/index.js doctor --ping
```

Ako server prijavi „unresolved secret reference”, pokrenut je bez `op run`.

## 4. Povezivanje sa klijentom

Koristi **apsolutne putanje** — desktop aplikacije ne vide tvoj shell `PATH`. (`which op`, `which node`.)

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sef-demo": {
      "command": "/opt/homebrew/bin/op",
      "args": [
        "run", "--env-file", "/Users/<ti>/.config/sef-mcp/.env.demo", "--",
        "/usr/local/bin/node", "/Users/<ti>/Projects/sef-mcp/dist/src/index.js", "serve"
      ]
    }
  }
}
```

Restartuj Claude Desktop. Za produkciju dodaj zaseban unos `sef-prod` sa `.env.prod` — tako uvek jasno vidiš sa kojim okruženjem radiš.

`op run` podrazumevano maskira tajne u izlazu procesa. Server nikad ne ispisuje ključ, pa maskiranje ne bi trebalo da smeta MCP protokolu. Ako ipak vidiš greške u povezivanju, probaj `--no-masking` i prijavi issue.

### Claude Code

```bash
claude mcp add sef-demo -- /opt/homebrew/bin/op run --env-file /Users/<ti>/.config/sef-mcp/.env.demo -- \
  node /Users/<ti>/Projects/sef-mcp/dist/src/index.js serve
```

### Cursor

`.cursor/mcp.json` (u projektu) ili globalno podešavanje — isti `command`/`args` kao za Claude Desktop.

## 5. Prvi test (demo)

U razgovoru sa Claude-om:

1. „Pokreni `sef_check_setup`.” → `environment: demo`, `apiKeyConfigured: true`.
2. „Napravi nacrt fakture za kupca X, 1 sat konsultacija po 1000 RSD.”
3. Pregledaj iznose, kupca i `approvalCode`. Ako je sve tačno: „Odobravam, pošalji.”
4. Proveri fakturu u demo SEF interfejsu.

Klijent (Claude Desktop) će pre `sef_send_invoice` tražiti tvoju dozvolu — **ne uključuj „uvek dozvoli”** za alate koji šalju ili otkazuju.

## 6. Prelazak na produkciju

Tek kada:

- [ ] je bar jedan pun mesečni ciklus prošao na demo okruženju,
- [ ] je generisani XML uporeden sa fakturom koju je SEF ranije prihvatio,
- [ ] je knjigovođa potvrdio izgled fakture.

Tada u `.env.prod` uključi `SEF_MCP_ALLOW_PROD_WRITE=true`.
