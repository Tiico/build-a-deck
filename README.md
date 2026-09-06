# build-your-deck

Skapa ditt eget kortspel, speltesta det digitalt utan regelmotor, och beställ hem det fysiskt.
Besluten bakom allt finns i [DESIGN-BESLUT.md](DESIGN-BESLUT.md), driften i [DRIFT.md](DRIFT.md), första skivan i [TUNN-SKIVA.md](TUNN-SKIVA.md).
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

### Med Postgres och texturer

```bash
docker run -d --name byd-pg -e POSTGRES_PASSWORD=byd -e POSTGRES_USER=byd -e POSTGRES_DB=byd -p 127.0.0.1:5432:5432 postgres:17-alpine
export DATABASE_URL=postgres://byd:byd@127.0.0.1:5432/byd
pnpm dev:server                    # loggen och jobbkön i Postgres
pnpm dev:render                    # Chromium-workern tömmer kön
pnpm dev:web
```

Eller hela stacken som containrar: `docker compose up --build`.

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
| `/new` | wizarden: namn, spelare, fält, ram, kort → projekt |
| `/editor?project=…` | kortväggen, mallen, tabellen; "Uppdatera bordet" startar ett bord |
| `/table?session=…&mode=table\|tv` | storskärmen — bordsläge eller TV-läge med rumskod och QR |
| `/join?session=…` | platsväljaren telefonen landar i |
| `/play?session=…&seat=…&name=…` | telefonens hand |

I utveckling pekar `server=` på API:et (http för editor och wizard, ws för bord och telefon); i produktion är allt samma origin.

## Tester

Varje paket testar mot riktiga saker: motorn med deterministisk återspelning, servern med råa WebSocket-frames, webben mot en server i samma process, renderaren mot en riktig Chromium.
Postgres-testerna körs bara när `DATABASE_URL` är satt.
