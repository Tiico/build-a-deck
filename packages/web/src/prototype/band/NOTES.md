# Bandet längst ner på `/online` — tre svar (#24, #25)

`/prototype/band?variant=A|B|C&kort=3|8|13|21`, `&bare` tar bort prototypens egen list.

Två issues, en yta, ett svar.
#24 säger att solfjädern blir en regnbåge när handen är stor, #25 att fjädern och hörnens kontroller slåss om samma fyrtio pixlar vid 390.
De hänger ihop: en fjäder som packar tätare krockar också mindre, så den som löser det ena har redan bestämt det andra.
Därför en prototyp och tre svar som skiljer sig i **vad spelaren förlorar**, inte i inställningar.

## Mätt först

Mätt i Chromium mot en riktig session (`/online`, en hand delad från draghögen, seat A), inte räknat ur issuetexten.
Bilderna ligger i `/tmp/byd-shots/band-before-<kort>-<bredd>.png`.

| kort | bredd | total båge | kortets yta | steg mellan två kort | fjäderns målade bredd | överlapp "Ada · n kort" | överlapp Ångra/Flagga/Avsluta |
| ---: | ----: | ---------: | ----------: | -------------------: | --------------------: | ----------------------: | ----------------------------: |
|    3 |  1280 |        16° |     112×156 |                68 px |                302 px |                    inget |                          inget |
|    8 |  1280 |        56° |     112×156 |                68 px |                746 px |                    inget |                          inget |
|   13 |  1280 |        96° |     112×156 |                68 px |               1140 px |          1 kort, 58×34 px |               3 kort, 182×32 px |
|   21 |  1280 |       160° |     112×156 |                50 px |               1235 px |          3 kort, 105×34 px |               5 kort, 230×32 px |
|   21 |  1440 |       160° |     112×156 |                56 px |               1392 px |          3 kort, 104×34 px |               5 kort, 228×32 px |
|    3 |   390 |        16° |     112×156 |                68 px |                302 px |          1 kort, 78×34 px |               3 kort, 208×32 px |
|    8 |   390 |        56° |       55×77 |                33 px |                366 px |          3 kort, 106×34 px |               6 kort, 236×32 px |
|   13 |   390 |        96° |       44×61 |                19 px |                366 px |          5 kort, 112×34 px |              10 kort, 236×32 px |
|   21 |   390 |       160° |       44×61 |                11 px |                355 px |          8 kort, 110×34 px |              15 kort, 235×32 px |

Fem saker som mätningen säger och issuetexterna inte gör:

**Bågen är 8° per kort utan tak, alltså (n−1)·8.**
160° vid 21 kort stämmer.
Det yttersta kortet står 80° från lodrätt, alltså nästan på sidan, och dess namn läses inte.

**Krockar med hörnen börjar långt före 21 kort.**
Vid 390 ligger kort ovanpå både `Ada · n kort` och verktygen redan vid **tre** kort.
Vid 1280 börjar det vid 13.
#25 beskriver det som ett telefonproblem; det är ett problem vid varje bredd så snart handen växer.

**Vid 390 äger hörnen hela bredden.**
`Ada · n kort` ligger 16–128 px, verktygen 138–374 px, båda i ett band 32–34 px högt vid y 794–828 av 844.
Det finns ingen ledig kolumn mellan dem att lägga en fjäder i.

**Ångra, Flagga och Avsluta är redan under grinden.**
76×32, 77×32 och 70×32 px vid varje bredd.
Det är ett brott mot 44 px som fanns före båda issuesen och som inte har med fjädern att göra — men det ligger i samma band och fixas i samma svep.

**Den minsta träffytan är steget, inte kortet.**
Ett kort täcks av de som ritas efter det, så det man kan sätta fingret på är steget till nästa: 11 px vid 21 kort på 390, 19 px vid 13, och 50 px vid 21 på 1280.

### Den geometriska sanningen som styr allt

Vid 390 px är bandet 358 px brett, och 358 px rymmer **åtta** 44‑pixelsträffytor och inte fler.
En hand på 13 eller 21 kort kan alltså inte vara **en rad med tryckbara kort på en telefon** — inte vid någon lutning, inte vid någon kortstorlek.
Vid 1280 rymmer bandet 26, så där räcker det att kapa bågen.

Det lämnar exakt tre möjliga svar på telefonen: **rulla**, **radbryt**, eller **visa dem inte hela tiden**.
A, B och C är de tre.

## Variant A — Facket

Fjädern överlever.
Bågen har tak på 30° totalt (8° per kort tills det blir för många, sedan 30/(n−1)), kortet behåller sin läsbara storlek, och steget går **aldrig** under 44 px.
Är handen bredare än bandet rullar fjädern i sidled *som fjäder*.
Hörnen lämnar bottenbandet helt: `Ada · n kort` och Ångra/Flagga/Avsluta flyttar upp i en topplist, så bandet är handens ensamt.

Mätt: 21 kort ger 30° båge och 44 px steg vid varje bredd; målad bredd 1088 px vid 1280 (får plats) och 1039 px vid 390 (rullar).
Överlapp med hörnkontrollerna: 0 px² i alla nio fallen.

**Vad det kostar spelaren.**
På en telefon ser du inte längre hela handen på en gång — vid 21 kort ser du åtta och rullar efter resten.
Rullningen konkurrerar dessutom med den gest som spelar ett kort: `/online` spelar genom att dra kortet ut ur fjädern upp på filten, och en yta som både rullar i sidled och släpper drag uppåt måste skilja på dem.
Och verktygen hamnar längst från tummen på just den skärm där tummen betyder mest, vilket är tvärtemot varför C4 la dem längst ner.

## Variant B — Remsan

K10:s svar, givet åt `/online` också.
Ingen fjäder: platta kort på rad i nästan full bredd, inget överlapp, en rad som rullar och snäpper.
Ingenting i botten är `position: fixed` — botten är en riktig kolumn: filten, sedan en kontrollrad (`Ada · n kort` till vänster, verktygen till höger), sedan remsan.
Två ytor kan inte dela en pixel när de är två rader.

Mätt: kortet är 112×156 px vid 1280 och 86×120 px vid 390, steget 120 respektive 94 px, överlapp 0 px².
Vid 390 syns fyra kort av 21 åt gången, vid 1280 tio.

**Vad det kostar spelaren.**
Fjädern är borta, och den är ett fattat beslut, inte en dekoration: K9 skriver in handfläkten som en del av bordets bild och C2:s prototyp B är just handen som fjäder vid filtens kant.
Utan den ser `/online` ut som telefonen med ett bord ovanför, inte som ett bord man sitter vid.
Man ser färre kort samtidigt än i A vid varje bredd, eftersom platta kort inte får överlappa.
Och på skrivbordet är en rad som rullar i sidled en dålig affär: musen har ingen naturlig horisontell rullning, så där kostar remsan mest och ger minst.

## Variant C — Uppslaget

Handen är en yta man kallar fram, inte en yta som alltid ligger där.
I vila är bandet en 56 px hög **handkant**: kortens överkanter, `Ada · n kort`, och en chevron — och den delar sin rad med Ångra, Flagga och Avsluta, som ligger bredvid och aldrig under.
Ett tryck (eller Enter) lyfter hela handen som ett uppslag över ett nedtonat bord: korten i rutnät i läsbar storlek, alla på en gång.
Escape eller Stäng fäller ner den.

Mätt: uppslaget visar alla 21 korten samtidigt vid både 1280 (9 kolumner × 3 rader, kort 112×156 px) och 390 (3 kolumner × 7 rader, kort 86×120 px).
Överlapp med hörnkontrollerna: 0 px² i vila och 0 px² uppfällt.
På telefonen tar uppslaget hela skärmen, och då **följer verktygen med upp i uppslagets huvud** — en yta som täcker sidans enda Ångra har gjort den onåbar, inte bara gömd.

**Vad det kostar spelaren.**
Handen syns inte medan du spelar.
Du tappar ögonvrån: att se sin hand hela tiden är halva anledningen till att en hand ritas alls, och en spelare som väntar på sin tur har inget att titta på.
Varje drag kostar en gest före draget.
Och på en bred skärm, där rummet faktiskt finns, gömmer C något som ryms — vid tre kort på 1280 är handkanten nästan tom och bordet nästan hela skärmen, vilket ser mer ut som en bugg än som ett val.

## Bägge issues, i båda bredderna

| | #24 bågen | #25 hörnkrocken vid 390 | vid 1280 |
| - | - | - | - |
| **A** | båge kapad till 30°, steg låst vid 44 px | hörnen flyttar till en topplist; bandet är handens | samma; ingen krock vid 21 kort |
| **B** | ingen båge alls | botten är två rader i flödet, inget är `fixed` | samma |
| **C** | ingen båge i vila; uppslaget är rutnät | handkant och verktyg är en rad, sida vid sida | samma |

Uppmätt överlapp mellan handen och hörnkontrollerna: **0 px² i alla 27 fallen** (3 varianter × 3 kortantal × 3 bredder).
Ingen kontroll under 44 × 44 px i någon variant.
Ingen sidscroll på sidan i någon variant.

## K16: hela handen når tangentbordet

Icke förhandlingsbart, och mätt i alla tre.
Varje variant lägger hela handen i **ett** tabbstopp med `useRoving` (samma `roving.ts` som filten och editorn använder — ingen yta skriver en egen), varje kort är en `button` med projektionens namn (`"Drake, kort i handen. Enter öppnar handlingar."`), och Enter öppnar adresspanelen.

- **A** — piltangenterna går genom fjädern; det fokuserade kortet lyfts fritt ur överlappet och `scrollIntoView` drar in det i den rullande ytan, vilket är L10:s regel för en remsa som rullar i sidled. Mätt: 20 × ArrowRight från första kortet landar på det tjugoförsta, och dess ruta är 115×161 px vid 1280 och 89×124 px vid 390, båda helt innanför den rullande ytan.
- **B** — samma, utan lyft eftersom inget överlappar. Mätt: kort 21 nås och ligger i vy vid båda bredderna.
- **C** — handkanten är tabbstoppet; Enter fäller upp uppslaget, som tar fokus till **första kortet** (inte till Stäng — uppslaget fälldes upp för att läsas), piltangenterna går i två riktningar genom rutnätet (`orientation: 'both'`, som filten), Escape fäller ner och **lämnar tillbaka fokus till handkanten**. Det är `Question.tsx`:s uppförande tillämpat på en yta, som K16 gjorde med adresspanelen. Mätt: uppfällning → `Drake`, 20 × ArrowRight → `Lo`, Escape → fokus på handkanten och uppslaget nere.

Tabbordningen i vila är i alla tre: handen som ett stopp, sedan `Ångra`, `Flagga`, `Avsluta`.
I A ligger verktygen före handen, eftersom de ligger i topplisten och läsordningen följer skärmen.

## Övrigt som gäller alla tre

- **44 px och kontrast.** Varje kontroll är minst 44 × 44 px, inklusive Ångra/Flagga/Avsluta som i dag är 32 px höga. Mätt kontrast mot sitt eget underlag: `Ada` 18,1:1, `n kort` 7,2:1, verktygen 14,8:1, `Avsluta` 6,9:1, handkantens etikett 13,7:1, kortets namn 12,9:1 — allt över AA.
- **Reduced motion.** Fjäderns lyft i A är den enda övergången och är avstängd under `prefers-reduced-motion: reduce`. B och C animerar ingenting.
- **Dold information.** Prototypen ritar bara den egna handen; filten får den genom `withoutHand`, exakt som `/online` gör, så inget annat säte ser kortnamn. Beviset hör hemma på tråden och inte här (D4, B6).
- **En renderare.** Filten är riktig `TableRenderer` i alla tre. Prototypen ritar inget bord själv (K9).
- **Bandet är layout, inte överlägg.** Alla tre tar bort `position: fixed` från både handen och hörnkontrollerna. Det är den gemensamma delen av svaret på #25 och är i praktiken redan bestämt av att tre `fixed`-lager är det som orsakar krocken.

## Vad varianterna säger om K10

K10 gäller `/play` — telefonens egen vy — och säger att svaret där är remsan.
Ingen av varianterna ändrar `/play`.

**B är den enda som gör remsan till svaret också på `/online`**, och den bör då skrivas in som en utvidgning av K10 och inte som en tyst avvikelse: en modell, två ytor.
A och C ger `/online` ett annat svar än `/play` har.
Det är inte en revidering av K10, men det är värt att säga rakt ut: en spelare som spelar på telefon via `/online` och en som spelar via `/play` får då två olika händer på samma sorts skärm.
Om det är oacceptabelt är B det enda svaret, och då är valet redan gjort.

## Rekommendation

**A — Facket, med ett lån från C.**

Skälen, i ordning.

Fjädern är beslutad, inte en smaksak.
K9 skriver in handfläkten i bordets bild och C2:s prototyp B är handen som fjäder vid filtens kant; den blev vald mot alternativ som inte hade någon.
#24 är ett fel i *hur brett* fjädern fjädrar, inte ett argument för att fjädern var fel.
Att svara på en trasig båge med att ta bort bågen är att kasta ett beslut för att en konstant saknade tak.

Vid 1280 — där `/online` faktiskt lever, eftersom det är distansvyn med både bord och hand i ett fönster — löser A allt utan att ta något.
Bågen blir 30°, alla 21 korten syns, alla namn läses, steget är 44 px, och krocken försvinner för att hörnen flyttar.
B och C ger där bort något (fjädern respektive handens närvaro) för ett problem som inte finns vid den bredden.

Vid 390 är A:s pris det minsta av de tre möjliga.
Rullning kostar dig sikten över de kort som inte får plats; B kostar dig detsamma **och** fjädern; C kostar dig handen närvaro hela tiden.

**Lånet från C:** ta med uppslaget som ett *andra* läge i A, inte som grundläge.
Handen är fjäder som förut, och en `Visa alla`-knapp (och en tangentväg) fäller upp exakt C:s rutnät när man vill se allt på en gång.
Då är C:s enda verkliga vinst — hela handen läsbar samtidigt vid vilket antal som helst — kvar, medan dess pris betalas bara av den som ber om det.
Det är samma mönster som K8:s "håll för att förstora" och K16:s panel: grundytan är direkt, och det som inte får plats i den kallas fram.

**Ett förbehåll.** Om produktägaren anser att `/online` på en telefonskärm ska vara oskiljbart från `/play`, faller resonemanget och B är svaret. Det är den enda frågan som kan vända rekommendationen.

## Kvar att avgöra med produktägaren

1. **`/online` vid 390 kontra `/play`.** Ska de vara samma hand? Om ja → B, och K10 skrivs om till att gälla båda. Om nej → A eller C, och det bör stå i K9 varför distansvyn har en egen hand.
2. **Var hör Ångra, Flagga och Avsluta hemma?** A flyttar dem upp; B och C låter dem stanna i botten bredvid handen. C4 la dem i botten för tummens skull. A:s topplist är den enda punkt där prototypen medvetet går emot det, och det är ett beslut och inte en detalj.
3. **Rullning kontra dragning i A.** Att dra ett kort uppåt spelar det, att dra i sidled rullar fjädern. Prototypen visar bara ytan; gestkonflikten måste lösas innan A byggs, och den lösningen (riktningströskel, eller rullning bara via handtag/piltangenter) bör godkännas som en del av valet.
4. **Ska bågens tak vara 30°?** 30° är valt för att handen ska läsas som en hand snarare än som en båge. 24° packar hårdare, 40° ser mer ut som ett riktigt kortfack. Det är en siffra i `fan.ts` och lätt att ställa in efter att modellen är vald.
5. **Ångra/Flagga/Avsluta under 44 px är ett eget fynd.** Det fanns före #24 och #25 och gäller `/online` oavsett vilken variant som vinner. Ska det bli en egen issue, eller följa med den här implementationen?

## Svar

<!-- Produktägarens beslut skrivs här. -->
