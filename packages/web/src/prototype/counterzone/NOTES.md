# Prototyp #89 — vad en plats räknare är, och var de får plats

Slängkod.
Rutten är `/prototype/raknarzonen`, varianterna växlas med `?proto=`, ytan med `?yta=bord|tv`, platsantalet med `?seats=`, antalet räknare per plats med `?counters=`, och delningen mellan två brickor med `?pitch=`.
Skärmbilderna och rådata ligger i `docs/issues/proto89-*`.

Körs så här, från en egen port:

```
pnpm --filter @byd/web exec vite --port 5466 --strictPort
node packages/web/src/prototype/counterzone/shots.mjs http://localhost:5466
```

## Frågan

Hur får två eller tre räknare på samma plats var sin träffyta på 44 × 44 px?

#67 gav en ensam bricka en osynlig, riktigt projicerad yta (`leaningSquare` i `table/fit.ts`, `.byd-token-hit` i `TableRenderer`).
Den landade, och den flyttade problemet i stället för att lösa det.
Receptet lägger brickorna 32 mm isär (`setup.ts`) i en zon som är 110 × 100 mm (`recipe.ts`), och vid 1280 i bordsläge är det en delning på 23 px i en zon på 80 × 73 px medan två ytor behöver 88 px mellan sig.

Varianterna är därför inte inställningar utan fyra hela ställningstaganden till vad en plats räknare **är**: tre brickor med var sin yta, tre brickor som fått rum av kuvertet, tre brickor som fått rum av grannzonen, eller en hög.

## Varianterna

| | delning | räknarzonen | platsens 500 mm | filten (K18) | vad det kostar |
| --- | --- | --- | --- | --- | --- |
| **N** Nuläget | 32 mm | 110 × 100 mm | orörd | orörd | ytorna ligger på varandra |
| **A** Zonen växer | 150 mm | **450 × 150 mm** vid tre räknare | **840 mm** | växer med platsen | filten, korten och grannzonen |
| **B** Glesare i en riktning | 125 mm | **375 × 100 mm** | 500 mm, orört | orörd | `Framför` krymper 380 → **115 mm** |
| **C** Staplade | 5 mm (högens tjocklek) | 110 × 100 mm | orörd | orörd | ett tryck till, och två värden syns inte |

N, A och B mäts på renderarens egen `.byd-token-hit` — prototypen ritar ingen egen yta, den sätter bara `data-proto-target` på den som redan finns, så det som mäts är produktens yta och inte prototypens.
C ritar en yta per plats, projicerad genom samma `leaningSquare`, och säger på ytan själv vilka brickor den står för (`data-proto-covers`).

A:s och B:s delning är inte gissad: den är löst mot det trängsta bord produkten stöder, åtta platser med tre räknare på 1280 × 800 i bordsläge, där filten ritas med 0,4264 px per millimeter och perspektivet förstorar en bricka vid närkanten med ungefär 4 %. Ett fingers 44 px är där 99 mm filt.

## Vad prototypen avslöjade

### 1. Grinden måste vara zonen, inte bara paren — dagens ENSAMMA bricka faller redan

Med **en** räknare per plats är antalet överlappande par noll vid varje skärm och läge, precis som issuet säger.
Men träffytan är ~100 mm bred i en zon som är 110 × 100 mm, och brickan ligger 8 mm in från zonens hörn — så ytan sticker ut ur sin egen zon och in i grannzonen redan där:

| N, en räknare, bordsläge 1280 × 800 | 2 platser | 4 platser | 8 platser |
| --- | --- | --- | --- |
| överlappande par | 0 | 0 | 0 |
| ytor utanför sin zon | **2 av 2** | **4 av 4** | **8 av 8** |
| ytor inne i en grannzon | 2 | 6 | 12 |

Det är inget fel #67 införde — det är samma sak sagd i millimeter i stället för pixlar: **en 44-pxyta är fyra gånger så bred som brickan under den**, och zonen är ritad efter brickan.
Varje variant som löser #89 måste alltså flytta *zonen*, inte bara delningen.

### 2. Baslinjen, mätt om på fyra platsantal

N, tre räknare per plats, överlappande par (minsta glapp):

| | 2 platser | 4 platser | 8 platser |
| --- | --- | --- | --- |
| bordsläge 1280 × 800 | 5 (**−23,9 px**) | 11 (−25,2) | **24 (−34,9)** |
| bordsläge 1366 × 1024 | 4 (−17,7) | 8 (−20,3) | 24 (−32,1) |
| bordsläge 1920 × 1080 | 4 (−16,3) | 8 (−18,1) | 24 (−31,4) |
| TV 1920 × 1080 | 4 (−8,5) | 8 (−8,5) | 24 (−23,9) |
| TV 3840 × 2160 | **0** (+20,0) | 0 (+20,0) | 0 (**+1,1**) |

Det enda stället felet försvinner av sig självt är 4K, och där försvinner det av fel skäl: vid den skalan är brickans egna 24 mm redan bredare än 44 px, så `max(px(TOKEN_MM), 44)` slutar vara 44.
Vid åtta platser på 4K är glappet 1,1 px, alltså en hårsmån.
Hela svepet: **204 överlappande par på 45 mätpunkter** för N, 20 för A, **0 för B och 0 för C**.

### 3. A äter sin egen svans

A är den ärliga läsningen av "kuvertet får betala": zonen växer så att den rymmer sina ytor, platsen växer med zonen, och K18:s egen regel säger då att kuvertavståndet växer med platsen och filten med kuvertavståndet.

Med tre räknare blir räknarzonen 450 × 150 mm, platsen 840 mm längs kanten (mot 500) och 220 mm inåt (mot 170), kuvertavståndet 940 mm (mot 600), och filten vid åtta platser **2480 × 2080 mm** i stället för 1800 × 1400.

Och då är filten ritad i mindre skala, så delningen räcker inte längre:

| A, tre räknare, 8 platser | par | glapp | kortets kortsida | filt |
| --- | --- | --- | --- | --- |
| bordsläge 1280 × 800 | **16** | −15,7 px | **18 px** (N: 27) | 2480 × 2080 |
| bordsläge 1366 × 1024 | 2 | −6,8 | 24 (N: 36) | 2480 × 2080 |
| bordsläge 1920 × 1080 | 2 | −4,6 | 26 (N: 38) | 2480 × 2080 |
| TV 1920 × 1080 | 0 | +1,3 | 26 (N: 40) | 2480 × 2080 |
| TV 3840 × 2160 | 0 | +57,9 | 58 (N: 89) | 2480 × 2080 |

Att skruva upp delningen hjälper inte, och det går att se genom `?pitch=`, som finns just för det.
Vid 1280 × 800 och åtta platser med tre räknare:

| `?pitch=` | filt | par | glapp |
| --- | --- | --- | --- |
| 150 | 2480 × 2080 | 16 | −15,7 |
| 180 | 2660 × 2260 | 4 | −30,6 |
| 220 | 2900 × 2500 | **1** | −41,1 |
| 260 | 3140 × 2740 | 2 | −35,4 |
| 360 | 3740 × 3340 | 2 | −18,0 |
| 420 | 4100 × 3700 | 1 | −25,8 |

Paren inom en plats försvinner vid 220 mm — och då är det sista paret inte längre inom en plats utan **mellan två platser**: `counters:E` mot `counters:G`, två grannar som möts i hörnet.
A bryter dessutom K18:s egen grind redan vid sina 150 mm: `recipe-geometry.test.ts` räknar överlappande zonpar, och A ger **1** par vid fyra platser (`counters:A` mot `counters:C`) och 1 vid åtta (`counters:E` mot `counters:G`).

**A fungerar med två räknare** (0 par överallt, glapp +1,8 px i värsta fallet) och faller med tre.

### 4. B håller kuvertet och betalar med ytan framför spelaren

B rör inte en enda millimeter utanför platsens egna 500: räknarzonen växer längs kanten och `Framför` krymper med precis lika mycket.

| räknare | räknarzonen | `Framför` |
| --- | --- | --- |
| 1 | 125 × 100 mm | 365 × 100 |
| 2 | 250 × 100 | 240 × 100 |
| 3 | **375 × 100** | **115 × 100** |

Resultatet på ytorna är rent: **0 överlappande par i hela svepet**, minsta glapp +4,7 px vid det trängsta (1280 × 800, åtta platser, tre räknare), +23,3 vid 1920 och +33,3 i TV-läge.
Filten, kortet och grannarna är orörda: kortets kortsida är 27 / 36 / 38 / 39 / 88 px — exakt N:s tal.

Priset står i bilden i stället: `proto89-B-bord-rontgen-3r-1280x800.png` visar att de två korten framför spelaren inte längre får plats i en zon på 115 mm — ett kort är 63 mm brett — så det andra kortet lägger sig över räknarzonens första bricka.
Den zonen rymmer alltså ett kort, inte en yta att lägga ut spel på.

Det andra priset är att ytan fortfarande är djupare än zonen: med en zon som bara växer i en riktning sticker ytan ut 24 av 24 gånger vid 1280 × 800 och åtta platser.
Men den sticker ut **inåt mot den tomma filten** och in i noll grannzoner i hela svepet — vilket är skillnaden mot N, där 26 ytor når in i en grannzon.

### 5. C är det enda svaret som inte rör en enda millimeter

C låter brickorna ligga på varandra som en hög och ger högen en yta.
Ytan är en per plats, alltså 8 vid åtta platser i stället för 24, och paren är noll i hela svepet vid varje platsantal och varje antal räknare; minsta glapp mellan två platsers högar är +76,5 px vid det trängsta.
Filt, kuvert, kortstorlek och grannzoner är orörda per konstruktion.

Vägen till den enskilda räknaren är ringen (K14), och den blev två ringar:
`proto89-C-bord-hogring-1280x800.png` är högens ring — tre knappar, en per räknare, med namnet och värdet på knappen och antalet i navet — och `proto89-C-bord-brickring-1280x800.png` är brickans egen ring bakom den, som är `counterActs` rakt av: **−1 · +1 · Sätt värde…**, alltså exakt de verb renderarens egen ring redan ritar.
Knapparna mäter 66 px, och tre verb ligger långt inom de sju en ring rymmer (#67).

C:s pris är mätbart på tre ställen:

- **ett tryck till** för varje ändring av en räknare som inte ligger överst.
- **två värden av tre syns inte.** Högen visar det översta värdet och en bricka med antalet; `Poäng 12` och `Liv 20` står ingenstans på filten förrän ringen öppnas. På ett bord som är allas är det ett riktigt tapp — K9 låter bordet läsas på tre meters håll, och en hög kan inte läsas alls.
- **ytan är fortfarande djupare än zonen** vid 1280 × 800 och åtta platser (8 av 8 utanför, 0 i en grannzon), av samma skäl som i fynd 1: zonen är ritad efter brickan.

### 6. En delning i millimeter är olika många pixlar åt olika håll

Filten lutar under `rotateX(13deg)`, så en delning längs kanten och en delning inåt blir olika många pixlar av samma millimetrar — och vilken riktning en plats räknare löper i beror på vilken kant platsen sitter vid.
Receptet skriver i dag `x: 8 + (i % 3) * 32` oavsett kant, vilket betyder att brickorna på **öst- och västkanten redan i dag löper inåt** tvärs över en zon som är 100 mm djup, inte längs kanten.
A och B lägger dem längs kanten i stället, vilket är den axel deras zon växer på.

Följden är att ett krav skrivet i millimeter inte kan uppfyllas lika på alla fyra kanter.
Det är därför grinden måste läsa `getBoundingClientRect()` på varje bricka vid varje kant, och inte räkna på den satta storleken eller på en kant.

### 7. Vad ingen variant löser

- **Zonnamnen krockar.** Vid åtta platser ligger `FRAMFÖR` och `RÄKNARE` på varandra på öst- och västkanten i varje variant, A inräknad. Det är K18:s kända etikettkrock och en egen fråga (K9), men B gör den värre genom att göra `Framför` kortare än sitt eget namn.
- **Antalet räknare per plats är inte begränsat någonstans.** Ingen av varianterna säger nej vid fyra. Kandidaten "begränsa antalet räknare och låt wizarden säga det" ur issuet är inte prototypad som en egen variant, eftersom den inte är en bild — den är en spärr i wizarden — men varje variant ovan har ett tak som följer av sina egna millimetrar: A och B slutar fungera när `Framför` respektive filten tar slut, C har inget tak alls.

## Öppen fråga till kunden

Ingen variant är vald. Det som ska avgöras är vad en plats räknare är när de är fler än en:

- **B** om tre räknare ska ligga bredvid varandra och synas samtidigt, och ytan framför spelaren får krympa från 380 till 115 mm för det.
- **C** om filten, kuvertet och kortstorleken är oantastliga, och priset får vara ett tryck till och att två av tre värden inte står på bordet.
- **A** bara om det minsta bordsläget (1280 × 800 med åtta platser) får ges upp: A klarar två räknare överallt, men tre först från TV-läge och uppåt, och betalar med en filt på 2480 × 2080 mm och ett kort på 18 px.
