# D2R Stash Tracker — Claude Code Context

## Vad är detta?
En självhostad Diablo 2: Resurrected item-tracker. Fungerar som en databas-vy över alla items i spelet där man kan markera vilka man äger, vilken karaktär/bank-slot de sitter på och sina faktiska item-rolls.

## Stack
- **Backend**: Node.js + Express (`server.js`)
- **Frontend**: Vanilla JS (`public/app.js`) + CSS (`public/app.css`) + HTML (`public/index.html`)
- **Data**: JSON-filer på disk (`/data/items.json`, `/data/characters.json`)
- **Item-databas**: `public/d2db.json` — 434 items (unika, set, runewords, socketed bases) med stats, ranges och maxroll-bild-URLs
- **Deploy**: Docker container via Portainer Stacks, reverse-proxad av SWAG på `d2r.jarrot.org`
- **CI/CD**: GitHub Actions bygger och pushar till `ghcr.io/jarrot/d2tracker:latest`

## Filstruktur
```
d2tracker/
├── server.js              # Express backend, API-endpoints, bildcache
├── package.json
├── Dockerfile
├── public/
│   ├── index.html         # HTML-struktur (slim, ~10KB)
│   ├── app.js             # All JS-logik (~40KB)
│   ├── app.css            # All CSS (~29KB)
│   └── d2db.json          # Item-databas med stats + imgUrl
```

## Git-repos
- **App-kod**: `git@github.com:Jarrot/d2tracker.git` — pushas hit, Actions bygger Docker-image
- **Portainer-stack**: `/srv/data/git/portainer/stacks/d2tracker/` i `git@github.com:Jarrot/yorick.git`
- **SWAG-conf**: `/srv/data/config/swag/nginx/proxy-confs/d2r.subdomain.conf`

## Deploy-flöde
```bash
# Ändra filer lokalt
git p "beskrivning"    # git alias: add -A && commit -m && push

# GitHub Actions bygger automatiskt → ghcr.io/jarrot/d2tracker:latest
# Portainer → Stacks → d2tracker → Pull and redeploy
```

## API-endpoints (server.js)
| Method | Path | Beskrivning |
|--------|------|-------------|
| GET | `/api/items` | Alla sparade items |
| POST | `/api/items` | Lägg till item |
| PUT | `/api/items/:id` | Uppdatera item |
| DELETE | `/api/items/:id` | Ta bort item |
| GET | `/api/characters` | Karaktärslista (sorterad på order) |
| PUT | `/api/characters` | Spara karaktärslista |
| GET | `/api/itemimg/:slug` | Bildcache — fetchar från externa CDN:er och cachar i `/data/imgcache/` |

## Data-strukturer

### Item (items.json)
```json
{
  "id": "1234567890",
  "name": "Harlequin Crest",
  "cat": "Unique",          // Unique | Set | Runeword | Socketed
  "setname": "",            // Set-namn om cat=Set
  "char": "Jarrock",        // Karaktärsnamn
  "status": "stored",       // stored | equipped | seeking | complete
  "stats": [
    { "name": "Damage Reduced by %d%%", "value": "15" },
    { "name": "Sockets", "value": "2" }
  ],
  "notes": "",
  "createdAt": "2026-03-24T..."
}
```

### Character (characters.json)
```json
{
  "id": 1,
  "name": "Jarrock",
  "cls": "Warlock",         // Amazon|Barbarian|Druid|Necromancer|Paladin|Sorceress|Assassin|Warlock|Bank
  "type": "active",         // active | bank
  "order": 1                // Sorteringsordning i dropdowns
}
```

### d2db.json item
```json
{
  "name": "Harlequin Crest",
  "cat": "Unique",
  "setname": "",
  "rlvl": 62,
  "imgUrl": "https://assets-ng.maxroll.gg/d2planner/images/uniques/unique248.webp",
  "stats": [
    { "name": "+2 to All Skills", "fixed": true },
    { "name": "Damage Reduced by %d%%", "min": 10, "max": 15, "variable": true }
  ],
  "sockets": { "min": 1, "max": 2 }
}
```

## Frontend-arkitektur (app.js)

### State
```js
let items = [];     // Ägda items från /api/items
let chars = [];     // Karaktärer från /api/characters
let d2db = [];      // Item-databas från /d2db.json
let activeCat = ''; // Aktiv kategori-filter
let activeStatus = ''; // Aktiv status-filter
let viewMode = 'all'; // all | mine | missing
```

### Viktiga funktioner
- `loadAll()` — hämtar items, chars och d2db parallellt
- `renderItems()` — database-vy, loopar `d2db` och annoterar med ägda items
- `renderStatLines(dbRef, ownedStats)` — genererar stat-rader med roll-kvalitetsfärger
- `rollQuality(val, min, max)` — returnerar CSS-klass: `roll-low` / `roll-mid` / `roll-high`
- `showTooltipDB(e, name, cat)` — Diablo-style tooltip för DB-items
- `openAddFromDB(dbItem)` — öppnar modal förifylld från databasen
- `filterCat(cat, el)` — sidebar-filter för kategori
- `setViewMode(mode, btn)` — byter mellan all/mine/missing

### Vy-lägen
- **Alla** — alla DB-items, ägda har karaktär-badge, ej ägda gråade (opacity 0.38)
- **Mina** — bara items du äger
- **Saknas** — bara items du inte har

### Stat-visning
Stats hämtas alltid från `d2db.json` och visas med `(min–max)` ranges.
Om du har egna rolls visas de på samma rad i roll-kvalitetsfärg:
- 🔴 `roll-low` — <40% av range
- 🟡 `roll-mid` — 40-80% av range  
- 🟢 `roll-high` — >80% av range

### Bildkälla
Unika items och set-items har `imgUrl` från maxroll's CDN:
- Unika: `https://assets-ng.maxroll.gg/d2planner/images/uniques/unique{NNN}.webp`
- Set: `https://assets-ng.maxroll.gg/d2planner/images/set-items/set{NNN}.webp`

Runewords och socketed bases saknar ännu bilder (TODO).

## CSS-variabler (app.css)
```css
--bg0: #0d0d0f;      /* Mörkaste bakgrund */
--bg1: #13131a;      /* Header/sidebar */
--bg2: #1a1a24;      /* Cards/modals */
--bg3: #20202e;      /* Input-bakgrund */
--accent: #3d8ef0;   /* Blå accent */
--gold: #c8952a;     /* Guld (unique-färg) */
--gold2: #e8b84b;
--set: #4db862;      /* Grön (set-färg) */
--sock: #5b8fd4;     /* Blå (socketed) */
--rune: #9b6fd4;     /* Lila (runeword) */
--stat-blue: #7eb0f0; /* Stat-text */
```

## TODO / Kända brister
- [ ] Runeword-bilder saknas (behöver mappning från maxroll)
- [ ] Socketed base-bilder saknas
- [ ] Base items-bilder saknas (`/d2/database/items` på maxroll)
- [ ] Rune-ikoner för runeword-recept i tooltip
- [ ] Söket i header borde söka i DB-läge (söker bara ägda items idag)
- [ ] Sidebar-räknare räknar ägda items, inte DB-items
- [ ] Set-progress sidan uppdaterad för nya database-vyn
- [ ] Pagination om DB-listan blir för lång att rendera

## Miljövariabler (docker-compose / .env)
```
PUID=1001
PGID=100
TZ=Europe/Stockholm
NODE_ENV=production
```

Data sparas i Docker-volymen `d2tracker_data` → monterad på `/data` i containern.
