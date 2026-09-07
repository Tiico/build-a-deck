# build-your-deck

Skapa ditt eget kortspel, speltesta det digitalt utan regelmotor, och beställ hem det fysiskt.
Besluten bakom allt finns i [DESIGN-BESLUT.md](DESIGN-BESLUT.md), driften i [DRIFT.md](DRIFT.md), första skivan i [TUNN-SKIVA.md](TUNN-SKIVA.md), och vägen till release i [ROADMAP.md](ROADMAP.md).
Arbetssättet för agenter står i [CLAUDE.md](CLAUDE.md).

## Paket

| Paket | Vad |
|---|---|
| `packages/protocol` | zod-scheman för intents, logg, snapshot, patch och tråd — enda källan till typer och validering |
| `packages/engine` | ren, deterministisk motor: `decide` → `apply` → `project`, synlighet, återspelning |
| `packages/template` | kortmallar: elementmodell, inline-syntax, kompilering till HTML/CSS, textanpassning |
| `packages/render` | Chromium-renderare (PNG/PDF) och jobbkö |
| `packages/server` | aktör per bord, händelselogg i Postgres, WebSockets, projekt, texturer |
| `packages/web` | bordet, telefonen, lobbyn, editorn och wizarden |

## Kör lokalt

Kräver Node 26 och pnpm 11.
Chromium hämtas av Playwright vid första `pnpm install` i `packages/render` (`npx playwright install chromium` om den saknas).

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test
```

### Utan databas (snabbast)

Servern kör loggen i minnet; texturer renderas inte.

```bash
pnpm dev:server   # http://localhost:8080
pnpm dev:web      # http://localhost:5173
```

Skapa ett spel på http://localhost:5173/new?server=http%3A%2F%2Flocalhost%3A8080 och tryck "Öppna bordet".
Sätt `AUTH_BYPASS=true` på servern vid manuell testning för att logga in direkt efter att
e-postadressen skickats, utan att följa den magiska länken. Flaggan ska aldrig sättas i produktion.

### Med Postgres och texturer

```bash
docker run -d --name byd-pg -e POSTGRES_PASSWORD=byd -e POSTGRES_USER=byd -e POSTGRES_DB=byd -p 127.0.0.1:5432:5432 postgres:17-alpine
export DATABASE_URL=postgres://byd:byd@127.0.0.1:5432/byd
pnpm dev:server                    # loggen och jobbkön i Postgres
pnpm dev:render                    # Chromium-workern tömmer kön
pnpm dev:web
```

Eller hela stacken som containrar: `docker compose up --build`, som serverar webben och API:et från http://localhost:8080 (samma origin, inga `server=`-parametrar).

### Demodata

```bash
pnpm --filter @byd/server seed http://localhost:8080 demo           # ett bord mitt i ett spel, fyra platser
pnpm --filter @byd/server seed:project http://localhost:8080 demo   # ett projekt att öppna i editorn
```

Skripten skriver ut länkarna till bordet (`/table?…`) respektive editorn (`/editor?…`).
Telefonen ansluter via QR-koden i TV-läget, eller direkt: `/join?session=…`.

## Sidor

| Väg | Roll |
|---|---|
| `/` | "Mina spel" för den inloggade skaparen; inloggningskortet annars |
| `/login?next=…` | magisk länk via e-post; inget lösenord |
| `/new` | wizarden: namn, spelare, fält, ram, kort → projekt (kräver inloggning) |
| `/editor?project=…` | kortväggen, mallen, tabellen; "Uppdatera bordet" startar ett bord |
| `/table?session=…&mode=table\|tv` | storskärmen — bordsläge eller TV-läge med rumskod och QR |
| `/join?session=…` | platsväljaren telefonen landar i |
| `/play?session=…&seat=…&name=…` | telefonens hand |
| `/online?session=…&seat=…&name=…` | distansläget: bordet vridet till din kant och din hand som en solfjäder, i ett fönster |
| `/observe?session=…&name=…` | observatören: ser allt, alla ser henne, kan bara flagga |

I utveckling pekar `server=` på API:et (http för editor och wizard, ws för bord och telefon); i produktion är allt samma origin.
Utan `RESEND_API_KEY` skriver servern inloggningslänken i sin logg i stället för att mejla den; sätt `WEB_ORIGIN=http://localhost:5173` så landar länken i webbappen.

## Drift på lådan

Stacken i [docker-compose.yml](docker-compose.yml) är den från [DRIFT.md](DRIFT.md): `postgres`, `app` (aktörer, WebSockets, API och den byggda webben från samma origin), `render` (Chromium-worker) och, med profiler, `cloudflared` (tunnel) och `backup` (nattlig `pg_dump` till R2).
Inga portar mot gatan: `app` och `postgres` lyssnar bara på lådans 127.0.0.1, tunneln når `app` på compose-nätet.
Med R2-variabler i `.env` skriver `render` texturerna till R2 och `app` svarar på `/faces/:hash` med en signerad länk som webbläsaren följer och behåller (DRIFT §4); utan dem stannar bytesen i Postgres.
Lokalt går samma väg att köra mot en MinIO: sätt `R2_ENDPOINT=http://127.0.0.1:9000` och nycklarna, som i `.claude/launch.json`.

Första gången på en Ubuntu-låda med Docker:

```bash
sudo git clone <repo> /opt/build-your-deck && cd /opt/build-your-deck
cp .env.example .env && $EDITOR .env          # lösenord, tunnel-token, R2
sudo cp ops/byd-deploy.service ops/byd-deploy.timer /etc/systemd/system/
sudo systemctl enable --now byd-deploy.timer  # pollar efter nya releasetaggar var femte minut
ops/deploy.sh --force                          # första bygget och starten
```

Deployen är pull-baserad (DRIFT §7): `ops/deploy.sh` hämtar taggar, rullar till den nyaste `v*`-taggen som nås från `origin/main`, kör `compose up` och väntar på `/health`, som också kontrollerar att Postgres svarar.
`main` är trunk och deployas aldrig i sig; att sätta en `v*`-tagg är att deploya, och en ny commit på trunken rör inte lådan.
Appen dränerar på SIGTERM och migrerar schemat vid start, så bytet är kort.
Tunnelns publika värdnamn pekas på `http://app:8080` i Cloudflares panel.
`ops/restore-test.sh` hämtar senaste dumpen från R2 till en tillfällig Postgres och räknar sessioner och rader: en backup som aldrig lästs tillbaka är en förhoppning.

## CI och replay-korpusen

[.github/workflows/ci.yml](.github/workflows/ci.yml) kör lint, typecheck och alla tester mot en riktig Postgres och en riktig Chromium på varje pull request.
En pushad `v*`-tagg bygger `app`- och `render`-bilderna till GHCR, taggade med git-SHA:t och med releasenamnet; `workflow_dispatch` bygger en image för en otaggad commit.
`main` kör ingen workflow alls, så trunken vaktas i stället av `.githooks/pre-push`: en push till `main` måste komma från ett rent träd och passera samma lint, typecheck och tester som en pull request.
Hooken kopplas in av `prepare` vid `pnpm install`; går det snett sätter du den själv med `git config core.hooksPath .githooks`.
Grinden är replay-korpusen i [corpus/](corpus/): anonymiserade loggar som måste spela upp identiskt och projiceras identiskt för varje vy.
Korpusen är seedad med skriptade sessioner; riktiga loggar läggs till från en körande server:

```bash
pnpm --filter @byd/engine corpus <namn> http://localhost:8080/sessions/<id>/export
```

Namn, kommentarer och observatörer anonymiseras; själva spelet och kortens id:n behålls (DRIFT:s öppna fråga).
Med `BYD_REGISTRY=ghcr.io/<ägare>/<repo>` i lådans `.env` drar `ops/deploy.sh` CI:s bilder för releasens SHA i stället för att bygga, och väntar till nästa tick om CI inte är klar.

## Tester

Varje paket testar mot riktiga saker: motorn med deterministisk återspelning, servern med råa WebSocket-frames, webben mot en server i samma process, renderaren mot en riktig Chromium.
Postgres-testerna körs bara när `DATABASE_URL` är satt.
