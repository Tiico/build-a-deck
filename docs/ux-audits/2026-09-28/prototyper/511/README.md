# Prototyp #511 · observatören läser ett kort i vilken hand som helst

Frågan: hur läser observatören ett handkort i K26:s skrivbordsgolv (12 px, brödtext 14–16 px) med en handling, när filten med alla händer ger 34 px kort vid 1280 × 800 och 56 px vid 1920 × 1080?

Prototypen är in-app på grenen `proto/511-observator` (`packages/web/src/prototype/511-observer/`), mätt med `run-lasbarhet.ts` (Sal's Saloon, fyra platser, sex kort per hand, riktiga texturer; 8,5 pt brödtext = 0,048 × kortbredden). Observatören gick in via rumskoden som en riktig observatör.

## Ett fynd innan varianterna

**Korten i händerna på filten svarar inte på pekaren alls.** `Hand` i `TableRenderer` ritar fläktens kort utan hover- eller tryckhandtag, så observatörens INSPEKTION kan visa kort på filten men aldrig ett handkort — det som rollen (C8) är till för. Rapportens 138 px gällde alltså bara kort utanför händerna. Prototypen ger handkorten samma `inspects` som filtens kort; det behövs i A och C oavsett val.

## Varianterna

- **A: lyftet (#509).** Hover eller tryck på ett kort — också i en hand — lyfter det bredvid sig i 0,62 av fönstrets höjd, som i bordsläget. Spalten som i dag.
- **B: händerna som rader.** Filtens ruta visar en rad per plats med korten i 294 px (14 px brödtext); filten flyttar upp i spalten som karta.
- **C: INSPEKTION i golvets storlek.** Spalten som i dag men med INSPEKTION 294 × 411 px; hovern fyller den.

## Mätt

| | Fönster | Läst kort (brödtext) | Handlingar | Filtens handkort | Priset |
| --- | --- | --- | --- | --- | --- |
| I dag | 1280 × 800 | 138 px (6,6) — och handkort går inte alls | — | 34 px | — |
| **A** | 1280 × 800 | **355 px (17,0)** | 1 (hover/tryck) | 34 px | täcker en del av filten medan det läses |
| **B** | 1280 × 800 | 294 px (14,1) | 0, men **4 av 24 kort syns** utan att rulla | kartan, oläslig | filten blir en frimärkskarta; rulla i två led |
| **C** | 1280 × 800 | 294 px (14,1) | 1 (hover) | 34 px | **flödet försvinner**, platserna kapas |
| I dag | 1920 × 1080 | 139 px (6,7) | — | 56 px | — |
| **A** | 1920 × 1080 | **479 px (23,0)** | 1 | 56 px | som ovan |
| **B** | 1920 × 1080 | 294 px (14,1) | 0, 12 av 24 synliga | kartan | som ovan |
| **C** | 1920 × 1080 | 294 px (14,1) | 1 | 56 px | platserna trängs |

Rådata i `matt.json`. Ingen variant ändrar vad observatören får över tråden: alla ritar ur samma ögonblicksbild (C8), så de råa frame-testerna berörs inte.

## Iakttagelser

- **A** läser störst och är samma gest som bordsläget och distansvyn (#509, K26), så observatören lär sig ingenting nytt. Det kräver att handkorten får handtag och att lyftet går på en yta utan `onAct` (i dag sitter lyftet ihop med att få röra korten).
- **B** är den enda utan en handling, men visar en sjättedel till hälften av händerna åt gången och gör filten oläslig; det är en annan roll-yta snarare än en läsning.
- **C** når golvet men betalar i spalten vid 1280 × 800: flödet, som är halva skälet att titta på, går.
- Telefonen (fynd 3) behåller #485:s tryck i alla tre.

Bilder: `<variant>-<bredd>x<höjd>-vila.png` och `-last.png` (efter hover på ett handkort).
