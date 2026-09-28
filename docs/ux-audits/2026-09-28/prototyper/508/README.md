# Prototyp #508 · TV:n läser ett kort från tre meter

Frågan: hur läser rummet ett kort på TV:n i K26:s golv (24 px, brödtext 28–32 px vid 1920 × 1080), och hur väljer rummet vilket kort det är utan en pekare på TV:n?

Prototypen är in-app på grenen `proto/508-tv` (`packages/web/src/prototype/508-tv/`) och mäts med riggen `run-lasbarhet.ts` (Sal's Saloon, riktiga texturer, 8,5 pt brödtext = 0,048 × kortbredden).
Den röda panelen nere till vänster är prototypens egen och simulerar telefonens knapp; den finns inte i bygget.

## Varianterna

- **A: bred spalt.** Spalten går från 360 till 544 px så att INSPEKTION kan bli 504 × 704 px, alltid. Platserna står två och två och flödet får det som blir över.
- **B: visa för alla.** Spalten är som i dag. Ett publikt kort kallas fram över filten från en telefon («Visa för alla») eller tangentbordet (← → väljer i INSPEKTION, Enter visar). Kortet står i högst 672 × 938 px med vem som visar och en nedräkning, och går av sig självt efter 15 s eller med Escape.
- **C: B, och TV:n visar själv.** Som B, och därtill visas varje nyss spelat publikt kort en stund (8 s) över filten utan att någon ber om det.

## Mätt

| | Platser | Fönster | INSPEKTION (brödtext) | Över filten (brödtext) | Filtens kortsida | Platser hela / flödesrader |
| --- | --- | --- | --- | --- | --- | --- |
| I dag | 4 | 1920 × 1080 | 177 px (8,5) | — | 75 | 4/4 · 3 |
| A | 4 | 1920 × 1080 | 462 px (**22,2**) | — | **68** | **2/4 · 0** |
| B, C | 4 | 1920 × 1080 | 177 px (8,5) | 666 px (**32,0**) | 75 | 4/4 · 3 |
| I dag | 4 | 1280 × 800 | 175 px (8,4) | — | 44 | 4/4 · 3 |
| A | 4 | 1280 × 800 | 318 px (15,3) | — | **34** | **2/4 · 0** |
| B, C | 4 | 1280 × 800 | 175 px (8,4) | 465 px (22,3) | 44 | 4/4 · 3 |
| I dag | 8 | 1920 × 1080 | **97 px (4,7)** | — | 43 | 8/8 · 3 |
| A | 8 | 1920 × 1080 | 417 px (20,0) | — | 43 | **6/8 · 0** |
| B, C | 8 | 1920 × 1080 | 97 px (4,7) | 666 px (**32,0**) | 43 | 8/8 · 3 |
| I dag | 8 | 1280 × 800 | 102 px (4,9) | — | 29 | 8/8 · 3 |
| A | 8 | 1280 × 800 | 282 px (13,5) | — | **22** | **4/8 · 0** |
| B, C | 8 | 1280 × 800 | 102 px (4,9) | 465 px (22,3) | 29 | 8/8 · 3 |

Filtens kortsida är den minsta målade texturen på filten (`getBoundingClientRect`), vilket är 43 px där `felt-names.test.tsx` räknar kortbredden till 45 vid åtta platser; skillnaden är mätsättet och inte varianterna.
Rådata i `matt-4p.json` och `matt-8p.json`.

## Iakttagelser

- **A når inte golvet någonstans.** Spalten ger 462 px vid fyra platser och 417 vid åtta i 1080p, alltså 22 respektive 20 px brödtext, och det kostar flödet helt, halva platserna och sju px av filtens kort vid fyra platser (34 px vid 1280 × 800, under K9:s 45). Att nå 504 px skulle kräva att även platserna flyttar ut ur spalten.
- **B och C når 32 px vid 1080p utan att röra vilan.** Filten, spalten och flödet är exakt som i dag tills någon ber om ett kort. Vid 1280 × 800 ger fönstret 465 px (22 px), vilket är vad en sådan skärm rymmer.
- **Dagens TV har ett fynd till:** vid åtta platser ger spalten INSPEKTION bara 97 px (4,7 px brödtext), eftersom platserna tar höjden. B och C gör det ofarligt; A gör det bättre men inte bra.
- **Att välja kortet** kräver i B och C något nytt på tråden: dagens `point` (K6) bär bara x och y. En presence-sort som bär ett komponent-id, efemär som K6 och aldrig i loggen, räcker för telefonen; tangentbordet behöver ingenting nytt.
- **C:s automatik** visar varje vänt eller flyttat publikt kort, också bordets egna drag. I ett spel med många drag blir det en ridå över filten; det kan behöva begränsas till kort som *spelas* (från en hand till en publik yta).

Bilder: `<variant>-<platser>p-<bredd>x<höjd>-vila.png`, `-visad.png` (kallat från telefonen) och `-spelat.png` (C:s automatik).
