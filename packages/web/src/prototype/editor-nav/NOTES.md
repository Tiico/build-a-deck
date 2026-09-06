# PROTOTYP — från editorn till bordet (K9, C7)

Fråga: hur tar sig designern från editorn till ett spelbord — TV-vyn, bordsläget, spela härifrån, titta på — utan att kopiera länkar?

Kör: `pnpm --filter @byd/web dev` → http://localhost:5175/prototype/editor-nav?variant=A

I dag finns "Nytt bord" och "Uppdatera bordet" i editorns huvud, och länken till bordet står som en textrad under. Ingen väg in i vyerna.

- **A — En "Bord"-flik bredvid Kortvägg, Mall, Tabell.** Fliken listar spelets bord med miniatyr, rev, vem som spelar, senaste drag, och knappar: Öppna TV-vyn, Bordsläge, Spela härifrån, Titta på, QR för telefoner, Avsluta. Fliken visar en prick när något spelas.
- **B — Delad knapp.** "Uppdatera bordet ▾" får en pil med en meny: TV-vyn, bordsläget, spela härifrån, titta på, QR, nytt bord, äldre bord. Tar ingen plats; allt om bordet på ett ställe.
- **C — Statusrad längst ner.** En rad med bordets miniatyr, "spelas nu på rev 12 · Ada, Bo, Cy", och länkarna. Alltid synlig oavsett flik.

## Fynd under bygget

- Flera bord per spel är verkligheten så fort man testat två gånger; B och C hanterar bara "det senaste" bra.
- Miniatyren av bordet (A, C) säger direkt om spelet lever. Den kan komma från samma snapshot som TV:n läser.
- C stjäl höjd från duken på mallfliken, där varje pixel behövs.

## Rekommendation

A som hem för borden, och B:s meny på "Uppdatera bordet" som snabbväg när man står på en annan flik.

## Svar

_(fylls i när Nicklas valt)_
