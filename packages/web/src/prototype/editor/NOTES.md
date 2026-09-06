# PROTOTYP — editorn

Fråga: hur ser skaparens editor ut — mall, tabell och förhandsvisning?

Kör: `pnpm proto` → http://localhost:5173/prototype/editor?variant=A

- **A — Trepanel.** Lager · stor mall med valbara element · egenskaper · tabellremsa nederst.
- **B — Kalkylbladet först.** Tabellen är ytan; förhandsvisning av vald rad till höger; mallen är ett läge.
- **C — Kortväggen.** Hela leken i rutnät; klicka kort → rad; klicka element → mall, alla följer.

Alla tre renderar genom `compile` + `fitInDocument` — samma kod som renderaren.

## Fynd under bygget

- Kompilatorns CSS är oskopad (`[data-card]`, `[data-element="x"]`); flera kort på samma sida krockar. → Kompilatorn behöver ett `scope`-alternativ (en väljare-prefix per kort).
- `{2}` i seedtexten är en okänd ikon → varning på 30 kort. Bra demo av L2, men siffror i klamrar är ett vanligt skrivsätt — kanske ska rena tal renderas som text i en cirkel snarare än kräva ikon.

## Svar (2026-09-06)

**C som hem, A:s duk för mallen, B:s tabell som flik.**
Kortväggen är startvyn: hela leken, varningar och antal på ett bord.
Klick på ett element öppnar den stora duken med lager och egenskaper för mallarbetet.
Tabellen är en flik för massredigering och import.
Tre lägen, en lek, samma förhandsvisning genom kompilatorn.
