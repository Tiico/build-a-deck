# UX-granskning av editorn: interaktionerna, 16 september 2026

Samma dag granskades editorn som yta — håller den sig i fönstret, är dess kanter konsekventa — och det gav åtta fynd i [2026-09-16.md](2026-09-16.md) och issues [#126](https://github.com/Tiico/build-a-deck/issues/126)–[#133](https://github.com/Tiico/build-a-deck/issues/133).
Den här granskningen tar vid där den slutar och frågar något annat: **vad händer när man tar i editorn?**
Dra i en kolumnkant, flytta ett element på kortet, sätta markören i en cell, avbryta ett drag, göra samma sak med tangentbordet.

Sju fynd, varav tre höga.
Det tyngsta är att **en knapp på 44 × 44 px ligger genomskinlig ovanpå halva cellen den hör till, och ett klick där markören hör hemma skriver ett `{` in i kortet**.
Det näst tyngsta är att **ett drag i en kolumnkant ändrar fyra kolumner man inte rörde**.
Fem interaktiva prototyper visar förslagen.

## Omfattning och metod

Den riktiga webbappen mot den riktiga lokala HTTP/WebSocket-tjänsten och Chromium-renderaren, med minneslagring, auth-bypass och syntetiska data.
Testleken är `spelkortDoc` — **Sal's Saloon**, 77 kort i åtta korttyper, fem fält och elva zoner.
Inga riktiga konton, mejl eller personuppgifter.

Mätningarna är gjorda med pekarautomation i Chromium, inte lästa ur koden: varje drag är ett riktigt `pointerdown`/`pointermove`/`pointerup`, varje tangenttryck ett riktigt `keydown`, och bredder och rektanglar är lästa av sidan mellan stegen.
Där ett fynd säger att någonting inte händer är det prövat och inte antaget.

Bredderna följer kontrollmatrisen för editorn (L12): **1280 och 1024** som de bindande, **1440** som det vanliga skrivbordet, **1920** där extra yta är en del av frågan.
Editorn är skrivbordsförst, så inget fynd nedan gäller telefonbredder — men tillgängligheten gäller fullt ut, och två av fynden är tangentbordsfynd.

Ej granskat: PDF/POD, import och export, bildbiblioteket, Postgres, R2 och riktig pekskärm.

| Yta | Vad som prövades | Fynd |
| --- | --- | --- |
| Datafliken, cellen | markören, `{ }`-knappen, klick i slutet av ett värde | 1 |
| Datafliken, kolumnkanten | drag, dubbelklick, `Alt`+`Skift`+pil, autoskroll, `Escape`, `pointercancel` | 2, 3 |
| Datafliken, i sidled | skroll, rubrikrad, radens identitet | 6 |
| Mallen, duken | drag, hjälplinjer, `Escape`, `Ctrl+Z`, pilarna, `Backspace` | 3, 4, 5 |
| Mallen, lagerlistan | drag, släppmarkör, `Alt`+pil, rutnätets pilar | 5 |
| Mallen, skalan | förstoring, px per millimeter i fyra bredder | 7 |

Två saker prövades och visade sig vara i sin ordning, och står här för att de inte ska prövas igen: **lagerlistans släppmarkör finns** (en 2 px blå linje på raden man är över), och **bredden sägs** när en kolumn ändras (`title är 987 px bred` i en artig live-region).

## Fynd i prioritetsordning

### 1. Hög · `{ }`-knappen ligger genomskinlig ovanpå halva cellen

Ställ markören i en `title`-cell och klicka sedan i slutet av värdet, där markören hör hemma.
Det skriver ett `{` in i kortet.

Knappen **Sätt in en ikon** är ritad för att vara en liten platta med en gul `{ }` i hörnet av cellen.
Den är i själva verket 44 × 44 px, genomskinlig och grå, och dess 10 px stora glyf ligger rakt ovanpå cellens eget värde.

| Kolumn | Cellens bredd | Knappen täcker | Kvar åt värdet |
| --- | --- | --- | --- |
| `typ` | 64 px | 39 px (**61 %**) | 25 px |
| `title` | 87 px | 44 px (**51 %**) | 43 px |
| `raritet` | 73 px | 44 px (**60 %**) | 29 px |
| `body` | 705 px | 44 px (6 %) | 661 px |

Orsaken är en krock i kaskaden, inte ett beslut.
`.byd-data-icon` (0,1,0) säger `background: #1b1d23`, `color: #ffd98a` och `padding: 1px 5px`.
`.byd-data button` (0,1,1) står senare och är mer specifik, och säger `background: transparent`, `border: 0`, `color: var(--byd-editor-quiet)` och `padding: 6px 10px`.
Ovanpå det sätter `.byd-editor button` `min-width: var(--byd-tap)` och samma regel `min-height`, så plattan som var 25 px bred blir 44 × 44.

[Närbild](2026-09-16-interaktioner/i1b-ikonknapp-narbild.png) · [i cellen](2026-09-16-interaktioner/i1-ikonknapp-over-cellen-1440.png) · [prototyp](2026-09-16-interaktioner/prototyper/01-ikonknappen.html)

### 2. Hög · Att dra i en kolumnkant ändrar fyra kolumner man inte rörde

Dra `typ`-kolumnens högerkant 150 px åt höger vid 1440 × 900.

| Kolumn | Före | Efter | |
| --- | --- | --- | --- |
| `typ` | 64 px | 214 px | den du drog |
| `id` | 200 px | 180 px | −20 |
| `title` | 87 px | 69 px | −18 |
| `body` | 705 px | 613 px | −92 |
| `grupp` | 126 px | 106 px | −20 |

`title` var redan för smal för sina värden och blir smalare av att `typ` görs bredare.
`id` och `grupp` har ingen egen kant att dra i — de är verktygets kolumner — och ändå hoppar båda exakt 20 px så fort någon bredd är satt, och tillbaka i samma ögonblick som den sista satta bredden lämnas tillbaka.
Det är reversibelt och inte en spärrhake, men det är också inte det draget sa att det skulle göra.

Två saker till på samma kant:

- **Draget autoskrollar inte.** En kolumn dragen till fönstrets kant gjorde tabellen 3 259 px bred i en ruta på 1 408, medan `scrollLeft` stod kvar på 0. Pekaren tar slut vid fönsterkanten och draget måste släppas, skrollas och tas om.
- **Draget kan inte ångras medan det pågår** — se fynd 3.

Dubbelklick på kanten lämnar tillbaka bredden till mätningen, och `Alt`+`Skift`+pil flyttar kanten 16 px i taget; båda fungerar.

[Före](2026-09-16-interaktioner/i2-kolumner-fore-1440.png) · [efter](2026-09-16-interaktioner/i2-kolumner-efter-1440.png) · [prototyp](2026-09-16-interaktioner/prototyper/02-kolumndraget.html)

### 3. Medel · Det finns ingen väg ut ur ett drag

`Escape` avbryter ingenting, i någon av editorns två dragytor.

| Drag | Vid `Escape` | Efter släpp |
| --- | --- | --- |
| Kolumnkanten, dragen 200 px | 244 px | 244 px |
| Elementet på duken, draget 60 px | x 573 | x 573 |

Det som finns är `Ctrl+Z` efteråt, och det fungerar — men det är en annan sak: ett ångrat drag är en rad i historiken, ett avbrutet drag är inget som hänt.

Kolumndraget avslutas dessutom inte av `pointercancel`.
En penna som lyfts, en systemgest eller ett avbrutet pekdrag lämnar draget igång tills ett `pointerup` kommer, och rubriken kan under tiden varken dras eller sorteras.

Det här hör ihop med [#133](https://github.com/Tiico/build-a-deck/issues/133), där `Escape` inte stänger historiken eller **Vem har spelet**: samma tangent, samma tystnad, två olika ställen.

### 4. Hög · `Backspace` tar bort det valda lagret varifrån som helst, utan att fråga

Välj ett lager i mallens lagerlista.
Ställ fokus var som helst i editorn som inte är ett fält — en knapp i verktygsraden, en flik, en gruppremsa.
Tryck `Backspace`.

Lagret är borta.
Ingen fråga, ingen bekräftelse, ingenting sagt i någon live-region.
I mätningen försvann `typ` — elementet som ritar korttypen på alla 77 kort — och antalet lager gick från 13 till 12.

Det bryter mot editorns egen vana på två andra ställen:

- **Ett kort** frågar innan det tas bort (L9).
- **En kolumn** frågar innan den tas bort, och säger dessutom vad den tar med sig: hur många kort som har ett värde i den och hur många element som ritade den.

Ett element i mallen är den största av de tre — det gäller varje kort som ärver det — och är den enda som inte frågar.
`Ctrl+Z` tar tillbaka det, men bara om man märkte vad som hände.

[Före](2026-09-16-interaktioner/i4-lager-fore-backspace-1440.png) · [efter](2026-09-16-interaktioner/i4-lager-efter-backspace-1440.png)

### 5. Medel · Tangentbordet kan välja ett element men inte flytta det

Fyrtio tabbstopp genom editorn når aldrig ett element på kortet.
`.byd-drag-box` har varken `tabindex`, `role` eller `aria-label`, och det har inte handtagen heller, så duken finns inte för ett tangentbord.

Vägen in är lagerlistan, som är ett riktigt `role="grid"` med rovande tabbindex och gör sin sak bra.
Men lagerlistans egna pilar flyttar fokus mellan cellerna och stoppar därmed pilarna från att nå elementet:

| Var fokus står | `→` | Elementet |
| --- | --- | --- |
| Lagerlistan (där man väljer) | rutnätet tar pilen | x 617 → 617 |
| Verktygsraden (en knapp som inte har med saken att göra) | ingen tar pilen | x 617 → 621 |

Alltså: den enda platsen ett tangentbord kan välja ett element från är den enda platsen varifrån det inte går att flytta det.
Man måste först tabba bort till någonting orelaterat.

Hjälptexten under lagerlistan säger `Dra ett lager för att ändra ordningen, eller håll Alt och tryck pil upp eller ner. F2 byter namn på lagret.` — den säger ingenting om att flytta elementet, vilket stämmer med vad som går.

`Alt`+pil upp/ner flyttar ordningen och fokus följer med; det fungerar.

[Prototyp](2026-09-16-interaktioner/prototyper/04-tangentbordet-pa-duken.html)

### 6. Medel · Ingenting står stilla i sidled i korttabellen

Rubrikraden är `position: sticky` uppåt, vilket är rätt.
I sidled är ingenting fäst.

Med `body` satt till 1 400 px blir tabellen 2 178 px i en ruta på 1 408, och vid full skroll ligger `id` **770 px utanför bild**.
Med `title` dragen till 987 px blir tabellen 3 259 px, och då är `id` 1 791 px bort.
Man skriver i `body` på en rad utan att kunna se vilket kort raden är.

Det finns en mildring, och den är bra så långt den räcker: ett chips över tabellen säger `← 3 kolumner till vänster: id, typ, title` och skrollar tillbaka en rutbredd i taget.
Men den kostar platsen man stod på, och den svarar på en annan fråga än den som ställs mitt i en mening.

[Vänsterkant](2026-09-16-interaktioner/i3-sidled-vanster-1440.png) · [högerkant](2026-09-16-interaktioner/i3-sidled-hoger-1440.png) · [prototyp](2026-09-16-interaktioner/prototyper/05-sidled.html)

### 7. Låg · Duken har ingen förstoring alls

Kortet passas in i scenens höjd, och det är det enda som bestämmer skalan.

| Fönster | En millimeter är | Kortet ritas |
| --- | --- | --- |
| 1024 × 768 | 7,07 px | 445 × 607 |
| 1280 × 800 | 8,71 px | 549 × 748 |
| 1440 × 900 | 8,71 px | 549 × 748 |
| 1920 × 1080 | 10,95 px | 690 × 940 |

Det finns inget reglage, ingen procentsats, ingen `Ctrl`-rulle och inget **Passa in** — ordet förstoring finns inte i gränssnittet.
Enda sättet att se ett detaljmått större är att göra webbläsarfönstret högre.

Vid 1440 är den minsta nudgen (0,5 mm) 4,4 px, raritetsbrickan på 24 × 6 mm ritas 209 × 52 px, och handtagen som ändrar den är 19 px — större än många av de mått en formgivare sitter och petar på.
Samtidigt står 323 px av scenens bredd oanvänd som rutmönster.

[Nu](2026-09-16-interaktioner/i5-duken-nu-1440.png) · [prototyp](2026-09-16-interaktioner/prototyper/06-forstoring.html)

## Prototyper

Fem fristående sidor, en per fynd som ändrar ett beteende.
Varje sida växlar mellan **Nu** och förslaget i krönet och mäter sig själv medan man håller på.
De öppnas direkt i en webbläsare och behöver ingen server.

| Fil | Fynd | Vad den visar |
| --- | --- | --- |
| [`01-ikonknappen.html`](2026-09-16-interaktioner/prototyper/01-ikonknappen.html) | 1 | Nu · egen ränna · bara där den får plats |
| [`02-kolumndraget.html`](2026-09-16-interaktioner/prototyper/02-kolumndraget.html) | 2, 3 | Passa in i rutan mot dra bara din kolumn, med autoskroll och `Escape` |
| [`04-tangentbordet-pa-duken.html`](2026-09-16-interaktioner/prototyper/04-tangentbordet-pa-duken.html) | 4, 5 | Elementet som eget tabbstopp med flyttläge, och en fråga före `Backspace` |
| [`05-sidled.html`](2026-09-16-interaktioner/prototyper/05-sidled.html) | 6 | Bocken och `id` fästa i sidled |
| [`06-forstoring.html`](2026-09-16-interaktioner/prototyper/06-forstoring.html) | 7 | Reglage, `Ctrl`-rulle, **Passa in** och **100 %** |

## Disposition

Alla sju är publicerade som issues; ingen ändring är gjord i koden inom ramen för granskningen.

| Fynd | Issue | Märkning |
| --- | --- | --- |
| 1 · `{ }`-knappen över cellen | [#140](https://github.com/Tiico/build-a-deck/issues/140) | HITL |
| 2 · Kolumndraget ändrar grannarna | [#141](https://github.com/Tiico/build-a-deck/issues/141) | HITL |
| 3 · Ingen väg ut ur ett drag | [#142](https://github.com/Tiico/build-a-deck/issues/142) | AFK |
| 4 · `Backspace` tar lagret | [#143](https://github.com/Tiico/build-a-deck/issues/143) | AFK |
| 5 · Tangentbordet når inte duken | [#144](https://github.com/Tiico/build-a-deck/issues/144) | HITL |
| 6 · Ingenting fäst i sidled | [#145](https://github.com/Tiico/build-a-deck/issues/145) | HITL |
| 7 · Ingen förstoring | [#146](https://github.com/Tiico/build-a-deck/issues/146) | HITL |
