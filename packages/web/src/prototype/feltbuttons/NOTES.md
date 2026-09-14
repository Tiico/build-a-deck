# Prototyp #90 — vad filten är i knappspråket

Slängkod.
Rutten är `/prototype/filtens-knappar`, positionerna växlas med `?proto=`, ytan med `?yta=bord|tv`, platsantalet med `?seats=`, och scenen med `?scen=filt|ark`.
Skärmbilderna och rådata ligger i `docs/issues/proto90-*`.

Körs så här, från en egen port:

```
pnpm --filter @byd/web exec vite --port 5467 --strictPort
node packages/web/src/prototype/feltbuttons/shots.mjs http://localhost:5467
```

## Frågan

L13 band de tre rollerna — primär, sekundär, valt — på fem ytrötter, och filten är ingen av dem.
En `.byd-primary` på filten hittade därför ingen bindning och föll tillbaka på webbläsarens grå `buttonface`.
#67 (`950fcdd`) har sedan dess bundit `.byd-table` till samma gröna som `.byd-account`/`.byd-join`, därför att den behövde **en** knapp: `Sätt värdet` i räknarens sifferark.
Ringens egna skivor i `table.css` talar fortfarande sin egen dialekt.

Den bindningen gjordes av den som råkade behöva den först, inte som en yta i språket — vilket är precis det #90 säger inte får hända.
Frågan står alltså kvar: **binder filten de tre rollerna till en accent den äger, och vilken — eller står den medvetet utanför språket, som `status.css`, och ska då stå skrivet i L13?**

## Scenerna, och varför de är två

`?scen=filt` håller **två ringar öppna samtidigt**: räknarens ring på brickan vid den bortre kanten, där varje skiva landar på filtens gröna, och kortets ring på kortet vid den närmaste kanten, där skivorna når ut över träramen och ner på det mörka omlandet.
Det är hela poängen med att mäta på filten i stället för i en fixtur: **grunderna är olika**, och L13 kräver talet mot den yta en sak faktiskt landar på.
`?scen=ark` öppnar det riktiga `CounterEntry` med `Avbryt`/`Sätt värdet`, och där står alla tre roller i samma vy.

Två saker på skärmen är prototypens egna instrument och inte förslag:

- **Provet** (`Dela ut` · `Blanda` · `Visa värden`), tre knappar mitt på filtens golv.
  Produkten ritar i dag ingen knapp på det gröna alls — arkets två står på arkets eget mörker — så utan provet hade accenten aldrig mätts som **fyllning på filten**, vilket är hela #90.
  `button-language.test.tsx` använder samma grepp av motsatt skäl: en sond är hur man frågar en yta vad den binder.
- **Det påhittade valet** i arket (`Sätt till` / `Ändra med`).
  Filten har ingen tvåvägskontroll i dag, så det finns ingenting verkligt att hänga den tredje rollen på.
  Paret är rimligt — säger tangenterna värdet rakt ut eller hur mycket det ska ändras — och finns för att alla tre roller ska stå i en vy. Det är en uppfinning och inget förslag.

En avstängd skiva (`Avslöja`, `opacity: 0.35` i `table.css`) mäts och redovisas men räknas inte mot gränserna: WCAG undantar en inaktiv kontroll, och blekningen är densamma i alla fyra positioner.

## Så mäts kontrasten

**Grunden samplas ur de målade bildpunkterna, inte ur en deklaration.**
Sidan fotograferas, PNG:en lämnas tillbaka in i sidan som en `data:`-URL, ritas på en canvas, och grunden under och bredvid varje knapp läses ur `getImageData`.
Filten är en `radial-gradient` och ringens platta är genomskinlig; ingen av dem har en `background-color` som en beräknad stil skulle rapportera, så en beräkning uppåt i föräldrakedjan hade missat båda.
Knappens **egen** färg och linje läses däremot ur den beräknade stilen och komponeras ovanpå den samplade grunden, eftersom en bokstavs egna bildpunkter är kantutjämnade mot grunden och att sampla dem vore att mäta kantutjämningen.
Elementets `opacity` vägs in i bläckets och linjens alfa.

Mätningen är `measure.ts` — samma kod som raden längst ner på skärmen använder — nådd genom `window.proto90`, så det finns en implementation och inte två.
Svepet: fyra positioner × två ytor × två skärmar × två scener × 2/4/8 platser = **96 mätpunkter, 1 248 knappar, 253 under L13:s gränser**.
Antalet skrivs ut, så en tom lista inte kan gå igenom, och skriptet kastar om en mätpunkt läser noll knappar eller föll tillbaka på beräknad grund.

## Positionerna

| | primär | sekundär | valt | ringens skivor | fall i svepet |
| --- | --- | --- | --- | --- | --- |
| **N** Nuläget | `#7dd3a0` / `#0b2a18` (kontots) | `#6f7a90` / `#dce3f2` | `#7dd3a0` | egen dialekt i `table.css` | 78 |
| **A** Egen accent | **`#f0b64a` / `#1c1c1c`** (brickans) | **`#f3e9d6`** (filtens kritfärg) | `#f0b64a` | in i rollerna | **23** |
| **B** Spelarens rum | `var(--byd-accent)` = `#7dd3a0` | `#6f7a90` / `#dce3f2` | `#7dd3a0` | in i rollerna | 56 |
| **C** Utanför språket | dialektens `--byd-felt-keep` | — (dialekten har ingen kantad form) | dialektens `--byd-felt-mark` | egen dialekt, orörd | 96 |

A:s accent är inte gissad.
Filtens gröna är **grunden**, så accenten kan inte vara den gröna.
`#f0b64a` är brickans egen färg, ligger redan på den här filten, läses redan på tre meters håll (K9) och bär redan `#1c1c1c` som bläck (`.byd-token`).
Linjen och sekundärens bläck är den kritfärg filten redan skriver zonnamn och högantal i, `#f3e9d6`.

B är skriven med spelarens egna tokennamn (`--byd-accent`, `--byd-on-accent`, `--byd-ink-strong`) för att det ska synas att det är `.byd-player`:s rum och inte ett nytt.

C binder inga tokens alls: sidans rot bär **inte** `.byd-table` i den varianten, så en roll-klass där löser sig till ingenting — vilket är varför C måste rita varje kontroll själv, och varför den riktiga ändringen vore att ta bort roll-klasserna ur `CounterEntry` och inte att måla om dem.

## Vad prototypen avslöjade

### 1. #67:s bindning ÄR position B, fattad utan att sägas

`.byd-player` binder `--byd-primary-bg: var(--byd-accent)`, och `player.css` sätter `--byd-accent: #7dd3a0`.
`.byd-table` binder `#7dd3a0`.
Sex tokens, sex identiska värden.

**#67 valde alltså inte en accent åt filten — den lånade spelarens, genom att kopiera kontots.**
Skillnaden mellan N och B i den här prototypen är därför inte en enda färg, utan bara om ringens skivor följer med in i språket.
Det är inget fel i #67; det är exakt det #90 förutsåg: en yta i språket avgjord i förbifarten.

### 2. Språkets delade sekundärlinje faller på det gröna, och bara där

`--byd-secondary-line: #6f7a90` är L13:s egen mätta linje — 3,86:1 mot arkets `#1b1e27`, och den håller.
På filtens gröna mäter samma linje **1,60:1**.

| `Blanda` (sekundär) i provet | bordsläge 1280 | bordsläge 1920 | TV 1920 | TV 3840 |
| --- | --- | --- | --- | --- |
| N och B (`#6f7a90`) | **1,60** | **1,60** | 4,06 | 4,06 |
| A (`#f3e9d6`) | 5,73 | 5,73 | 14,57 | 14,57 |

Det är samma tal L13 självt kallade osynligt när den beskrev editorns `#3b414e` (1,48:1) och wizardens `#cbcabe` (1,48:1).
Det märks inte i dag av exakt ett skäl: den enda sekundären på filten (`Avbryt`) står **inne i arket**, på arkets mörker, och aldrig på filten.
Första knappen som ritas på det gröna avslöjar det.

TV-läget döljer felet, eftersom TV-filten är `#151924` och inte grön.
**En bindning som bara mäts i TV-läge går igenom och är ändå fel.**

### 3. Ringens dialekt håller inte 3:1 mot någon grund alls

`table.css` ritar skivan som `#171a23` med kanten `#3b4358`.
Över hela svepet, N och C (som båda behåller dialekten):

| | linje mot grunden | under 3:1 | plattan mot grunden | texten |
| --- | --- | --- | --- | --- |
| ringens skivor | 1,01–2,72:1 | **72 av 72** | 1,02–4,80:1 | 17,38:1 |

Texten är oklanderlig — vitt på en nästan svart platta är 17,38:1 var den än står.
Men **kanten som säger var skivan slutar klarar inte 3:1 en enda gång**, och plattan når 1,02:1 mot TV-filten, alltså en skiva utan synlig gräns.
Det är en avvikelse som finns i dag, i nuläget, och som ingen av positionerna ärver bort utan att någon bestämmer något: N och C behåller den, A och B byter ut den mot roller.

### 4. Att lyfta in ringen i språket kostar skivans platta

A och B ritar skivan som språkets kantade form — genomskinlig fyllning, en linje, bläck.
Linjen blir mycket bättre (A: 9 fall av 72 mot N:s 72 av 72; B: 36 av 72).
Men plattan försvinner, och **en skiva som landar på ett kort blir oläslig**:

| skiva över ett kortansikte (`#eacde3`) | text |
| --- | --- |
| N (ogenomskinlig platta) | 17,38:1 |
| A (kantad, kritfärg) | **1,22:1** |
| B (kantad, `#dce3f2`) | **1,14:1** |

Kortets ring öppnas per definition **på ett kort**, så det här är inte ett olycksfall i prototypen utan ringens normalfall: 14 av 72 skivor i både A och B faller på texten, alla över ett kortansikte eller en ljus fläck på filten.

Det pekar på ett svar som ingen av de fyra positionerna är: **låt rollen bestämma färgerna och låt ringen behålla sin platta som form.**
L13 säger att rollen bärs av vikt, storlek och form och att ingen kulör flyttar — den säger inte att en kantad knapp måste vara genomskinlig, men `buttons.css` skriver `background: transparent`, och det är den raden som kostar här.

### 5. A är inte bredare marginal på fyllningen — den är bredare marginal på linjen

A:s fyllning på det gröna mäter 3,67–3,78:1 och B:s 3,74–3,84:1.
**Hue hjälper inte: guld och grönt har nästan samma ljushet.**
Båda klarar 3:1 som grafik, ingen av dem med mycket över.

Skillnaden ligger i linjen och i bläcket.
A:s kritfärg mäter 5,65–5,97:1 som text på filten och 5,73–14,57:1 som linje; den föll en enda gång i hela svepet, 4,37:1, när en skiva landade på filtens ljusaste fläck (`#4b755b`) vid åtta platser på 1920.
Det är en hårsmån under 4,5, och det säger att **även A:s kritfärg står nära gränsen på en filt som inte är jämn.**

### 6. C har ingen platta som fungerar på båda filtarna

C är ärlig i arket: 0 fall, texten 8,61–16,65:1.
På filten faller den:

| C:s prov på filten | bordsläge | TV |
| --- | --- | --- |
| `Blanda`, plattan `#171a23` mot grunden | 2,52:1 | **1,01:1** |
| `Blanda`, kanten `#3b4358` | 1,43:1 | 1,78:1 |
| `Visa värden`, kanten | 2,38:1 | **1,01:1** |

Dialektens platta är ritad för en ring som ligger **ovanpå** filten med en skugga under sig, inte för en knapp som ligger **på** den.
Mot TV-filtens `#151924` är `#171a23` samma färg.
C kostar alltså inte bara en mening i L13 — den kostar en egen mätning och minst en ny färg, och då är den en yta i språket i allt utom namnet.

C har dessutom ingen kantad form alls, vilket syns i arket: `Avbryt` måste ritas som en av sifferarkets tangenter (`proto90-C-bord-arket-1280x800.png`), så de två vägarna ut slutar läsas som ett par av första och andra handling.

### 7. Arket är rent i alla fyra positionerna

192 knappar per position i arket, **noll under gränsen i alla fyra**, texten 8,61–16,65:1.
Det är värt att säga rakt ut: **det #67 byggde fungerar.**
Hela frågan ligger utanför arket, på det gröna och i ringen.

## Vad varje position kostar

- **N** — ingenting att bygga, och två kända fel som ärvs vidare: sekundärlinjen 1,60:1 på det gröna och ringens kant under 3:1 på varje grund. Filten står fortfarande inte skriven i L13, så nästa yta tar beslutet i förbifarten igen.
- **A** — en accent till i verktyget, och brickans guld får två betydelser: "en räknare" och "första handlingen". Kritfärgen står nära 4,5 på filtens ljusaste fläckar. Vinsten är 23 fall mot N:s 78, och att filten blir en yta någon har bestämt.
- **B** — ingen ny färg, och en verbknapp ser likadan ut i handen och på bordet. Priset är att spelarens rum är ritat för en mörk telefon: dess linje är osynlig på grönt (1,60:1), och dess gröna fyllning står på en grön grund med 3,84:1.
- **C** — en mening i L13 och inga tokens, men dialekten måste då mätas och lagas: ingen platta fungerar på både bordsfilten och TV-filten, och utan kantad form kan arket inte rita ett par av första och andra handling.

## Öppen fråga till kunden

Ingen position är vald.
Det som ska avgöras är två saker, och den andra faller ur den första:

1. **Är filten ett rum i språket?** Om ja: **A** om accenten ska vara filtens egen (brickans guld, med den dubbla betydelsen som pris), **B** om den ska vara spelarens gröna (och då ska `--byd-secondary-line` få ett eget värde på filten, för `#6f7a90` går inte). Om nej: **C**, och då ska L13 få meningen, och dialekten en mätning och en ny platta.
2. **Ska #67:s bindning stå kvar?** Att låta den stå är att välja B utan att skriva det. Att ta bort den är att göra `Sätt värdet` grå igen tills frågan är avgjord. Att skriva om den är A eller C.

Och en fråga som inte är en av de fyra: **ska en kantad knapp behålla en ogenomskinlig platta när den ligger på filten?**
Den avgör om ringen alls kan komma in i språket, och den kan besvaras oberoende av vilken accent som väljs.
