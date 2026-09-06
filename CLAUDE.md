# build-your-deck — instruktioner för agenter

## Arbetssätt

All utveckling i det här repot sker med `/tdd`-skillen: red → green → refactor.
Skriv det fallerande testet först, gör det grönt med minsta rimliga ändring, städa sedan.
Det gäller ny funktionalitet, buggfixar och refaktoreringar — inga undantag för "små" ändringar.

Innan något anses klart: `pnpm typecheck`, `pnpm test` och `pnpm lint` ska vara gröna.

Allt visuellt — vyer, layouter, interaktionsmönster, bordets och telefonens utseende — prototypas först med `/prototype`-skillen.
Presentera prototyperna och få dem godkända innan den riktiga implementationen påbörjas.
Det gäller varje ny visuell yta och varje väsentlig omformning av en befintlig.
Ramverksfri logik (klienter, motorer, kompilatorer) behöver ingen prototyp.

## Var besluten finns

Läs dessa innan du ändrar något som de täcker; de är sanningen, inte koden.

- [DESIGN-BESLUT.md](DESIGN-BESLUT.md) — produkt- och arkitekturbeslut med motivering och följdkrav.
- [TUNN-SKIVA.md](TUNN-SKIVA.md) — första vertikala skivan och de tre kontraktsytorna.
- [DRIFT.md](DRIFT.md) — hur tjänsten driftas: en hemmaserver bakom Cloudflare.
- [ROADMAP.md](ROADMAP.md) — besluten ordnade i faser fram till release, med status; uppdateras när en punkt blir klar.

Ett beslut ändras genom att uppdatera dokumentet, inte genom att koden tyst avviker.

## Oförhandlingsbara regler i koden

- Intent-vokabuläret i `packages/protocol` är slutet och fysiskt. Ett nytt verb är en protokollmigrering och ett dokumenterat beslut.
- Ordningen i aktören är `decide` → commit i loggen → `apply` → patchar. Aldrig något annat.
- All slump lagras som resultat i loggen, aldrig som frö. Loggen ska alltid gå att spela upp identiskt.
- `project` i `packages/engine` är enda vägen från tillstånd till tråd. Inget annat får serialisera komponenter.
- En enda renderare för kortmallar (HTML/CSS via Chromium). Ingen andra kodväg får rendera ett kort.
- Dold information verifieras på nätverkstrafiken, inte på skärmen. Ett test som läser råa frames är beviset.

## Struktur

- `packages/protocol` — zod-scheman; enda källan till både typer och validering.
- `packages/engine` — ren, deterministisk motor utan I/O.
- `packages/server` — aktör per bord, loggwriter, WebSockets.
